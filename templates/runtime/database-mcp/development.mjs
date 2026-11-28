import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { documentLocations } from '../docs.mjs';
import { encode, json, read, safePath, write } from '../workspace-files.mjs';
import { databaseConfig, developmentTarget } from './config.mjs';

const receipts = '.matt/private/development-sql';
const sha256 = data => createHash('sha256').update(data).digest('hex');

function component(name) {
  return typeof name === 'string' && !!name.trim() && !name.startsWith('.') &&
    !/[<>:"/\\|?*\x00-\x1f]/.test(name) && !/[ .]$/.test(name) &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name);
}

function snapshot(root, requirement, file) {
  const parts = typeof requirement === 'string' ? requirement.split('/') : [];
  if (!parts.length || parts.length > 2 || !parts.every(part => component(part) && part.toLowerCase() !== '_templates') || !component(file) || !/\.sql$/i.test(file)) {
    throw new Error('请提供需求或需求/任务包目录，以及 delivery-sql 中的 SQL 文件名');
  }
  const connectionString = databaseConfig(root).developmentWriteConnectionString;
  if (!connectionString) throw new Error('本项目尚未启用开发库写连接');
  const docs = documentLocations(root, json(root, '.matt/workspace.json'));
  if (!docs.specs) throw new Error('请先确定本项目的 spec 位置');
  if (read(docs.specs, requirement + '/delivery.md') === null) throw new Error('请先在需求目录建立 delivery.md');
  const relativePath = 'delivery-sql/' + file;
  const name = requirement + '/' + relativePath;
  const sql = read(docs.specs, name);
  if (!sql?.trim() || sql.includes('\0')) throw new Error('需要非空的 UTF-8 SQL 文件');
  const scope = { requirement, file, relativePath, path: join(docs.specs, name), sha256: sha256(sql), target: developmentTarget(connectionString) };
  return { sql, scope, connectionString };
}

export async function confirmDevelopmentSql(root, { requirement, file, impact }, confirm) {
  const { sql, scope, connectionString } = snapshot(root, requirement, file);
  if (!await confirm({ ...scope, impact, sql })) return { status: '未批准' };
  const record = { ...scope, impact, binding: sha256(connectionString), approvedAt: new Date().toISOString(), nonce: randomUUID() };
  const approvalId = sha256(JSON.stringify(record));
  write(root, receipts + '/' + approvalId + '.json', encode(record), null, 0o600);
  return { status: '已批准', approvalId, ...scope };
}

export async function applyDevelopmentSql(root, approvalId, execute) {
  if (!/^[0-9a-f]{64}$/.test(approvalId)) throw new Error('无效的人工批准编号');
  const base = receipts + '/' + approvalId;
  const grant = json(root, base + '.json', {});
  if (!grant.approvedAt || sha256(JSON.stringify(grant)) !== approvalId) throw new Error('缺少本次脚本的有效人工批准');
  const receipt = base + '.execution.json';
  const prior = json(root, receipt, null);
  if (prior) return prior;
  const claim = base + '.claimed';
  const pending = { requirement: grant.requirement, relativePath: grant.relativePath, sha256: grant.sha256,
    target: grant.target, approvedAt: grant.approvedAt, status: '执行中或结果待核对' };
  if (read(root, claim) !== null) return pending;
  const { scope, sql, connectionString } = snapshot(root, grant.requirement, grant.file);
  if (grant.path !== scope.path || grant.sha256 !== scope.sha256 || grant.binding !== sha256(connectionString)) {
    throw new Error('脚本内容、位置或开发库连接已变化，需要重新确认');
  }
  // Exclusive creation precedes any database I/O. A lost reply or process crash
  // leaves a durable claim which a retry can inspect but can never execute again.
  try { writeFileSync(safePath(root, claim), '', { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if (error.code === 'EEXIST') return json(root, receipt, pending);
    throw error;
  }
  const result = { ...pending };
  try {
    await execute(connectionString, sql);
    result.status = '执行成功';
  } catch (error) {
    result.status = '执行未确认成功，请核对数据库后再申请';
    if (/^[A-Z0-9]{5}$/.test(error.code)) result.sqlState = error.code;
  }
  result.finishedAt = new Date().toISOString();
  write(root, receipt, encode(result), null, 0o600);
  return result;
}
