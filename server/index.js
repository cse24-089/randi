import "dotenv/config";
import bcrypt from "bcryptjs";
import pg from "pg";
import { createApp } from "./app.js";
import { migrate } from "./db/migrate.js";

const { Pool } = pg;
const port = Number(process.env.PORT ?? 3000);

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be configured.");
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error("Set SESSION_SECRET to a random value of at least 32 characters.");
}
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid TCP port.");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: true } : undefined,
});

try {
  await migrate(pool);
  if (process.env.ADMIN_EMAIL || process.env.ADMIN_PASSWORD) {
    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12) {
      throw new Error("Set both ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters.");
    }
    const email = process.env.ADMIN_EMAIL.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    const admin = await pool.query(
      `INSERT INTO users (email, password_hash, display_name, role)
       VALUES ($1, $2, 'Thuso Administrator', 'admin')
       ON CONFLICT (lower(email)) DO UPDATE SET password_hash = EXCLUDED.password_hash,
         role = 'admin', updated_at = now()
       RETURNING id`,
      [email, passwordHash],
    );
    await pool.query(
      "INSERT INTO user_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
      [admin.rows[0].id],
    );
  }

  const app = createApp({ pool });
  const server = app.listen(port, () => console.info(`Thuso is listening on port ${port}.`));
  const shutdown = (signal) => {
    console.info(`${signal} received. Closing Thuso.`);
    server.close(async (error) => {
      if (error) console.error("HTTP server shutdown failed.", error);
      try {
        await pool.end();
      } catch (poolError) {
        console.error("Database pool shutdown failed.", poolError);
        process.exitCode = 1;
      }
    });
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
} catch (error) {
  await pool.end();
  throw error;
}
