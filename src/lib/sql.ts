import { isCloudflareWorker } from "./cloudflare-env";
import { fileHref, importNodeModule } from "./node-import";

export type SqlRow = Record<string, unknown>;

export type SqlClient = {
  get(sql: string, params?: unknown[]): Promise<SqlRow | null>;
  all(sql: string, params?: unknown[]): Promise<SqlRow[]>;
  run(sql: string, params?: unknown[]): Promise<void>;
};

type SqliteModule = {
  createSqliteClient(): SqlClient;
  closeSqlite(): void;
};

let clientPromise: Promise<SqlClient> | null = null;

async function loadSqlite(): Promise<SqliteModule> {
  const path = await importNodeModule<typeof import("node:path")>(["node", "path"].join(":"));
  const href = fileHref(path.join(process.cwd(), "src/lib/sqlite-client.mjs"));
  return importNodeModule<SqliteModule>(href);
}

export async function resetSqlClient(): Promise<void> {
  clientPromise = null;
  if (!isCloudflareWorker()) {
    const sqlite = await loadSqlite();
    sqlite.closeSqlite();
  }
}

export function getSql(): Promise<SqlClient> {
  if (!clientPromise) clientPromise = openSql();
  return clientPromise;
}

async function openSql(): Promise<SqlClient> {
  if (isCloudflareWorker()) {
    const { createD1Client } = await import("./d1-client");
    return createD1Client();
  }
  const sqlite = await loadSqlite();
  return sqlite.createSqliteClient();
}
