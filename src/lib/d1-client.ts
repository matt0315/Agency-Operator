import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { SqlClient, SqlRow } from "./sql";

type D1Like = {
  prepare(sql: string): {
    bind(...params: unknown[]): {
      first<T>(): Promise<T | null>;
      all<T>(): Promise<{ results: T[] }>;
      run(): Promise<unknown>;
    };
  };
};

export async function createD1Client(): Promise<SqlClient> {
  const { env } = await getCloudflareContext({ async: true });
  const database = (env as { DB?: D1Like }).DB;
  if (!database) throw new Error("D1 binding DB is not configured.");
  return {
    async get(sql, params = []) {
      const row = await database.prepare(sql).bind(...params.map(nullish)).first<SqlRow>();
      return row ?? null;
    },
    async all(sql, params = []) {
      const result = await database.prepare(sql).bind(...params.map(nullish)).all<SqlRow>();
      return result.results ?? [];
    },
    async run(sql, params = []) {
      await database.prepare(sql).bind(...params.map(nullish)).run();
    },
  };
}

function nullish(value: unknown): unknown {
  return value === undefined ? null : value;
}
