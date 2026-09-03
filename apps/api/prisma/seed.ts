/**
 * ---------------------------------------------------------------------------
 * SAMPLE DATA
 * ---------------------------------------------------------------------------
 * Everything in this file is example data intended to make the portal usable
 * the moment it starts. All of it is meant to be changed through the UI:
 *
 *   - clinic names          Settings > Clinics
 *   - service names         Settings > Services
 *   - fees and their dates  Settings > Pricing
 *
 * The script is idempotent: running it again updates the sample rows rather
 * than duplicating them, and it never touches recorded income.
 * ---------------------------------------------------------------------------
 */
import { PrismaClient } from '@prisma/client';
import { config } from '../src/config.js';
import { toDbDate } from '../src/lib/date.js';

const prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } });

/** The date from which the sample fees apply. Open-ended: no end date. */
const SAMPLE_PRICES_EFFECTIVE_FROM = '2026-01-01';

const SAMPLE_SERVICES = [
  { code: 'EXAMINATION', nameEn: 'Examination', nameAr: 'كشف', sortOrder: 1 },
  { code: 'CONSULTATION', nameEn: 'Consultation', nameAr: 'استشارة', sortOrder: 2 },
];

const SAMPLE_CLINICS = [
  { name: 'Rodayna', fees: { EXAMINATION: '300.00', CONSULTATION: '200.00' } },
  { name: 'ElSafwa', fees: { EXAMINATION: '350.00', CONSULTATION: '250.00' } },
];

async function main() {
  console.log('[seed] writing sample data...');

  const services = new Map<string, number>();
  for (const service of SAMPLE_SERVICES) {
    const row = await prisma.service.upsert({
      where: { code: service.code },
      create: { ...service, status: 'ACTIVE' },
      update: { nameEn: service.nameEn, nameAr: service.nameAr, sortOrder: service.sortOrder },
    });
    services.set(row.code, row.id);
    console.log(`[seed] service ${row.code} (${row.nameEn} / ${row.nameAr})`);
  }

  for (const clinic of SAMPLE_CLINICS) {
    const row = await prisma.clinic.upsert({
      where: { name: clinic.name },
      create: { name: clinic.name, status: 'ACTIVE' },
      update: {},
    });
    console.log(`[seed] clinic ${row.name}`);

    for (const [code, fee] of Object.entries(clinic.fees)) {
      const serviceId = services.get(code);
      if (!serviceId) continue;

      // Keyed on the effective-from date so re-running the seed updates the sample price
      // instead of creating a second, overlapping period (which the database would
      // reject anyway).
      const existing = await prisma.clinicPrice.findFirst({
        where: {
          clinicId: row.id,
          serviceId,
          effectiveFrom: toDbDate(SAMPLE_PRICES_EFFECTIVE_FROM),
        },
      });

      if (existing) {
        await prisma.clinicPrice.update({ where: { id: existing.id }, data: { fee } });
      } else {
        await prisma.clinicPrice.create({
          data: {
            clinicId: row.id,
            serviceId,
            fee,
            effectiveFrom: toDbDate(SAMPLE_PRICES_EFFECTIVE_FROM),
            effectiveTo: null,
          },
        });
      }
      console.log(`[seed]   ${code} = ${fee} from ${SAMPLE_PRICES_EFFECTIVE_FROM}`);
    }
  }

  console.log('[seed] done. These are sample values - change them in Settings.');
}

main()
  .catch((error) => {
    console.error('[seed] failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
