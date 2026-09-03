import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

// The repository keeps a single .env at its root so there is one file to edit. Resolve it
// relative to this module so the API behaves the same however it is launched.
const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, '../../../.env') });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isTest = nodeEnv === 'test';

export const config = {
  nodeEnv,
  isTest,
  isProduction: nodeEnv === 'production',
  port: Number(process.env.PORT ?? 4000),
  // The test suite truncates its database, so it must never share one with real data.
  databaseUrl: isTest ? required('TEST_DATABASE_URL') : required('DATABASE_URL'),
  /*
   * In development the origin is reflected back, so the API can also be called directly
   * from a phone or a second machine on the LAN while testing. In production the allow
   * list from CORS_ORIGIN is enforced.
   */
  corsOrigin:
    nodeEnv === 'production'
      ? (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean)
      : true,
  currencyCode: process.env.CURRENCY_CODE ?? 'EGP',
};
