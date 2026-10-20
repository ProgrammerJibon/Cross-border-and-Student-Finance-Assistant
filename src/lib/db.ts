import "server-only";
import "./env";
import mysql, {
  type PoolConnection,
  type RowDataPacket,
  type ResultSetHeader,
} from "mysql2/promise";
const globalDb = globalThis as unknown as { dbPool?: mysql.Pool };
export const pool =
  globalDb.dbPool ??
  mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME || "finbridge_ai",
    user: process.env.DB_USER || "finbridge",
    password: process.env.DB_PASSWORD,
    waitForConnections: true,
    connectionLimit: 10,
    timezone: "Z",
    dateStrings: true,
    decimalNumbers: false,
    multipleStatements: false,
    charset: "utf8mb4",
    typeCast: function (field, next) {
      if (field.type === "JSON") {
        return field.string();
      }
      return next();
    },
  });
if (!globalDb.dbPool) {
  pool.on("connection", (connection) => {
    connection.query("SET time_zone = '+00:00'");
  });
}
if (process.env.NODE_ENV !== "production") globalDb.dbPool = pool;
export type DB = PoolConnection;
type SqlValue = string | number | boolean | null | Date | Buffer;
export async function rows<T = import("@/types").Row>(
  sql: string,
  values: SqlValue[] = [],
  db?: DB,
): Promise<T[]> {
  const [result] = await (db || pool).execute<RowDataPacket[]>(sql, values);
  return result as T[];
}
export async function write(sql: string, values: SqlValue[] = [], db?: DB) {
  const [r] = await (db || pool).execute<ResultSetHeader>(sql, values);
  return r;
}
export async function atomic<T>(fn: (db: DB) => Promise<T>): Promise<T> {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const result = await fn(db);
    await db.commit();
    return result;
  } catch (e) {
    await db.rollback();
    throw e;
  } finally {
    db.release();
  }
}
