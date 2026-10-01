import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

let database = null;

function file() {
  const configured = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "agency-operator.sqlite");
  if (configured === ":memory:") return ":memory:";
  const abs = path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
  mkdirSync(path.dirname(abs), { recursive: true });
  return abs;
}

function connection() {
  if (database) return database;
  database = new DatabaseSync(file());
  database.exec("PRAGMA journal_mode = WAL;");
  const schema = readFileSync(path.join(process.cwd(), "migrations", "0001_init.sql"), "utf8");
  database.exec(schema);
  return database;
}

export function closeSqlite() {
  database?.close();
  database = null;
}

function bindable(value) {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") return value;
  if (value instanceof Uint8Array) return value;
  return String(value);
}

export function createSqliteClient() {
  return {
    async get(sql, params = []) {
      const row = connection().prepare(sql).get(...params.map(bindable));
      return row ?? null;
    },
    async all(sql, params = []) {
      return connection().prepare(sql).all(...params.map(bindable));
    },
    async run(sql, params = []) {
      connection().prepare(sql).run(...params.map(bindable));
    },
  };
}
