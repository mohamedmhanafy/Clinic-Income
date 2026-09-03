import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { config as loadEnv } from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, '../../../.env') });

/**
 * Applies migrations to the dedicated test database before the suite runs.
 *
 * The suite truncates every table, so it must never be pointed at real data. Refusing to
 * start when TEST_DATABASE_URL is missing - rather than falling back to DATABASE_URL - is
 * what prevents a stray `npm test` from wiping the development database.
 */
export default function setup() {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error(
      'TEST_DATABASE_URL is not set. The test suite truncates its database and refuses to ' +
        'run against DATABASE_URL. Set TEST_DATABASE_URL in .env (see .env.example).',
    );
  }
  if (testDatabaseUrl === process.env.DATABASE_URL) {
    throw new Error(
      'TEST_DATABASE_URL must differ from DATABASE_URL - the test suite would erase your data.',
    );
  }

  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(here, '..'),
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: 'inherit',
  });
}
