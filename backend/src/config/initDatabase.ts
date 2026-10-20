
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import pool from "./database";
import { parse } from "csv-parse/sync";

type User = {
  id: number;
  email: string;
  name: string;
  role: "ADMIN" | "OPERATOR" | "VIEWER";
};

type Client = {
  id: string;
  name: string;
  type: "RETAIL" | "INSTITUTIONAL";
  country: string;
  kycStatus: "APPROVED" | "PENDING" | "EXPIRED" | "REJECTED";
  email?: string;
  phone?: string;
  relationshipManagerId?: number | null;
  onboardedOn?: string;
};

type Portfolio = {
  id: string;
  clientId: string;
  name: string;
  baseCurrency: string;
  status: "ACTIVE" | "CLOSED";
};

type Instrument = {
  isin: string;
  name: string;
  type: "EQUITY" | "BOND" | "FUND";
  currency: string;
};

async function readJson<T>(filename: string): Promise<T> {
 const filePath = path.resolve(process.cwd(), "data", filename);
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content) as T;
}

type Transaction = {
  id: string;
  externalRef: string;
  clientId: string;
  portfolioId: string;
  isin: string;
  type: "BUY" | "SELL" | "TRANSFER_IN" | "TRANSFER_OUT";
  tradeDate: string;
  settlementDate: string;
  quantity: string;
  price: string;
  currency: string;
  status: "PENDING" | "SETTLED" | "CANCELLED" | "FAILED";
};

async function readTransactions(): Promise<Transaction[]> {
const filePath = path.resolve(process.cwd(), "data", "transactions.csv");
  const content = await fs.readFile(filePath, "utf8");

  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Transaction[];
}


export default async function seedDatabase(): Promise<void> {
  const users = await readJson<User[]>("users.json");
  const clients = await readJson<Client[]>("clients.json");
  const portfolios = await readJson<Portfolio[]>("portfolios.json");
  const instruments = await readJson<Instrument[]>("instruments.json");
  const transactions = await readTransactions();

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    for (const user of users) {
      const passwordHash = await bcrypt.hash("Challenge-2026!", 10);

      await connection.execute(
        `INSERT INTO users (id, email, name, role, password_hash)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           email = VALUES(email),
           name = VALUES(name),
           role = VALUES(role)`,
        [user.id, user.email, user.name, user.role, passwordHash]
      );
    }

    for (const client of clients) {
      await connection.execute(
        `INSERT INTO clients
         (id, name, type, country, kyc_status, email, phone,
          relationship_manager_id, onboarded_on)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           type = VALUES(type),
           country = VALUES(country),
           kyc_status = VALUES(kyc_status),
           email = VALUES(email),
           phone = VALUES(phone),
           relationship_manager_id = VALUES(relationship_manager_id),
           onboarded_on = VALUES(onboarded_on)`,
        [
          client.id,
          client.name,
          client.type,
          client.country,
          client.kycStatus,
          client.email ?? null,
          client.phone ?? null,
          client.relationshipManagerId ?? null,
          client.onboardedOn ?? null,
        ]
      );
    }

    for (const portfolio of portfolios) {
      await connection.execute(
        `INSERT INTO portfolios
         (id, client_id, name, base_currency, status)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           client_id = VALUES(client_id),
           name = VALUES(name),
           base_currency = VALUES(base_currency),
           status = VALUES(status)`,
        [
          portfolio.id,
          portfolio.clientId,
          portfolio.name,
          portfolio.baseCurrency,
          portfolio.status,
        ]
      );
    }

    for (const instrument of instruments) {
      await connection.execute(
        `INSERT INTO instruments (isin, name, type, currency)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           type = VALUES(type),
           currency = VALUES(currency)`,
        [
          instrument.isin,
          instrument.name,
          instrument.type,
          instrument.currency,
        ]
      );
    }
        const batchSize = 500;

    for (let i = 0; i < transactions.length; i += batchSize) {
      const batch = transactions.slice(i, i + batchSize);

      const placeholders = batch
        .map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .join(", ");

      const values = batch.flatMap((transaction) => [
        transaction.id,
        transaction.externalRef,
        transaction.clientId,
        transaction.portfolioId,
        transaction.isin,
        transaction.type,
        transaction.tradeDate,
        transaction.settlementDate,
        transaction.quantity,
        transaction.price === "" ? null : transaction.price,
        transaction.currency,
        transaction.status,
      ]);

      await connection.execute(
        `INSERT INTO transactions
         (id, external_ref, client_id, portfolio_id, isin, type,
          trade_date, settlement_date, quantity, price, currency, status)
         VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE id = id`,
        values
      );

      console.log(
        `Transactions processed: ${Math.min(i + batchSize, transactions.length)}/${transactions.length}`
      );
    }

    await connection.commit();

    console.log(
      `Imported ${users.length} users, ${clients.length} clients, ` +
      `${portfolios.length} portfolios and ${instruments.length} instruments.`
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
