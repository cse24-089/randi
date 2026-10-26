import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const schemaPath = new URL("./schema.sql", import.meta.url);

export async function migrate(pool) {
  const schema = await readFile(fileURLToPath(schemaPath), "utf8");
  await pool.query(schema);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await migrate(pool);
    console.info("Database schema is up to date.");
  } finally {
    await pool.end();
  }
}
