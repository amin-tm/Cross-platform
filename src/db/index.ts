import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __polPostgresClient?: ReturnType<typeof postgres>;
};

// Supabase's pooled connection strings (aws-1-*.pooler.supabase.com) use pgBouncer in
// transaction mode, which cannot cache prepared statements. Disabling them here keeps a
// single code path safe for both local Postgres and Supabase-managed Postgres.
export const sql =
  globalForDb.__polPostgresClient ??
  postgres(databaseUrl, {
    prepare: false,
    max: Number(process.env.DATABASE_POOL_SIZE) || 4,
    idle_timeout: 20,
    connect_timeout: 15,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__polPostgresClient = sql;
}

export const db = drizzle(sql);
