
import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import type { Pool } from "mysql2/promise";

type CustodianRow = {
  Referenz: string;
  Kunde: string;
  Depot: string;
  ISIN: string;
  Art: "BUY" | "SELL" | "TRANSFER_IN" | "TRANSFER_OUT";
  Handelstag: string;
  Valuta: string;
  Stueck: string;
  Kurs: string;
  Waehrung: string;
};

function parseGermanDate(value: string): string {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
  if (!match) throw new Error(`Invalid date: ${value}`);

  const [, day, month, year] = match;
  const date = `${year}-${month}-${day}`;
  const parsed = new Date(`${date}T00:00:00Z`);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new Error(`Invalid date: ${value}`);
  }

  return date;
}

function parseGermanNumber(value: string, allowEmpty = false): number | null {
  const text = value.trim();
  if (!text && allowEmpty) return null;
  if (!text) throw new Error("Required numeric value is empty");

  const normalized = text.replace(/\./g, "").replace(",", ".");
  const number = Number(normalized);

  if (!Number.isFinite(number)) {
    throw new Error(`Invalid number: ${value}`);
  }

  return number;
}

export async function importCustodianCsv(pool: Pool) {
  const filePath = path.resolve(
    process.cwd(),
    "..",
    "data",
    "import",
    "custodian-export-2026-09.csv"
  );

  const content = await fs.readFile(filePath, "utf8");
  const rows = parse(content, {
    bom: true,
    columns: true,
    delimiter: ";",
    skip_empty_lines: true,
    trim: true,
  }) as CustodianRow[];

  const connection = await pool.getConnection();

  let imported = 0;
  let duplicates = 0;
  const errors: { reference: string; error: string }[] = [];

  try {
    await connection.beginTransaction();

    for (const row of rows) {
      try {
        const reference = row.Referenz?.trim();
        const clientId = row.Kunde?.trim();
        const portfolioId = row.Depot?.trim();
        const isin = row.ISIN?.trim();
        const type = row.Art?.trim() as CustodianRow["Art"];
        const currency = row.Waehrung?.trim().toUpperCase();

        if (!reference || !clientId || !portfolioId || !isin) {
          throw new Error("Missing required field");
        }

        if (!["BUY", "SELL", "TRANSFER_IN", "TRANSFER_OUT"].includes(type)) {
          throw new Error("Invalid transaction type");
        }

        if (!/^[A-Z]{3}$/.test(currency)) {
          throw new Error("Invalid currency");
        }

        const tradeDate = parseGermanDate(row.Handelstag);
        const settlementDate = parseGermanDate(row.Valuta);
        const quantity = parseGermanNumber(row.Stueck);
        const price = parseGermanNumber(row.Kurs, true);

        if (quantity === null || quantity <= 0) {
          throw new Error("Quantity must be positive");
        }

        if (type === "BUY" || type === "SELL") {
          if (price === null || price < 0) {
            throw new Error("BUY/SELL requires a non-negative price");
          }
        } else if (price !== null) {
          throw new Error("Transfer transactions must have an empty price");
        }

        const [existingRows] = await connection.execute(
          "SELECT id FROM transactions WHERE external_ref = ?",
          [reference]
        );

        if ((existingRows as { id: string }[]).length > 0) {
          duplicates++;
          continue;
        }

        const [portfolioRows] = await connection.execute(
          "SELECT client_id FROM portfolios WHERE id = ?",
          [portfolioId]
        );
        const portfolio = (portfolioRows as { client_id: string }[])[0];

        if (!portfolio || portfolio.client_id !== clientId) {
          throw new Error("Portfolio does not belong to the specified client");
        }

        const [instrumentRows] = await connection.execute(
          "SELECT currency FROM instruments WHERE isin = ?",
          [isin]
        );
        const instrument = (instrumentRows as { currency: string }[])[0];

        if (!instrument) throw new Error("Unknown ISIN");
        if (instrument.currency !== currency) {
          throw new Error("Currency does not match instrument");
        }

        const id = `IMP-${reference}`;

        await connection.execute(
          `INSERT INTO transactions
           (id, external_ref, client_id, portfolio_id, isin, type,
            trade_date, settlement_date, quantity, price, currency, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
          [
            id,
            reference,
            clientId,
            portfolioId,
            isin,
            type,
            tradeDate,
            settlementDate,
            quantity,
            price,
            currency,
          ]
        );

        imported++;
      } catch (error) {
        errors.push({
          reference: row.Referenz || "(missing)",
          error: error instanceof Error ? error.message : "Invalid row",
        });
      }
    }

    await connection.commit();

    return {
      totalRows: rows.length,
      imported,
      duplicates,
      failed: errors.length,
      errors: errors.slice(0, 50),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
