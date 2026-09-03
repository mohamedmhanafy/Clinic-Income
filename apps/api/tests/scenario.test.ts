import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/prisma.js';
import { api, resetDatabase, saveDay, seedFixture, type Fixture } from './helpers.js';

/**
 * The acceptance scenario from the specification, plus the historical-integrity case that
 * the whole pricing design exists to satisfy.
 */

let fixture: Fixture;

beforeEach(async () => {
  await resetDatabase();
  fixture = await seedFixture();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('September 2026 at Rodayna', () => {
  it('computes each day from count x fee', async () => {
    const first = await saveDay(fixture, '2026-09-01', 10, 5);
    expect(first.status).toBe(200);
    expect(first.body.activity.examinationIncome).toBe('3000.00');
    expect(first.body.activity.consultationIncome).toBe('1000.00');
    expect(first.body.activity.totalDailyIncome).toBe('4000.00');

    const second = await saveDay(fixture, '2026-09-02', 8, 4);
    expect(second.status).toBe(200);
    expect(second.body.activity.examinationIncome).toBe('2400.00');
    expect(second.body.activity.consultationIncome).toBe('800.00');
    expect(second.body.activity.totalDailyIncome).toBe('3200.00');
  });

  it('reports the same 7,200 month total through every surface', async () => {
    await saveDay(fixture, '2026-09-01', 10, 5);
    await saveDay(fixture, '2026-09-02', 8, 4);

    // The specification requires the dashboard, the daily records and the monthly report
    // to agree, so each is asserted independently rather than trusting one of them.
    const monthly = await api.get(
      `/api/reports/monthly?clinicId=${fixture.clinicId}&year=2026&month=9`,
    );
    expect(monthly.status).toBe(200);
    expect(monthly.body.rows).toHaveLength(2);
    expect(monthly.body.rows[0].totalDailyIncome).toBe('4000.00');
    expect(monthly.body.rows[1].totalDailyIncome).toBe('3200.00');
    expect(monthly.body.totals.totalIncome).toBe('7200.00');
    expect(monthly.body.totals.examinationCount).toBe(18);
    expect(monthly.body.totals.consultationCount).toBe(9);
    expect(monthly.body.totals.examinationIncome).toBe('5400.00');
    expect(monthly.body.totals.consultationIncome).toBe('1800.00');
    expect(monthly.body.totals.workingDays).toBe(2);

    const dashboard = await api.get(
      `/api/dashboard/summary?clinicId=${fixture.clinicId}&year=2026&month=9`,
    );
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.totalIncome).toBe('7200.00');
    expect(dashboard.body.examinationIncome).toBe('5400.00');
    expect(dashboard.body.consultationIncome).toBe('1800.00');
    expect(dashboard.body.workingDays).toBe(2);

    const day = await api.get(`/api/daily?clinicId=${fixture.clinicId}&date=2026-09-01`);
    expect(day.body.activity.totalDailyIncome).toBe('4000.00');

    const annual = await api.get('/api/reports/annual?year=2026');
    const september = annual.body.rows.find((row: { month: number }) => row.month === 9);
    expect(september.byClinic[String(fixture.clinicId)]).toBe('7200.00');
    expect(annual.body.totals.total).toBe('7200.00');
  });

  it('counts a day recorded as all zeros as stored but not worked', async () => {
    await saveDay(fixture, '2026-09-01', 10, 5);
    await saveDay(fixture, '2026-09-03', 0, 0);

    const monthly = await api.get(
      `/api/reports/monthly?clinicId=${fixture.clinicId}&year=2026&month=9`,
    );
    expect(monthly.body.rows).toHaveLength(2);
    expect(monthly.body.totals.workingDays).toBe(1);
    expect(monthly.body.totals.totalIncome).toBe('4000.00');
  });
});

describe('historical integrity when a fee changes', () => {
  it('leaves September 2026 untouched after the 2027 fee rise', async () => {
    await saveDay(fixture, '2026-09-01', 10, 5);
    await saveDay(fixture, '2026-09-02', 8, 4);

    const before = await api.get(
      `/api/reports/monthly?clinicId=${fixture.clinicId}&year=2026&month=9`,
    );
    expect(before.body.totals.totalIncome).toBe('7200.00');

    // Raise the examination fee to 350 from January 2027.
    const change = await api.post(`/api/clinics/${fixture.clinicId}/prices/schedule-change`).send({
      serviceId: fixture.examinationId,
      fee: '350.00',
      effectiveFrom: '2027-01-01',
    });
    expect(change.status).toBe(201);

    // 2027 resolves to the new fee...
    const priced2027 = await api.get(
      `/api/prices/effective?clinicId=${fixture.clinicId}&date=2027-03-15`,
    );
    const exam2027 = priced2027.body.find(
      (row: { serviceCode: string }) => row.serviceCode === 'EXAMINATION',
    );
    expect(exam2027.fee).toBe('350.00');

    // ...while 2026 still resolves to the old one.
    const priced2026 = await api.get(
      `/api/prices/effective?clinicId=${fixture.clinicId}&date=2026-09-01`,
    );
    const exam2026 = priced2026.body.find(
      (row: { serviceCode: string }) => row.serviceCode === 'EXAMINATION',
    );
    expect(exam2026.fee).toBe('300.00');

    // The already-recorded September figures have not moved.
    const after = await api.get(
      `/api/reports/monthly?clinicId=${fixture.clinicId}&year=2026&month=9`,
    );
    expect(after.body.rows[0].totalDailyIncome).toBe('4000.00');
    expect(after.body.rows[1].totalDailyIncome).toBe('3200.00');
    expect(after.body.totals.totalIncome).toBe('7200.00');
    expect(after.body.totals.examinationIncome).toBe('5400.00');

    const day = await api.get(`/api/daily?clinicId=${fixture.clinicId}&date=2026-09-01`);
    expect(day.body.activity.examinationFeeApplied).toBe('300.00');
  });

  it('keeps the frozen fee when a historical count is corrected', async () => {
    await saveDay(fixture, '2026-09-01', 10, 5);
    await api.post(`/api/clinics/${fixture.clinicId}/prices/schedule-change`).send({
      serviceId: fixture.examinationId,
      fee: '350.00',
      effectiveFrom: '2027-01-01',
    });

    // Correcting a typo in the count must not re-price the record.
    const corrected = await saveDay(fixture, '2026-09-01', 11, 5);
    expect(corrected.body.activity.examinationFeeApplied).toBe('300.00');
    expect(corrected.body.activity.examinationIncome).toBe('3300.00');
    expect(corrected.body.activity.totalDailyIncome).toBe('4300.00');
  });

  it('re-applies the schedule for that date only when explicitly asked', async () => {
    await saveDay(fixture, '2026-09-01', 10, 5);

    // A price row entered wrongly is corrected: September 2026 should have been 320.
    await api.post(`/api/clinics/${fixture.clinicId}/prices/schedule-change`).send({
      serviceId: fixture.examinationId,
      fee: '320.00',
      effectiveFrom: '2026-01-01',
    });

    // Without the flag the record keeps the fee it was saved with.
    const untouched = await saveDay(fixture, '2026-09-01', 10, 5);
    expect(untouched.body.activity.examinationFeeApplied).toBe('300.00');

    // With it, the schedule for the ACTIVITY DATE is re-read - never today's price.
    const repaired = await saveDay(fixture, '2026-09-01', 10, 5, {
      reapplyPriceSchedule: true,
    });
    expect(repaired.body.activity.examinationFeeApplied).toBe('320.00');
    expect(repaired.body.activity.examinationIncome).toBe('3200.00');
    expect(repaired.body.activity.totalDailyIncome).toBe('4200.00');
  });
});

describe('clinic comparison', () => {
  it('totals both clinics over a month', async () => {
    await saveDay(fixture, '2026-09-01', 10, 5);
    await api.put('/api/daily').send({
      clinicId: fixture.otherClinicId,
      date: '2026-09-01',
      lines: [
        { serviceId: fixture.examinationId, quantity: 4 },
        { serviceId: fixture.consultationId, quantity: 2 },
      ],
    });

    const comparison = await api.get('/api/reports/comparison?year=2026&month=9');
    expect(comparison.status).toBe(200);

    const rodayna = comparison.body.rows.find(
      (row: { clinicName: string }) => row.clinicName === 'Rodayna',
    );
    const elsafwa = comparison.body.rows.find(
      (row: { clinicName: string }) => row.clinicName === 'ElSafwa',
    );

    expect(rodayna.totalIncome).toBe('4000.00');
    // ElSafwa: 4 x 350 + 2 x 250 = 1900
    expect(elsafwa.totalIncome).toBe('1900.00');
    expect(comparison.body.totals.totalIncome).toBe('5900.00');
    expect(comparison.body.totals.examinationCount).toBe(14);
    expect(comparison.body.totals.consultationCount).toBe(7);
  });
});
