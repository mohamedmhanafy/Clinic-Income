import supertest from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/prisma.js';
import { toDbDate } from '../src/lib/date.js';

export const api = supertest(createApp());

export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE daily_activity_lines, daily_activities, clinic_prices, clinics, services RESTART IDENTITY CASCADE',
  );
}

export interface Fixture {
  clinicId: number;
  otherClinicId: number;
  examinationId: number;
  consultationId: number;
}

/**
 * The fixture from the specification's test scenario: Rodayna with an examination fee of
 * 300 and a consultation fee of 200, both open-ended from 2026-01-01.
 */
export async function seedFixture(): Promise<Fixture> {
  const examination = await prisma.service.create({
    data: { code: 'EXAMINATION', nameEn: 'Examination', nameAr: 'كشف', sortOrder: 1 },
  });
  const consultation = await prisma.service.create({
    data: { code: 'CONSULTATION', nameEn: 'Consultation', nameAr: 'استشارة', sortOrder: 2 },
  });

  const rodayna = await prisma.clinic.create({ data: { name: 'Rodayna' } });
  const elsafwa = await prisma.clinic.create({ data: { name: 'ElSafwa' } });

  await prisma.clinicPrice.createMany({
    data: [
      {
        clinicId: rodayna.id,
        serviceId: examination.id,
        fee: '300.00',
        effectiveFrom: toDbDate('2026-01-01'),
      },
      {
        clinicId: rodayna.id,
        serviceId: consultation.id,
        fee: '200.00',
        effectiveFrom: toDbDate('2026-01-01'),
      },
      {
        clinicId: elsafwa.id,
        serviceId: examination.id,
        fee: '350.00',
        effectiveFrom: toDbDate('2026-01-01'),
      },
      {
        clinicId: elsafwa.id,
        serviceId: consultation.id,
        fee: '250.00',
        effectiveFrom: toDbDate('2026-01-01'),
      },
    ],
  });

  return {
    clinicId: rodayna.id,
    otherClinicId: elsafwa.id,
    examinationId: examination.id,
    consultationId: consultation.id,
  };
}

export function saveDay(
  fixture: Fixture,
  date: string,
  examinations: number,
  consultations: number,
  extra: Record<string, unknown> = {},
) {
  return api.put('/api/daily').send({
    clinicId: fixture.clinicId,
    date,
    lines: [
      { serviceId: fixture.examinationId, quantity: examinations },
      { serviceId: fixture.consultationId, quantity: consultations },
    ],
    ...extra,
  });
}
