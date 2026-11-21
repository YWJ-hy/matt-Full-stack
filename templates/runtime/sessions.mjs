import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const roles = ['frontend', 'backend', 'standards', 'spec'];
const workspace = resolve(fileURLToPath(new URL('../../', import.meta.url)));

function object(value, label, allowed) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} 需要 JSON 对象`);
  for (const key of Object.keys(value)) {
    if (allowed && !allowed.includes(key)) throw new Error(`${label} 中无法识别 ${key}`);
  }
  return value;
}

function load(file) {
  const contents = readFileSync(resolve(workspace, file), 'utf8');
  try { return JSON.parse(contents.replace(/^\uFEFF/, '')); }
  catch { throw new Error(`${file} 的 JSON 格式无效`); }
}

function validModel(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && !/[\x00-\x1f]/.test(value);
}

function plan() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { models: { type: 'string' } } });
  const [selected] = positionals;
  if (positionals.length > 1 || (selected !== undefined && !roles.includes(selected))) throw new Error('用法：sessions.mjs [frontend|backend|standards|spec] [--models 映射文件]');
  const config = object(load('.matt/sessions.json'), 'sessions', ['version', 'roles']);
  if (config.version !== 1) throw new Error('需要 sessions.json version 1');
  object(config.roles, 'roles', roles);
  let aliases;
  if (values.models !== undefined) aliases = object(load(values.models), '模型映射');
  const result = {};
  for (const role of roles) {
    const settings = object(Object.hasOwn(config.roles, role) ? config.roles[role] : {}, role, ['model', 'worktree']);
    const { model = 'inherit', worktree = false } = settings;
    if (!validModel(model) || typeof worktree !== 'boolean') throw new Error(`${role} 需要非空 model 字符串和布尔 worktree`);
    if (selected && selected !== role) continue;
    let resolved = model;
    if (model.startsWith('@')) {
      aliases ??= object(load('.matt/private/models.json'), '模型映射');
      const alias = model.slice(1);
      resolved = Object.hasOwn(aliases, alias) ? aliases[alias] : undefined;
      if (!alias || !validModel(resolved) || resolved.startsWith('@') || resolved === 'inherit') throw new Error(`请为 ${role} 的 ${model} 映射当前工具支持的模型 ID`);
    }
    const review = role === 'standards' || role === 'spec';
    result[role] = { role, model: resolved, worktree, workspaceRoot: workspace, repository: review ? 'implementation' : role, access: review ? 'read-only' : 'implementation', freshContext: review };
  }
  return selected ? result[selected] : result;
}

try { console.log(JSON.stringify(plan(), null, 2)); }
catch (error) { console.error(error.message); process.exitCode = 1; }
