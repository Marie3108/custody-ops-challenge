
import "dotenv/config";
import express from "express";
import cors from "cors";
import mysql from "mysql2/promise";
import { initializeDatabase } from "./config/initializeDatabase";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  generateInvoice,
  changeInvoiceStatus,
} from "./services/invoiceService";
import { importCustodianCsv } from "./services/custodianImportService";

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json());
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";





app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body ?? {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const [rows] = await pool.execute(
      "SELECT id, email, name, role, password_hash AS passwordHash FROM users WHERE email = ?",
      [email.trim()]
    );

    const user = (rows as {
      id: number;
      email: string;
      name: string;
      role: "ADMIN" | "OPERATOR" | "VIEWER";
      passwordHash: string;
    }[])[0];

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const token = jwt.sign(
      { sub: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login failed:", error);
    res.status(500).json({ error: "Login failed" });
  }
});




const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
});
type AuthRequest = express.Request & {
  user?: {
    id: number;
    role: "ADMIN" | "OPERATOR" | "VIEWER";
  };
};

function authenticateToken(
  req: AuthRequest,
  res: express.Response,
  next: express.NextFunction
) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
   const decoded = jwt.verify(token, JWT_SECRET);

if (
  typeof decoded === "string" ||
  typeof decoded.sub !== "number" ||
  !["ADMIN", "OPERATOR", "VIEWER"].includes(String(decoded.role))
) {
  res.status(401).json({ error: "Invalid token payload" });
  return;
}

const payload = {
  sub: decoded.sub,
  role: decoded.role as "ADMIN" | "OPERATOR" | "VIEWER",
};

    req.user = {
      id: Number(payload.sub),
      role: payload.role,
    };

    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
// =====================================================
// HEALTH
// =====================================================

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      status: "ok",
      database: "connected",
    });
  } catch (error) {
    console.error("Database connection failed:", error);

    res.status(503).json({
      status: "error",
      database: "disconnected",
    });
  }
});

// =====================================================
// CLIENTS
// =====================================================

app.get(
  "/api/clients",
  authenticateToken,
  async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number(req.query.pageSize) || 20)
    );

    const conditions: string[] = [];
    const values: (string | number)[] = [];

    const search = String(req.query.search ?? "").trim();
    const type = String(req.query.type ?? "").trim();
    const country = String(req.query.country ?? "").trim();
    const kycStatus = String(req.query.kycStatus ?? "").trim();
    const managerId = String(
      req.query.relationshipManagerId ?? ""
    ).trim();

    if (search) {
      conditions.push("c.name LIKE ?");
      values.push(`%${search}%`);
    }

    if (type) {
      conditions.push("c.type = ?");
      values.push(type);
    }

    if (country) {
      conditions.push("c.country = ?");
      values.push(country);
    }

    if (kycStatus) {
      conditions.push("c.kyc_status = ?");
      values.push(kycStatus);
    }

    if (managerId) {
      const parsedManagerId = Number(managerId);

      if (!Number.isInteger(parsedManagerId) || parsedManagerId < 1) {
        res.status(400).json({
          error: "relationshipManagerId must be a positive integer",
        });
        return;
      }

      conditions.push("c.relationship_manager_id = ?");
      values.push(parsedManagerId);
    }

    const where = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM clients c ${where}`,
      values
    );

    const total = Number(
      (countRows as { total: number }[])[0].total
    );

    const [rows] = await pool.query(
      `SELECT
         c.id,
         c.name,
         c.type,
         c.country,
         c.kyc_status AS kycStatus,
         c.email,
         c.phone,
         c.relationship_manager_id AS relationshipManagerId,
         c.onboarded_on AS onboardedOn,
         c.version
       FROM clients c
       ${where}
       ORDER BY c.name ASC, c.id ASC
       LIMIT ? OFFSET ?`,
      [...values, pageSize, (page - 1) * pageSize]
    );

    res.json({
      data: rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("Failed to fetch clients:", error);

    res.status(500).json({
      error: "Failed to fetch clients",
    });
  }
});

// =====================================================
// TRANSACTIONS - LIST, SEARCH, FILTER, SORT
// =====================================================

const transactionSortColumns: Record<string, string> = {
  id: "t.id",
  tradeDate: "t.trade_date",
  settlementDate: "t.settlement_date",
  status: "t.status",
  type: "t.type",
  quantity: "t.quantity",
  currency: "t.currency",
};

app.get("/api/transactions", authenticateToken, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number(req.query.pageSize) || 20)
    );

    const search = String(req.query.search ?? "").trim();
    const status = String(req.query.status ?? "").trim().toUpperCase();
    const type = String(req.query.type ?? "").trim().toUpperCase();
    const currency = String(req.query.currency ?? "").trim().toUpperCase();
    const clientId = String(req.query.clientId ?? "").trim();
    const portfolioId = String(req.query.portfolioId ?? "").trim();

    const conditions: string[] = [];
    const values: (string | number)[] = [];

    if (search) {
      conditions.push(
        "(t.id LIKE ? OR t.external_ref LIKE ? OR t.client_id LIKE ? OR t.isin LIKE ?)"
      );

      const term = `%${search}%`;
      values.push(term, term, term, term);
    }

    if (status) {
      const validStatuses = [
        "PENDING",
        "SETTLED",
        "CANCELLED",
        "FAILED",
      ];

      if (!validStatuses.includes(status)) {
        res.status(400).json({
          error: "Invalid transaction status",
        });
        return;
      }

      conditions.push("t.status = ?");
      values.push(status);
    }

    if (type) {
      const validTypes = [
        "BUY",
        "SELL",
        "TRANSFER_IN",
        "TRANSFER_OUT",
      ];

      if (!validTypes.includes(type)) {
        res.status(400).json({
          error: "Invalid transaction type",
        });
        return;
      }

      conditions.push("t.type = ?");
      values.push(type);
    }

    if (currency) {
      if (!/^[A-Z]{3}$/.test(currency)) {
        res.status(400).json({
          error: "Currency must be a three-letter code",
        });
        return;
      }

      conditions.push("t.currency = ?");
      values.push(currency);
    }

    if (clientId) {
      conditions.push("t.client_id = ?");
      values.push(clientId);
    }

    if (portfolioId) {
      conditions.push("t.portfolio_id = ?");
      values.push(portfolioId);
    }

    const where = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const sortBy = String(req.query.sortBy ?? "tradeDate");
    const sortColumn = transactionSortColumns[sortBy];

    if (!sortColumn) {
      res.status(400).json({
        error: "Invalid sort field",
      });
      return;
    }

    const sortOrder = String(
      req.query.sortOrder ?? "desc"
    ).toLowerCase();

    if (sortOrder !== "asc" && sortOrder !== "desc") {
      res.status(400).json({
        error: "sortOrder must be asc or desc",
      });
      return;
    }

    const direction = sortOrder === "asc" ? "ASC" : "DESC";

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM transactions t
       ${where}`,
      values
    );

    const total = Number(
      (countRows as { total: number }[])[0].total
    );

    const [rows] = await pool.query(
      `SELECT
         t.id,
         t.external_ref AS externalRef,
         t.client_id AS clientId,
         c.name AS clientName,
         t.portfolio_id AS portfolioId,
         t.isin,
         i.name AS instrumentName,
         t.type,
         t.trade_date AS tradeDate,
         t.settlement_date AS settlementDate,
         t.quantity,
         t.price,
         t.currency,
         t.status
       FROM transactions t
       INNER JOIN clients c
         ON c.id = t.client_id
       INNER JOIN instruments i
         ON i.isin = t.isin
       ${where}
       ORDER BY ${sortColumn} ${direction}, t.id ASC
       LIMIT ? OFFSET ?`,
      [...values, pageSize, (page - 1) * pageSize]
    );

    res.json({
      data: rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("Failed to fetch transactions:", error);

    res.status(500).json({
      error: "Failed to fetch transactions",
    });
  }
});

// =====================================================
// TRANSACTIONS - BULK APPROVE / CANCEL
// =====================================================

type TransactionAction = "SETTLED" | "CANCELLED";

app.post(
  "/api/transactions/bulk-status",
  authenticateToken,
  async (req: AuthRequest, res) => {


    if (
  !req.user ||
  !["ADMIN", "OPERATOR"].includes(req.user.role)
) {
  res.status(403).json({
    error: "Insufficient permissions",
  });
  return;
}
  const { ids, action } = (req.body ?? {}) as {
    ids?: unknown;
    action?: unknown;
  };

  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > 500 ||
    !ids.every(
      (id) => typeof id === "string" && id.trim().length > 0
    )
  ) {
    res.status(400).json({
      error: "ids must contain 1 to 500 valid transaction IDs",
    });
    return;
  }

  if (action !== "approve" && action !== "cancel") {
    res.status(400).json({
      error: 'action must be "approve" or "cancel"',
    });
    return;
  }

  const targetStatus: TransactionAction =
    action === "approve" ? "SETTLED" : "CANCELLED";

  const uniqueIds = [...new Set(ids as string[])];

  const results: {
    id: string;
    success: boolean;
    status?: string;
    reason?: string;
  }[] = [];

  let connection: mysql.PoolConnection;

  try {
    connection = await pool.getConnection();
  } catch (error) {
    console.error("Failed to acquire database connection:", error);
    res.status(503).json({
      error: "Database connection unavailable",
    });
    return;
  }

  try {
    await connection.beginTransaction();

    for (const id of uniqueIds) {
      const [updateResult] = await connection.execute(
        `UPDATE transactions
         SET status = ?
         WHERE id = ? AND status = 'PENDING'`,
        [targetStatus, id]
      );

      const affectedRows = (
        updateResult as { affectedRows: number }
      ).affectedRows;

      if (affectedRows === 1) {
        results.push({
          id,
          success: true,
          status: targetStatus,
        });
        continue;
      }

      const [existingRows] = await connection.execute(
        "SELECT status FROM transactions WHERE id = ?",
        [id]
      );

      const existing = (
        existingRows as { status: string }[]
      )[0];

      if (!existing) {
        results.push({
          id,
          success: false,
          reason: "Transaction not found",
        });
      } else {
        results.push({
          id,
          success: false,
          status: existing.status,
          reason: `Transaction is ${existing.status}, not PENDING`,
        });
      }
    }

    await connection.commit();

    res.json({
      action,
      requested: (ids as string[]).length,
      processed: results.length,
      succeeded: results.filter((result) => result.success).length,
      failed: results.filter((result) => !result.success).length,
      results,
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("Rollback failed:", rollbackError);
    }

    console.error("Failed to update transactions:", error);

    res.status(500).json({
      error: "Failed to update transactions",
    });
  } finally {
    connection.release();
  }
});





function invoiceError(res: express.Response, error: unknown) {
  const message = error instanceof Error ? error.message : "Invoice operation failed";

  if (message === "Client not found" || message === "Invoice not found") {
    res.status(404).json({ error: message });
    return;
  }

  if (
    message.includes("already exists") ||
    message.startsWith("Cannot ")
  ) {
    res.status(409).json({ error: message });
    return;
  }

  if (message === "Insufficient permissions" ||
      message.startsWith("Only admins")) {
    res.status(403).json({ error: message });
    return;
  }

  if (message.includes("Month must") ||
      message.includes("Missing FX rate") ||
      message.includes("has no price")) {
    res.status(400).json({ error: message });
    return;
  }

  console.error("Invoice operation failed:", error);
  res.status(500).json({ error: "Invoice operation failed" });
}

// List invoices, optionally filtered by client.
app.get("/api/invoices", authenticateToken, async (req, res) => {
  try {
    const clientId = String(req.query.clientId ?? "").trim();
    const month = String(req.query.month ?? "").trim();
    const status = String(req.query.status ?? "").trim().toUpperCase();

    const conditions: string[] = [];
    const values: (string | number)[] = [];

    if (clientId) {
      conditions.push("client_id = ?");
      values.push(clientId);
    }

    if (month) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        res.status(400).json({ error: "month must use YYYY-MM format" });
        return;
      }
      conditions.push("invoice_month = ?");
      values.push(`${month}-01`);
    }

    if (status) {
      if (!["DRAFT", "ISSUED", "PAID", "VOID"].includes(status)) {
        res.status(400).json({ error: "Invalid invoice status" });
        return;
      }
      conditions.push("status = ?");
      values.push(status);
    }

    const where = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const [rows] = await pool.execute(
      `SELECT id, client_id AS clientId, DATE_FORMAT(invoice_month, '%Y-%m-%d') AS invoiceMonth,
              status, currency, subtotal, total, created_by AS createdBy,
              created_at AS createdAt, issued_at AS issuedAt,
              paid_at AS paidAt, voided_at AS voidedAt
       FROM invoices ${where}
       ORDER BY invoice_month DESC, id DESC
       LIMIT 500`,
      values
    );

    //res.json({ data: rows });
    console.log("Invoices returned by API:", rows);
res.json({ data: rows });
  } catch (error) {
    invoiceError(res, error);
  }
});

// Get invoice details and its lines.
app.get("/api/invoices/:id", authenticateToken, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      res.status(400).json({ error: "Invalid invoice ID" });
      return;
    }

    const [rows] = await pool.execute(
      `SELECT id, client_id AS clientId,
       DATE_FORMAT(invoice_month, '%Y-%m-%d') AS invoiceMonth,
              status, currency, subtotal, total, created_by AS createdBy,
              created_at AS createdAt, issued_at AS issuedAt,
              paid_at AS paidAt, voided_at AS voidedAt
       FROM invoices WHERE id = ?`,
      [id]
    );

    const invoice = (rows as Record<string, unknown>[])[0];
    if (!invoice) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }

    const [lines] = await pool.execute(
      `SELECT id, description, quantity, unit_price AS unitPrice, amount
       FROM invoice_lines WHERE invoice_id = ? ORDER BY id`,
      [id]
    );

    res.json({ ...invoice, lines });
  } catch (error) {
    invoiceError(res, error);
  }
});

// Generate a draft invoice.
app.post("/api/invoices", authenticateToken, async (req: AuthRequest, res) => {
  if (!req.user || !["ADMIN", "OPERATOR"].includes(req.user.role)) {
    res.status(403).json({ error: "Insufficient permissions" });
    return;
  }

  try {
    const clientId = req.body?.clientId;
    const month = req.body?.month;

    if (
      typeof clientId !== "string" ||
      !clientId.trim() ||
      typeof month !== "string"
    ) {
      res.status(400).json({
        error: "clientId and month (YYYY-MM) are required",
      });
      return;
    }

    const invoice = await generateInvoice(
      pool,
      clientId.trim(),
      month,
      req.user.id
    );

    res.status(201).json(invoice);
  } catch (error) {
    invoiceError(res, error);
  }
});

// Issue a draft invoice, or pay/void it as admin.
app.patch(
  "/api/invoices/:id/status",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      res.status(400).json({ error: "Invalid invoice ID" });
      return;
    }

    const action = req.body?.action;
    if (!["issue", "pay", "void"].includes(action)) {
      res.status(400).json({
        error: 'action must be "issue", "pay", or "void"',
      });
      return;
    }

    try {
      const result = await changeInvoiceStatus(
        pool,
        id,
        action as "issue" | "pay" | "void",
        req.user.role
      );
      res.json(result);
    } catch (error) {
      invoiceError(res, error);
    }
  }
);

app.post(
  "/api/import/custodian",
  authenticateToken,
  async (req, res): Promise<void> => {
    const userRole = (req as any).user?.role;

if (userRole !== "ADMIN" && userRole !== "OPERATOR") {
  res.status(403).json({ error: "Forbidden" });
  return;
}

    try {
      const result = await importCustodianCsv(pool);
      res.json({ data: result });
    } catch (error) {
      console.error("Custodian import failed:", error);
      res.status(500).json({ error: "Custodian import failed" });
    }
  }
);




app.get(
  "/api/transactions/export",
  authenticateToken,
  async (req, res): Promise<void> => {
    try {
      const search = String(req.query.search ?? "").trim();
      const status = String(req.query.status ?? "").trim().toUpperCase();
      const type = String(req.query.type ?? "").trim().toUpperCase();
      const sortBy = String(req.query.sortBy ?? "tradeDate");
      const sortOrder =
        String(req.query.sortOrder ?? "desc").toLowerCase() === "asc"
          ? "ASC"
          : "DESC";

      const conditions: string[] = [];
      const values: string[] = [];

      if (search) {
        conditions.push(
          "(t.id LIKE ? OR t.external_ref LIKE ? OR t.client_id LIKE ? OR t.isin LIKE ?)"
        );
        const term = `%${search}%`;
        values.push(term, term, term, term);
      }

      if (status) {
        if (!["PENDING", "SETTLED", "CANCELLED", "FAILED"].includes(status)) {
          res.status(400).json({ error: "Invalid transaction status" });
          return;
        }
        conditions.push("t.status = ?");
        values.push(status);
      }

      if (type) {
        if (!["BUY", "SELL", "TRANSFER_IN", "TRANSFER_OUT"].includes(type)) {
          res.status(400).json({ error: "Invalid transaction type" });
          return;
        }
        conditions.push("t.type = ?");
        values.push(type);
      }

      const sortColumns: Record<string, string> = {
        tradeDate: "t.trade_date",
        settlementDate: "t.settlement_date",
        id: "t.id",
        status: "t.status",
        type: "t.type",
      };

      const orderColumn = sortColumns[sortBy] ?? "t.trade_date";
      const where = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

      const [rows] = await pool.query(
        `SELECT t.id, t.external_ref AS externalRef, t.client_id AS clientId,
                t.portfolio_id AS portfolioId, t.isin, t.type,
                t.trade_date AS tradeDate, t.settlement_date AS settlementDate,
                t.quantity, t.price, t.currency, t.status
         FROM transactions t
         ${where}
         ORDER BY ${orderColumn} ${sortOrder}, t.id`,
        values
      );

      const transactions = rows as Record<string, unknown>[];
      const columns = [
        "id", "externalRef", "clientId", "portfolioId", "isin",
        "type", "tradeDate", "settlementDate", "quantity", "price",
        "currency", "status",
      ];

      const escapeCsv = (value: unknown): string => {
        if (value === null || value === undefined) return "";
        const text =
          value instanceof Date
            ? value.toISOString().slice(0, 10)
            : String(value);
        return `"${text.replace(/"/g, '""')}"`;
      };

      const csv = [
        columns.join(","),
        ...transactions.map((row) =>
          columns.map((column) => escapeCsv(row[column])).join(",")
        ),
      ].join("\r\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="transactions.csv"'
      );
      res.send("\uFEFF" + csv);
    } catch (error) {
      console.error("Transaction export failed:", error);
      res.status(500).json({ error: "Failed to export transactions" });
    }
  }
);

/*
app.patch(
  "/api/clients/:id",
  authenticateToken,
  async (req: AuthRequest, res): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (req.user.role === "VIEWER") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { name, email, phone, kycStatus, relationshipManagerId, version } =
      req.body;

    if (
      typeof name !== "string" ||
      !name.trim() ||
      !Number.isInteger(version) ||
      !["APPROVED", "PENDING", "EXPIRED", "REJECTED"].includes(kycStatus)
    ) {
      res.status(400).json({ error: "Invalid client data or version" });
      return;
    }
    // Retrieve previous client values for audit
    const [existingRows] = await pool.execute(
      `SELECT name, email, phone,
              kyc_status AS kycStatus,
              relationship_manager_id AS relationshipManagerId
       FROM clients
       WHERE id = ?`,
      [req.params.id]
    );

    const oldClient = (existingRows as any[])[0];
    try {
      const [result] = await pool.execute(
        `UPDATE clients
         SET name = ?, email = ?, phone = ?, kyc_status = ?,
             relationship_manager_id = ?, version = version + 1
         WHERE id = ? AND version = ?`,
        [
          name.trim(),
          email || null,
          phone || null,
          kycStatus,
          relationshipManagerId || null,
          req.params.id,
          version,
        ]
      );

      if ((result as { affectedRows: number }).affectedRows === 0) {
        res.status(409).json({
          error: "Client not found or version conflict",
        });
        return;
      }

     
      // Record the client change in the audit trail
      await pool.execute(
        `INSERT INTO audit_logs
          (entity_type, entity_id, action, changed_by, old_values, new_values)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          "CLIENT",
          req.params.id,
          "UPDATE",
          req.user.id,
          JSON.stringify(oldClient),
          JSON.stringify({
            name: name.trim(),
            email: email || null,
            phone: phone || null,
            kycStatus,
            relationshipManagerId: relationshipManagerId || null,
            version: version + 1,
          }),
        ]
      );

      res.json({ message: "Client updated", version: version + 1 });

    } catch (error) {
      console.error("Client update failed:", error);
      res.status(500).json({ error: "Failed to update client" });
    }
  }
);*/


app.patch(
  "/api/clients/:id",
  authenticateToken,
  async (req: AuthRequest, res): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (req.user.role === "VIEWER") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { name, email, phone, kycStatus, relationshipManagerId, version } =
      req.body;

    if (
      typeof name !== "string" ||
      !name.trim() ||
      !Number.isInteger(version) ||
      !["APPROVED", "PENDING", "EXPIRED", "REJECTED"].includes(kycStatus)
    ) {
      res.status(400).json({ error: "Invalid client data or version" });
      return;
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [existingRows] = await connection.execute(
        `SELECT name, email, phone,
                kyc_status AS kycStatus,
                relationship_manager_id AS relationshipManagerId,
                version
         FROM clients
         WHERE id = ?
         FOR UPDATE`,
        [req.params.id]
      );

      const oldClient = (existingRows as any[])[0];

      if (!oldClient) {
        await connection.rollback();
        res.status(404).json({ error: "Client not found" });
        return;
      }

      const [result] = await connection.execute(
        `UPDATE clients
         SET name = ?, email = ?, phone = ?, kyc_status = ?,
             relationship_manager_id = ?, version = version + 1
         WHERE id = ? AND version = ?`,
        [
          name.trim(),
          email || null,
          phone || null,
          kycStatus,
          relationshipManagerId || null,
          req.params.id,
          version,
        ]
      );

      if ((result as { affectedRows: number }).affectedRows === 0) {
        await connection.rollback();
        res.status(409).json({
          error: "Client not found or version conflict",
        });
        return;
      }

      await connection.execute(
        `INSERT INTO audit_logs
          (entity_type, entity_id, action, changed_by, old_values, new_values)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          "CLIENT",
          req.params.id,
          "UPDATE",
          req.user.id,
          JSON.stringify(oldClient),
          JSON.stringify({
            name: name.trim(),
            email: email || null,
            phone: phone || null,
            kycStatus,
            relationshipManagerId: relationshipManagerId || null,
            version: version + 1,
          }),
        ]
      );

      await connection.commit();

      res.json({ message: "Client updated", version: version + 1 });
    } catch (error) {
      await connection.rollback();
      console.error("Client update failed:", error);
      res.status(500).json({ error: "Failed to update client" });
    } finally {
      connection.release();
    }
  }
);


app.get('/api/portfolios', authenticateToken, async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        p.id,
        p.client_id AS clientId,
        c.name AS clientName,
        p.name,
        p.base_currency AS baseCurrency,
        p.status
      FROM portfolios p
      LEFT JOIN clients c ON c.id = p.client_id
      ORDER BY p.id
    `)

    res.json(rows)
  } catch (error) {
    console.error('Failed to fetch portfolios:', error)
    res.status(500).json({ error: 'Failed to fetch portfolios' })
  }
})




// =====================================================
// START SERVER
// =====================================================

async function startServer(): Promise<void> {
  try {
    await initializeDatabase();

    const server = app.listen(port, () => {
      console.log(`Backend running at http://localhost:${port}`);
    });

    const shutdown = async () => {
      server.close(async () => {
        await pool.end();
        process.exit(0);
      });
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  } catch (error) {
    console.error("Application startup failed:", error);
    await pool.end();
    process.exitCode = 1;
  }
}

void startServer();
