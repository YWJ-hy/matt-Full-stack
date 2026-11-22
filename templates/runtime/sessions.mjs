import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { systemEnv } from './system-env.mjs';

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

function worktreeBase(role) {
  const repo = load('.matt/workspace.json')[role]?.repo;
  if (typeof repo !== 'string' || !repo || /[\\/]/.test(repo) || repo === '.' || repo === '..') throw new Error(`请核对 ${role}.repo：需要共同父目录的直接子仓`);
  const checkout = realpathSync(resolve(workspace, repo));
  const git = (...args) => execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', ...args], { cwd: checkout, env: systemEnv(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd();
  if (dirname(checkout) !== realpathSync(workspace) || realpathSync(git('rev-parse', '--show-toplevel')) !== checkout) throw new Error(`${role}.repo 不是本端仓库根目录`);
  const branch = git('branch', '--show-current');
  if (!branch) throw new Error(`${role} 处于 detached HEAD，请先确认并选定原分支`);
  let sha;
  try { sha = git('rev-parse', '--verify', `refs/heads/${branch}^{commit}`); }
  catch { throw new Error(`${role} 分支 ${branch} 尚无提交或无法解析其提交，请先核对基线`); }
  const dirty = Boolean(git('status', '--porcelain', '--untracked-files=normal', '--ignore-submodules=none'));
  return { checkout, branch, sha, dirty };
}

function plan() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { models: { type: 'string' }, 'worktree-base': { type: 'boolean' } } });
  const [selected] = positionals;
  if (positionals.length > 1 || (selected !== undefined && !roles.includes(selected))) throw new Error('用法：sessions.mjs [frontend|backend|standards|spec] [--models 映射文件] [--worktree-base]');
  if (values['worktree-base'] && !['frontend', 'backend'].includes(selected)) throw new Error('--worktree-base 仅用于 frontend 或 backend 实现角色');
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
    result[role] = { role, model: resolved, worktree, workspaceRoot: workspace, repository: review ? 'implementation' : role, access: review ? 'read-only' : 'implementation', freshContext: true };
    if (values['worktree-base']) {
      if (!worktree) throw new Error(`${role} 未配置 worktree: true`);
      result[role].worktreeBase = worktreeBase(role);
    }
  }
  return selected ? result[selected] : result;
}

try { console.log(JSON.stringify(plan(), null, 2)); }
catch (error) { console.error(error.message); process.exitCode = 1; }
