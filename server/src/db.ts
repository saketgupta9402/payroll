import pg from "pg";
const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL || "postgres://postgres:mysecretpassword@localhost:5433/payroll";

export const pool = new Pool({ connectionString: databaseUrl });

export async function query<T = any>(text: string, params?: any[]): Promise<{ rows: T[] }> {
  return pool.query<T>(text, params);
}

