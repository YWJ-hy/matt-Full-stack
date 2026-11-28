import pg from 'pg';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { connectionFor, databaseConfig } from './config.mjs';
import { confirmDevelopmentSql, applyDevelopmentSql } from './development.mjs';
import { confirmWithPerson } from './confirmation.mjs';

const [root, role] = process.argv.slice(2);
if (root === '--check-deps') process.exit(0);
const identifier = z.string().min(1).max(128);
const server = new McpServer({ name: 'matt-db-schema', version: '1.0.0' });

// Open a short-lived connection for each call so credential rotation and disabling
// a role also take effect in an already-running bot chat.
function tool(name, description, inputSchema, query) {
  server.registerTool(name, { description, inputSchema, annotations: { readOnlyHint: true } }, async args => {
    let client;
    try {
      const connectionString = connectionFor(databaseConfig(root), role);
      if (!connectionString) throw new Error('disabled');
      client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000, query_timeout: 10000 });
      await client.connect();
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query("SET LOCAL statement_timeout = '8s'");
      const value = await query(client, args);
      await client.query('COMMIT');
      return { content: [{ type: 'text', text: JSON.stringify(value) }] };
    } catch {
      return { isError: true, content: [{ type: 'text', text: '无法读取数据库结构。请核对本机数据库配置、网络和元数据读取权限。' }] };
    } finally {
      if (client) await client.end().catch(() => {});
    }
  });
}

tool('list_tables', '分页列出可见的业务表和视图。可按 schema 筛选。', {
  schema: identifier.optional(), limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().nonnegative().default(0),
}, async (client, { schema, limit, offset }) => {
  const { rows } = await client.query(`
    SELECT table_schema AS schema, table_name AS name, table_type AS type
    FROM information_schema.tables
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema') AND table_schema !~ '^pg_'
      AND ($1::text IS NULL OR table_schema = $1)
    ORDER BY table_schema, table_name LIMIT $2 OFFSET $3`, [schema ?? null, limit + 1, offset]);
  return { tables: rows.slice(0, limit), nextOffset: rows.length > limit ? offset + limit : null };
});

tool('describe_table', '读取指定表的列、类型、默认值、可空性、主键、外键和唯一约束。', {
  schema: identifier, table: identifier,
}, async (client, { schema, table }) => {
  const params = [schema, table];
  const columns = await client.query(`
    SELECT c.column_name AS name, pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
           c.is_nullable = 'YES' AS nullable, c.column_default AS "default"
    FROM information_schema.columns c
    JOIN pg_catalog.pg_namespace n ON n.nspname = c.table_schema
    JOIN pg_catalog.pg_class t ON t.relnamespace = n.oid AND t.relname = c.table_name
    JOIN pg_catalog.pg_attribute a ON a.attrelid = t.oid AND a.attname = c.column_name
    WHERE c.table_schema = $1 AND c.table_name = $2
    ORDER BY c.ordinal_position`, params);
  if (!columns.rowCount) return { found: false };
  const constraints = await client.query(`
    SELECT k.conname AS name, pg_catalog.pg_get_constraintdef(k.oid) AS definition
    FROM pg_catalog.pg_constraint k
    JOIN pg_catalog.pg_class t ON t.oid = k.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = $1 AND t.relname = $2 AND k.contype IN ('p', 'f', 'u')
    ORDER BY k.conname`, params);
  return { found: true, schema, table, columns: columns.rows, constraints: constraints.rows };
});

const initial = databaseConfig(root);
if (initial.developmentWriteConnectionString && role === 'matt') {
  server.registerTool('confirm_dev_sql', {
    description: '向人展示本需求的完整 SQL、目标开发库和影响，取得本次执行的批准编号。',
    inputSchema: { requirement: z.string().min(1).describe('相对 specs 的需求或需求/任务包目录'), file: z.string().min(1), impact: z.string().trim().min(1) },
  }, async (args, { signal }) => {
    const result = await confirmDevelopmentSql(root, args, review => confirmWithPerson(server.server, review, signal));
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  });
}
if (initial.developmentWriteConnectionString && role === 'backend') {
  server.registerTool('apply_dev_sql', {
    description: '按 Matt 取得的单次人工批准执行固定版本的开发 SQL。重复调用返回同一回执。',
    inputSchema: { approvalId: z.string().regex(/^[0-9a-f]{64}$/) }, annotations: { destructiveHint: true, idempotentHint: true },
  }, async ({ approvalId }) => {
    const result = await applyDevelopmentSql(root, approvalId, async (connectionString, sql) => {
      const endpoint = new URL(connectionString);
      if (!endpoint.port) endpoint.port = '5432';
      const client = new pg.Client({ connectionString: endpoint.href, connectionTimeoutMillis: 5000 });
      try {
        await client.connect();
        await client.query(sql);
        if (client.getTransactionStatus() !== 'I') throw new Error('脚本结束时事务尚未提交');
      } finally { await client.end().catch(() => {}); }
    });
    return { isError: result.status !== '执行成功', content: [{ type: 'text', text: JSON.stringify(result) }] };
  });
}

await server.connect(new StdioServerTransport());
