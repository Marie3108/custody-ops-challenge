
import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import type { Pool, PoolConnection } from "mysql2/promise";

type TransactionType = "BUY" | "SELL" | "TRANSFER_IN" | "TRANSFER_OUT";

type FeeSchedule = {
  billingCurrency: "EUR";
  transactionFees: Record<
    TransactionType,
    | { kind: "PERCENT_OF_GROSS"; rate: string; minimum: string; maximum: string }
    | { kind: "FLAT"; amount: string }
  >;
  monthlyAccountFee: { RETAIL: string; INSTITUTIONAL: string };
};

type FxRow = { date: string; currency: string; eurPerUnit: string };

const dataDirectory = path.resolve(process.cwd(), "..", "data");

async function loadFeeSchedule(): Promise<FeeSchedule> {
  return JSON.parse(
    await fs.readFile(path.join(dataDirectory, "fee-schedule.json"), "utf8")
  ) as FeeSchedule;
}

async function loadFxRates(): Promise<Map<string, number>> {
  const content = await fs.readFile(path.join(dataDirectory, "fx-rates.csv"), "utf8");
  const rows = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as FxRow[];

  const rates = new Map<string, number>();
  for (const row of rows) {
    const rate = Number(row.eurPerUnit);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error(`Invalid FX rate: ${row.date} ${row.currency}`);
    }
    rates.set(`${row.date}:${row.currency}`, rate);
  }
  return rates;
}

function roundToCents(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function dateString(value: string | Date): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export async function generateInvoice(
  pool: Pool,
  clientId: string,
  month: string,
  userId: number
) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error("Month must use YYYY-MM format");
  }

  const monthStart = `${month}-01`;
  const nextMonth = new Date(`${monthStart}T00:00:00Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const monthEnd = nextMonth.toISOString().slice(0, 10);

  const schedule = await loadFeeSchedule();
  const fxRates = await loadFxRates();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Serialize invoice generation for the same client.
    const [clientRows] = await connection.execute(
      "SELECT id, type FROM clients WHERE id = ? FOR UPDATE",
      [clientId]
    );
    const client = (clientRows as { id: string; type: "RETAIL" | "INSTITUTIONAL" }[])[0];
    if (!client) throw new Error("Client not found");

    const [existingRows] = await connection.execute(
      `SELECT id FROM invoices
       WHERE client_id = ? AND invoice_month = ? AND status <> 'VOID'
       LIMIT 1`,
      [clientId, monthStart]
    );
    if ((existingRows as { id: number }[]).length) {
      throw new Error("An active invoice already exists for this client and month");
    }

    const [transactionRows] = await connection.execute(
      `SELECT id, type, trade_date AS tradeDate, quantity, price, currency
       FROM transactions
       WHERE client_id = ?
         AND status = 'SETTLED'
         AND settlement_date >= ?
         AND settlement_date < ?
       ORDER BY id`,
      [clientId, monthStart, monthEnd]
    );

    const transactions = transactionRows as {
      id: string;
      type: TransactionType;
      tradeDate: string | Date;
      quantity: number;
      price: number | null;
      currency: string;
    }[];

    const totalsByType = new Map<TransactionType, { count: number; cents: number }>();

    for (const tx of transactions) {
      const rule = schedule.transactionFees[tx.type];
      let fee: number;

      if (rule.kind === "FLAT") {
        fee = Number(rule.amount);
      } else {
        if (tx.price === null) throw new Error(`Transaction ${tx.id} has no price`);
        const tradeDate = dateString(tx.tradeDate);
        const rate = tx.currency === "EUR" ? 1 : fxRates.get(`${tradeDate}:${tx.currency}`);
        if (rate === undefined) {
          throw new Error(`Missing FX rate for ${tx.currency} on ${tradeDate}`);
        }

        const grossEur = Number(tx.quantity) * Number(tx.price) * rate;
        fee = Math.min(
          Number(rule.maximum),
          Math.max(Number(rule.minimum), grossEur * Number(rule.rate))
        );
      }

      const feeCents = Math.round(roundToCents(fee) * 100);
      const group = totalsByType.get(tx.type) ?? { count: 0, cents: 0 };
      group.count += 1;
      group.cents += feeCents;
      totalsByType.set(tx.type, group);
    }

    const [portfolioRows] = await connection.execute(
      "SELECT COUNT(*) AS total FROM portfolios WHERE client_id = ? AND status = 'ACTIVE'",
      [clientId]
    );
    const activePortfolios = Number((portfolioRows as { total: number }[])[0].total);

    const lines: { description: string; quantity: number; unitPrice: number; amount: number }[] = [];

    for (const type of ["BUY", "SELL", "TRANSFER_IN", "TRANSFER_OUT"] as TransactionType[]) {
      const group = totalsByType.get(type);
      if (group) {
       const amount = group.cents / 100;
lines.push({
    description: `${type} transaction fees`,
    quantity: group.count,
    unitPrice: roundToCents(amount / group.count),
    amount: roundToCents(amount),
});
      }
    }

    if (activePortfolios > 0) {
      const accountFee = roundToCents(Number(schedule.monthlyAccountFee[client.type]));
      lines.push({
        description: "Monthly account fee",
        quantity: 1,
        unitPrice: accountFee,
        amount: accountFee,
      });
    }

    const totalCents = lines.reduce((sum, line) => sum + Math.round(line.amount * 100), 0);
    const total = totalCents / 100;

    const [insertResult] = await connection.execute(
      `INSERT INTO invoices
       (client_id, invoice_month, status, currency, subtotal, total, created_by)
       VALUES (?, ?, 'DRAFT', 'EUR', ?, ?, ?)`,
      [clientId, monthStart, total, total, userId]
    );
    const invoiceId = (insertResult as { insertId: number }).insertId;

    for (const line of lines) {
      await connection.execute(
        `INSERT INTO invoice_lines
         (invoice_id, description, quantity, unit_price, amount)
         VALUES (?, ?, ?, ?, ?)`,
        [invoiceId, line.description, line.quantity, line.unitPrice, line.amount]
      );
    }

    await connection.commit();
    return { id: invoiceId, clientId, invoiceMonth: monthStart, status: "DRAFT", currency: "EUR", total, lines };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function changeInvoiceStatus(
  pool: Pool,
  invoiceId: number,
  action: "issue" | "pay" | "void",
  role: "ADMIN" | "OPERATOR" | "VIEWER"
) {
  if (role === "VIEWER") throw new Error("Insufficient permissions");
  if (action === "void" || action === "pay") {
    if (role !== "ADMIN") throw new Error("Only admins can pay or void invoices");
  }

  const connection: PoolConnection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      "SELECT status FROM invoices WHERE id = ? FOR UPDATE",
      [invoiceId]
    );
    const invoice = (rows as { status: string }[])[0];
    if (!invoice) throw new Error("Invoice not found");

    const transitions: Record<string, { next: string; timestamp: string }> = {
      issue: { next: "ISSUED", timestamp: "issued_at" },
      pay: { next: "PAID", timestamp: "paid_at" },
      void: { next: "VOID", timestamp: "voided_at" },
    };
    const transition = transitions[action];
    const allowed =
      (action === "issue" && invoice.status === "DRAFT") ||
      (action === "pay" && invoice.status === "ISSUED") ||
      (action === "void" && ["DRAFT", "ISSUED"].includes(invoice.status));

    if (!allowed) throw new Error(`Cannot ${action} an invoice with status ${invoice.status}`);

    await connection.execute(
      `UPDATE invoices SET status = ?, ${transition.timestamp} = CURRENT_TIMESTAMP WHERE id = ?`,
      [transition.next, invoiceId]
    );

    await connection.commit();
    return { id: invoiceId, status: transition.next };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
