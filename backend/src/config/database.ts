
import "dotenv/config";
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "custody_app",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "custody_ops",
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: false,
});

export default pool;
