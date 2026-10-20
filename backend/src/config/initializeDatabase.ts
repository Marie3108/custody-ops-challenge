import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import pool from "./database";
import seedDatabase from "./initDatabase";

export async function initializeDatabase(): Promise<void> {
  const schemaPath = path.join(__dirname, "schema.sql");
  const schema = await fs.readFile(schemaPath, "utf8");

  const statements = schema
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    for (const statement of statements) {
      await connection.query(statement);
    }

    await connection.commit();
    console.log("Database schema initialized.");
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await seedDatabase();
}