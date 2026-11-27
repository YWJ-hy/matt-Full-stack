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

function worktreeBase(role, options) {
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
  const targetBranch = options['target-branch'] ?? branch;
  let targetSha = sha;
  if (targetBranch !== branch) {
    try {
      git('check-ref-format', `refs/heads/${targetBranch}`);
      targetSha = git('rev-parse', '--verify', '--end-of-options', `refs/heads/${targetBranch}^{commit}`);
    } catch { throw new Error(`请核对本端合回目标分支：${targetBranch}`); }
  }
  const requiredShas = options['requires-sha'] ?? [];
  const startSha = options['start-sha'] ?? requiredShas[0] ?? targetSha;
  for (const commit of new Set([startSha, ...requiredShas])) {
    if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commit)) throw new Error('起点和依赖需要本仓已交付的完整提交 SHA');
    try {
      if (git('rev-parse', '--verify', '--end-of-options', `${commit}^{commit}`) !== commit) throw new Error();
    } catch { throw new Error(`本仓没有可核实的提交：${commit}`); }
  }
  for (const dep of requiredShas) {
    try { git('merge-base', '--is-ancestor', dep, startSha); }
    catch { throw new Error(`起点 ${startSha} 未包含依赖 ${dep}，请提供已验证的组合提交`); }
  }
  return { checkout, branch, sha, dirty, startSha, targetBranch, targetSha };
}

function plan() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    models: { type: 'string' }, model: { type: 'string' }, host: { type: 'string' }, 'worktree-base': { type: 'boolean' },
    'target-branch': { type: 'string' }, 'start-sha': { type: 'string' }, 'requires-sha': { type: 'string', multiple: true },
  } });
  const [selected] = positionals;
  if (positionals.length > 1 || (selected !== undefined && !roles.includes(selected))) throw new Error('用法：sessions.mjs [frontend|backend|standards|spec] [--models 映射文件] [--worktree-base]');
  if (values.host !== undefined && values.host !== 'orca') throw new Error('--host 仅支持 orca；其他宿主省略该参数');
  if (values.model !== undefined && (values.host !== 'orca' || !selected)) throw new Error('--model 仅用于 --host orca 且已指定角色的派单');
  if (values['worktree-base'] && !['frontend', 'backend'].includes(selected)) throw new Error('--worktree-base 仅用于 frontend 或 backend 实现角色');
  if (!values['worktree-base'] && ['target-branch', 'start-sha', 'requires-sha'].some(key => values[key] !== undefined)) throw new Error('起点、依赖和目标选项需要 --worktree-base');
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
    const requested = values.model ?? model;
    if (!validModel(requested)) throw new Error('派单 model 需要非空字符串');
    let resolved = requested;
    if (requested.startsWith('@')) {
      aliases ??= object(load('.matt/private/models.json'), '模型映射');
      const alias = requested.slice(1);
      resolved = Object.hasOwn(aliases, alias) ? aliases[alias] : undefined;
      if (!alias || !validModel(resolved) || resolved.startsWith('@') || ['inherit', 'bot-default'].includes(resolved)) throw new Error(`请为 ${role} 的 ${requested} 映射当前工具支持的模型 ID`);
    }
    if (resolved === 'bot-default' && values.host !== 'orca') throw new Error('bot-default 仅适用于 --host orca');
    const review = role === 'standards' || role === 'spec';
    result[role] = { role, model: resolved, worktree, workspaceRoot: workspace, repository: review ? 'implementation' : role, access: review ? 'read-only' : 'implementation', freshContext: true };
    if (values.host === 'orca') {
      const defaultModel = ['inherit', 'bot-default'].includes(resolved);
      result[role].model = defaultModel ? null : resolved;
      result[role].modelSource = defaultModel ? 'bot-default' : values.model !== undefined ? 'dispatch' : 'role';
      result[role].botRole = review ? 'quality' : role;
    }
    if (values['worktree-base']) {
      if (!worktree) throw new Error(`${role} 未配置 worktree: true`);
      result[role].worktreeBase = worktreeBase(role, values);
    }
  }
  return selected ? result[selected] : result;
}

try { console.log(JSON.stringify(plan(), null, 2)); }
catch (error) { console.error(error.message); process.exitCode = 1; }
