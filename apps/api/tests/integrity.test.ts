import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/prisma.js';
import { api, resetDatabase, saveDay, seedFixture, type Fixture } from './helpers.js';

/**
 * Validation and data-integrity rules, exercised through the HTTP API so that they are
 * proven to hold for a caller that never touches the web app.
 */

let fixture: Fixture;

beforeEach(async () => {
  await resetDatabase();
  fixture = await seedFixture();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('input validation on the server', () => {
  it('rejects a negative examination count', async () => {
    const response = await saveDay(fixture, '2026-09-01', -1, 5);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a negative fee', async () => {
    const response = await api.post(`/api/clinics/${fixture.clinicId}/prices`).send({
      serviceId: fixture.examinationId,
      fee: '-10',
      effectiveFrom: '2030-01-01',
    });
    expect(response.status).toBe(400);
  });

  it('rejects a fractional count', async () => {
    const response = await saveDay(fixture, '2026-09-01', 2.5, 1);
    expect(response.status).toBe(400);
  });

  it('requires a date', async () => {
    const response = await api.put('/api/daily').send({
      clinicId: fixture.clinicId,
      lines: [{ serviceId: fixture.examinationId, quantity: 1 }],
    });
    expect(response.status).toBe(400);
  });

  it('rejects a date that is not on the calendar', async () => {
    const response = await saveDay(fixture, '2026-02-30', 1, 1);
    expect(response.status).toBe(400);
  });

  it('requires a clinic that exists', async () => {
    const response = await api.put('/api/daily').send({
      clinicId: 99_999,
      date: '2026-09-01',
      lines: [{ serviceId: fixture.examinationId, quantity: 1 }],
    });
    expect(response.status).toBe(404);
  });

  it('rejects the same service twice in one day', async () => {
    const response = await api.put('/api/daily').send({
      clinicId: fixture.clinicId,
      date: '2026-09-01',
      lines: [
        { serviceId: fixture.examinationId, quantity: 3 },
        { serviceId: fixture.examinationId, quantity: 4 },
      ],
    });
    expect(response.status).toBe(400);
  });
});

describe('duplicate prevention', () => {
  it('updates the existing record instead of creating a second one', async () => {
    await saveDay(fixture, '2026-09-01', 10, 5);
    const second = await saveDay(fixture, '2026-09-01', 12, 3);

    expect(second.status).toBe(200);
    expect(second.body.activity.examinationCount).toBe(12);
    expect(second.body.activity.totalDailyIncome).toBe('4200.00');

    const count = await prisma.dailyActivity.count({
      where: { clinicId: fixture.clinicId },
    });
    expect(count).toBe(1);
  });

  it('is idempotent when the same payload is sent twice', async () => {
    const first = await saveDay(fixture, '2026-09-01', 10, 5);
    const second = await saveDay(fixture, '2026-09-01', 10, 5);
    expect(second.body.activity.totalDailyIncome).toBe(first.body.activity.totalDailyIncome);
    expect(await prisma.dailyActivity.count()).toBe(1);
  });
});

describe('pricing rules enforced by the database', () => {
  it('refuses overlapping price periods for the same clinic and service', async () => {
    const response = await api.post(`/api/clinics/${fixture.clinicId}/prices`).send({
      serviceId: fixture.examinationId,
      fee: '400.00',
      // The seeded period is open-ended from 2026-01-01, so this overlaps it.
      effectiveFrom: '2026-06-01',
    });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('PRICE_PERIOD_OVERLAP');
  });

  it('allows a non-overlapping period for a different service', async () => {
    const service = await prisma.service.create({
      data: { code: 'FOLLOW_UP', nameEn: 'Follow-up', nameAr: 'متابعة', sortOrder: 3 },
    });
    const response = await api.post(`/api/clinics/${fixture.clinicId}/prices`).send({
      serviceId: service.id,
      fee: '150.00',
      effectiveFrom: '2026-01-01',
    });
    expect(response.status).toBe(201);
  });

  it('rejects a period that ends before it starts', async () => {
    const response = await api.post(`/api/clinics/${fixture.clinicId}/prices`).send({
      serviceId: fixture.examinationId,
      fee: '400.00',
      effectiveFrom: '2030-06-01',
      effectiveTo: '2030-01-01',
    });
    expect(response.status).toBe(400);
  });

  it('refuses to book income on a date with no configured fee', async () => {
    // The seeded prices start on 2026-01-01, so 2025 has no fee.
    const response = await saveDay(fixture, '2025-12-31', 5, 2);
    expect(response.status).toBe(422);
    expect(response.body.error.message).toMatch(/No fee is configured/i);

    expect(await prisma.dailyActivity.count()).toBe(0);
  });
});

describe('stored figures cannot drift from the formula', () => {
  it('keeps the day total equal to the sum of its lines', async () => {
    await saveDay(fixture, '2026-09-01', 7, 3);

    const activity = await prisma.dailyActivity.findFirstOrThrow({
      where: { clinicId: fixture.clinicId },
      include: { lines: true },
    });
    const sum = activity.lines.reduce(
      (total, line) => total.plus(line.lineTotal),
      activity.lines[0]!.lineTotal.minus(activity.lines[0]!.lineTotal),
    );
    expect(activity.totalIncome.toFixed(2)).toBe(sum.toFixed(2));
    expect(activity.totalIncome.toFixed(2)).toBe('2700.00');
  });

  it('refuses a line whose stored income does not equal count x fee', async () => {
    await saveDay(fixture, '2026-09-01', 7, 3);
    const line = await prisma.dailyActivityLine.findFirstOrThrow({
      where: { serviceId: fixture.examinationId },
    });

    // Writing a deliberately inconsistent total, bypassing the service layer entirely.
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE daily_activity_lines SET line_total = 999.99 WHERE id = ${line.id}`,
      ),
    ).rejects.toThrow();
  });

  it('recomputes the day total when a line is deleted', async () => {
    await saveDay(fixture, '2026-09-01', 7, 3);

    // Re-save with only the examination line; the consultation line is removed.
    await api.put('/api/daily').send({
      clinicId: fixture.clinicId,
      date: '2026-09-01',
      lines: [{ serviceId: fixture.examinationId, quantity: 7 }],
    });

    const activity = await prisma.dailyActivity.findFirstOrThrow({
      where: { clinicId: fixture.clinicId },
    });
    expect(activity.totalIncome.toFixed(2)).toBe('2100.00');
  });
});

describe('dates are not shifted by timezone conversion', () => {
  it('stores and returns the exact calendar date it was given', async () => {
    await saveDay(fixture, '2026-09-03', 1, 1);

    const view = await api.get(`/api/daily?clinicId=${fixture.clinicId}&date=2026-09-03`);
    expect(view.body.activity.date).toBe('2026-09-03');
    expect(view.body.activity.exists).toBe(true);

    const monthly = await api.get(
      `/api/reports/monthly?clinicId=${fixture.clinicId}&year=2026&month=9`,
    );
    expect(monthly.body.rows[0].date).toBe('2026-09-03');
    expect(monthly.body.rows[0].dayOfMonth).toBe(3);

    // The neighbouring days must be empty - an off-by-one would show up here.
    const dayBefore = await api.get(`/api/daily?clinicId=${fixture.clinicId}&date=2026-09-02`);
    expect(dayBefore.body.activity.exists).toBe(false);
  });

  it('keeps the first and last day of a month inside that month', async () => {
    await saveDay(fixture, '2026-09-01', 1, 0);
    await saveDay(fixture, '2026-09-30', 1, 0);
    await saveDay(fixture, '2026-10-01', 1, 0);

    const september = await api.get(
      `/api/reports/monthly?clinicId=${fixture.clinicId}&year=2026&month=9`,
    );
    expect(september.body.rows.map((row: { date: string }) => row.date)).toEqual([
      '2026-09-01',
      '2026-09-30',
    ]);
  });
});

describe('extensibility', () => {
  it('supports a third service with no schema change', async () => {
    const created = await api.post('/api/services').send({
      code: 'PROCEDURE',
      nameEn: 'Procedure',
      nameAr: 'إجراء',
      sortOrder: 3,
    });
    expect(created.status).toBe(201);

    await api.post(`/api/clinics/${fixture.clinicId}/prices`).send({
      serviceId: created.body.id,
      fee: '500.00',
      effectiveFrom: '2026-01-01',
    });

    const saved = await api.put('/api/daily').send({
      clinicId: fixture.clinicId,
      date: '2026-09-01',
      lines: [
        { serviceId: fixture.examinationId, quantity: 2 },
        { serviceId: created.body.id, quantity: 3 },
      ],
    });

    expect(saved.status).toBe(200);
    // 2 x 300 + 3 x 500 = 2100
    expect(saved.body.activity.totalDailyIncome).toBe('2100.00');
    expect(saved.body.activity.lines).toHaveLength(2);

    const dashboard = await api.get(
      `/api/dashboard/summary?clinicId=${fixture.clinicId}&year=2026&month=9`,
    );
    const procedure = dashboard.body.byService.find(
      (row: { serviceCode: string }) => row.serviceCode === 'PROCEDURE',
    );
    expect(procedure.income).toBe('1500.00');
  });
});

describe('clinic administration', () => {
  it('rejects a duplicate clinic name regardless of case', async () => {
    const response = await api.post('/api/clinics').send({ name: 'rodayna' });
    expect(response.status).toBe(409);
  });

  it('blocks new records for an inactive clinic', async () => {
    await api.patch(`/api/clinics/${fixture.clinicId}`).send({ status: 'INACTIVE' });
    const response = await saveDay(fixture, '2026-09-05', 3, 1);
    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/inactive/i);
  });
});

describe('exports', () => {
  it('returns a CSV with a UTF-8 BOM so Excel reads Arabic correctly', async () => {
    await saveDay(fixture, '2026-09-01', 10, 5);
    const response = await api.get(
      `/api/reports/monthly?clinicId=${fixture.clinicId}&year=2026&month=9&format=csv`,
    );
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/csv/);
    expect(response.text.charCodeAt(0)).toBe(0xfeff);
    expect(response.text).toMatch(/4000/);
  });

  it('returns a real xlsx workbook', async () => {
    await saveDay(fixture, '2026-09-01', 10, 5);
    const response = await api
      .get(`/api/reports/monthly?clinicId=${fixture.clinicId}&year=2026&month=9&format=xlsx`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    // XLSX files are zip archives and begin with "PK".
    expect((response.body as Buffer).subarray(0, 2).toString()).toBe('PK');
  });
});
