import { PrismaClient } from '@prisma/client';
import { config } from './config.js';

export const prisma = new PrismaClient({
  datasources: { db: { url: config.databaseUrl } },
  // Silent under test: several tests deliberately trigger constraint violations, and
  // Prisma logging them makes a passing run look like a failing one.
  log: config.isTest ? [] : ['warn', 'error'],
});

export type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
