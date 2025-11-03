import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// This file must use the same simple password as your docker-compose.yml
const fallbackConnectionString = "postgresql://postgres:mysecretpassword@localhost:5433/payroll";
const connectionString = process.env.DATABASE_URL || fallbackConnectionString;

if (!connectionString) {
  console.error("Error: DATABASE_URL is not set and no fallback is available.");
  process.exit(1);
}

const pool = new Pool({ connectionString });

const MIGRATIONS_TABLE = "schema_migrations";
const migrationsDir = path.join(__dirname, "../migrations");

async function initMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT now()
    );
  `);
}

async function getAppliedMigrations(client) {
  const result = await client.query(`SELECT version FROM ${MIGRATIONS_TABLE}`);
  return new Set(result.rows.map(r => r.version));
}

async function run() {
  let client;
  try {
    client = await pool.connect();
    console.log("Connected to database.");

    await initMigrationTable(client);
    const appliedMigrations = await getAppliedMigrations(client);

    const allMigrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith(".sql"))
      .sort();

    // --- THIS IS THE TYPO FIX ---
    const pendingMigrations = allMigrationFiles.filter(
      file => !appliedMigrations.has(file)
    );
    // --- END OF TYPO FIX ---

    if (pendingMigrations.length === 0) {
      console.log("Database is already up to date.");
      return;
    }

    console.log(`Found ${pendingMigrations.length} pending migration(s):`);
    
    for (const file of pendingMigrations) {
      console.log(`- Applying ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
      
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(`INSERT INTO ${MIGRATIONS_TABLE} (version) VALUES ($1)`, [file]);
        await client.query("COMMIT");
        console.log(`  ...Success.`);
      } catch (e) {
        await client.query("ROLLBACK");
        console.error(`Failed to apply migration ${file}:`, e.message);
        throw e;
      }
    }

    console.log("All migrations applied successfully.");

  } catch (e) {
    console.error("Migration failed:", e);
    process.exit(1);
  } finally {
    if (client) {
      await client.release();
    }
    await pool.end();
    console.log("Disconnected from database.");
  }
}

run();

