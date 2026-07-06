import { Pool } from "pg";
import type { DatabaseAdapter, SchemaArgs, SelectArgs } from "./types.js";

type PostgresOptions = {
  connectionString: string;
  defaultLimit?: number;
  maxLimit?: number;
  statementTimeoutMs?: number;
};

const allowedPrefixes = ["select", "with", "show", "explain", "describe", "desc"];
const blockedPattern =
  /\b(insert|update|delete|upsert|merge|create|alter|drop|truncate|grant|revoke|copy|vacuum|analyze|refresh|reindex|cluster|listen|notify|lock|set\s+role|reset|call|do|execute|prepare|deallocate)\b/i;

export function createPostgresAdapter(options: PostgresOptions): DatabaseAdapter {
  const pool = new Pool({ connectionString: options.connectionString });
  const defaultLimit = options.defaultLimit ?? 200;
  const maxLimit = options.maxLimit ?? 1000;
  const statementTimeoutMs = options.statementTimeoutMs ?? 15000;

  return {
    async schema(args: SchemaArgs) {
      const includeColumns = args.include_columns !== false;
      const includeIndexes = args.include_indexes !== false;
      const includeForeignKeys = args.include_foreign_keys !== false;
      const table = args.table?.trim() || null;
      const client = await pool.connect();

      try {
        const tableRows = await client.query(
          `
            select table_name
            from information_schema.tables
            where table_schema = 'public'
              and table_type = 'BASE TABLE'
              and ($1::text is null or table_name = $1)
            order by table_name
          `,
          [table]
        );

        const tables = [];
        for (const row of tableRows.rows) {
          const tableName = row.table_name as string;
          const item: Record<string, unknown> = { name: tableName };

          if (includeColumns) {
            const columns = await client.query(
              `
                select column_name, data_type, is_nullable, column_default
                from information_schema.columns
                where table_schema = 'public' and table_name = $1
                order by ordinal_position
              `,
              [tableName]
            );
            item.columns = columns.rows;
          }

          if (includeIndexes) {
            const indexes = await client.query(
              `
                select indexname, indexdef
                from pg_indexes
                where schemaname = 'public' and tablename = $1
                order by indexname
              `,
              [tableName]
            );
            item.indexes = indexes.rows;
          }

          if (includeForeignKeys) {
            const foreignKeys = await client.query(
              `
                select
                  tc.constraint_name,
                  kcu.column_name,
                  ccu.table_name as foreign_table_name,
                  ccu.column_name as foreign_column_name
                from information_schema.table_constraints tc
                join information_schema.key_column_usage kcu
                  on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
                join information_schema.constraint_column_usage ccu
                  on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
                where tc.constraint_type = 'FOREIGN KEY'
                  and tc.table_schema = 'public'
                  and tc.table_name = $1
                order by tc.constraint_name, kcu.column_name
              `,
              [tableName]
            );
            item.foreign_keys = foreignKeys.rows;
          }

          tables.push(item);
        }

        return JSON.stringify({ database: "PostgreSQL", schema: "public", tables }, null, 2);
      } finally {
        client.release();
      }
    },

    async select(args: SelectArgs) {
      const query = normalizeQuery(String(args.query ?? "").trim(), Math.min(Math.max(Number(args.limit ?? defaultLimit), 1), maxLimit));
      const client = await pool.connect();
      const started = Date.now();

      try {
        await client.query("begin read only");
        await client.query(`set local statement_timeout = '${statementTimeoutMs}ms'`);
        const result = await client.query(query);
        await client.query("rollback");

        return JSON.stringify(
          {
            query,
            row_count: result.rowCount ?? result.rows.length,
            elapsed_ms: Date.now() - started,
            rows: result.rows,
          },
          null,
          2
        );
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

function normalizeQuery(query: string, limit: number) {
  if (!query) throw new Error("The query field is required.");
  const trimmed = query.replace(/;\s*$/, "").trim();
  if (trimmed.includes(";")) throw new Error("Only one SQL statement is allowed.");
  if (blockedPattern.test(trimmed)) {
    throw new Error("Only SELECT, WITH ... SELECT, SHOW, EXPLAIN, DESCRIBE, and DESC queries are allowed.");
  }

  const prefix = trimmed.split(/\s+/, 1)[0]?.toLowerCase();
  if (!allowedPrefixes.includes(prefix)) {
    throw new Error("Only SELECT, WITH ... SELECT, SHOW, EXPLAIN, DESCRIBE, and DESC queries are allowed.");
  }

  if (prefix === "describe" || prefix === "desc") {
    const tableName = trimmed.split(/\s+/)[1]?.replace(/"/g, "");
    if (!tableName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) throw new Error("Invalid table name.");
    return `
      select column_name, data_type, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public' and table_name = '${tableName}'
      order by ordinal_position
      limit ${limit}
    `;
  }

  if ((prefix === "select" || prefix === "with") && !/\blimit\s+\d+\b/i.test(trimmed)) {
    return `${trimmed} LIMIT ${limit}`;
  }

  return trimmed;
}
