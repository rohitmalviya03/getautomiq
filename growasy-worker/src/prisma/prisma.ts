import { PrismaClient } from '@prisma/client';

/**
 * Single PrismaClient for the worker process. growasy-api owns the schema and
 * all migrations; the worker only reads accounts/rules and writes the
 * processed_comments ledger + account status. Instantiated once and shared
 * across both queue processors (a client per job would exhaust the DB pool).
 */
export const prisma = new PrismaClient();
