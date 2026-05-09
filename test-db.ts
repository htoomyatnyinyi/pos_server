import { Pool } from "pg";

const connectionString = "postgresql://postgres:password@db:5432/posdb";
const pool = new Pool({ connectionString });

try {
  const client = await pool.connect();
  console.log("Successfully connected to database");
  const res = await client.query("SELECT NOW()");
  console.log("Current time from DB:", res.rows[0]);
  client.release();
} catch (err) {
  console.error("Failed to connect to database:", err);
} finally {
  await pool.end();
}
