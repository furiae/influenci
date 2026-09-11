import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Memoize on globalThis in every environment. On Vercel, one function instance
// serves many requests (Fluid Compute) and a fresh Pool per module evaluation
// would exhaust Postgres connections.
const globalForPrisma = globalThis;

function createPool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30_000,
  });
}

const pool = globalForPrisma.__pgPool ?? createPool();
globalForPrisma.__pgPool = pool;

export const prisma =
  globalForPrisma.__prisma ??
  new PrismaClient({
    adapter: new PrismaPg(pool),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

globalForPrisma.__prisma = prisma;

export default prisma;
