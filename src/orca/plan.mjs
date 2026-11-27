import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { source, version } from '../release.mjs';
import { skillSources } from '../matt-skills.mjs';
import { systemEnv } from '../../templates/runtime/system-env.mjs';
import { documentLocations } from '../../templates/runtime/docs.mjs';
import { parseWorkflow, savedProvider } from '../../templates/runtime/workflow.mjs';
import { digest, encode, json, read, soulSection } from './files.mjs';
import { inventory } from './cli.mjs';
import { planDatabase } from './database.mjs';

export const configPath = '.matt/orca.json';
export const statePath = '.matt/private/orca-install.json';
export const markerPath = '.matt-orca.json';
export const team = json(source, 'templates/orca/team.json');
export const roles = Object.keys(team.roles);
export const botRoot = () => join(homedir(), '.orca', 'bots');
export const samePath = (a, b) => process.platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b);

function object(value, name, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} 需要对象`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new Error(`${name} 不支持 ${key}`);
}

function defaults(root) {
  const prefix = basename(root).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 16).replace(/-$/, '') || 'project';
  const projectId = `${prefix}-${digest(root).slice(0, 6)}`;
  return { version: 1, projectId, bots: Object.fromEntries(roles.map(role => [role, `${projectId}-${role}`])), repos: { frontend: null, backend: null } };
}

function configuration(root) {
  const config = json(root, configPath, defaults(root));
  object(config, configPath, ['version', 'projectId', 'bots', 'repos']);
  if (config.version !== 1 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(config.projectId) || config.projectId.length > 24) throw new Error('orca.json 需要 version 1 和至多 24 字符的 projectId（小写字母、数字、连字符）');
  object(config.bots, 'bots', roles);
  for (const role of roles) if (typeof config.bots[role] !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(config.bots[role]) || config.bots[role].length > 40) throw new Error(`bots.${role} 需要至多 40 字符的小写名字`);
  if (new Set(Object.values(config.bots)).size !== roles.length) throw new Error('四个 bot 必须使用不同名字');
  object(config.repos, 'repos', ['frontend', 'backend']);
  for (const role of ['frontend', 'backend']) if (config.repos[role] !== null && (typeof config.repos[role] !== 'string' || !/^id:.+/.test(config.repos[role]))) throw new Error(`repos.${role} 需要 Orca id: 标识或 null（按路径发现）`);
  return config;
}

export function validateHome(home, homes) {
  if (typeof home !== 'string' || !samePath(dirname(resolve(home)), homes)) throw new Error('bot home 必须是本机 ~/.orca/bots 的直接子目录');
  if (lstatSync(homes).isSymbolicLink() || lstatSync(home).isSymbolicLink() || !lstatSync(home).isDirectory()) throw new Error('bot home 必须是实际目录，不能是链接');
  const actual = realpathSync(home);
  if (!samePath(dirname(actual), realpathSync(homes))) throw new Error('bot home 不在实际 bots 目录内');
  return actual;
}

export function loadState(root, config) {
  const state = json(root, statePath, { format: 1, toolkitVersion: version, workspaceRoot: root, projectId: config.projectId, bots: {}, offers: {} });
  if (state.format !== 1 || typeof state.toolkitVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(state.toolkitVersion) || typeof state.workspaceRoot !== 'string' || !samePath(state.workspaceRoot, root) || state.projectId !== config.projectId) throw new Error('安装状态与当前项目不符，请核对 orca-install.json');
  object(state.bots, 'state.bots', roles); object(state.offers, 'state.offers', roles);
  if (version.localeCompare(state.toolkitVersion, 'en', { numeric: true }) < 0) throw new Error('当前工具早于 bot 安装版本，请使用新版');
  for (const binding of Object.values(state.bots)) {
    if (!binding || typeof binding.id !== 'string' || typeof binding.home !== 'string' || !binding.files || typeof binding.files !== 'object' || Array.isArray(binding.files)) throw new Error('bot 绑定状态格式无效');
  }
  return state;
}

function projectRepos(root, config, listed) {
  const workspace = json(root, '.matt/workspace.json');
  const result = {};
  for (const role of ['frontend', 'backend']) {
    const name = workspace[role]?.repo;
    if (typeof name !== 'string' || !name || /[\\/]/.test(name) || ['.', '..'].includes(name)) throw new Error(`请核对 workspace.json 的 ${role}.repo`);
    const checkout = realpathSync(join(root, name));
    const gitRoot = execFileSync('git', ['--no-optional-locks', 'rev-parse', '--show-toplevel'], { cwd: checkout, env: systemEnv(), encoding: 'utf8', windowsHide: true }).trim();
    if (!samePath(dirname(checkout), root) || !samePath(gitRoot, checkout)) throw new Error(`${role} 必须是父目录的直接 Git 子仓`);
    const selector = config.repos[role];
    const matches = listed.filter(repo => selector ? `id:${repo.id}` === selector : typeof repo.path === 'string' && samePath(repo.path, checkout));
    if (matches.length > 1) throw new Error(`${role} 匹配多个 Orca 项目，请在 orca.json 指定 id:`);
    const repo = matches[0];
    if (selector && !repo) throw new Error(`${role} 的 Orca 项目标识不存在：${selector}`);
    if (repo && (typeof repo.id !== 'string' || typeof repo.path !== 'string' || !samePath(repo.path, checkout) || (repo.kind && repo.kind !== 'git'))) throw new Error(`${role} 的 Orca 项目与实际仓库不符`);
    result[role] = { checkout, selector: repo ? `id:${repo.id}` : null };
  }
  if (samePath(result.frontend.checkout, result.backend.checkout)) throw new Error('前后端必须是两个独立仓库');
  return result;
}

export function installerCommand(root, operation = 'apply') {
  const quote = text => process.platform === 'win32' ? `'${text.replaceAll("'", "''")}'` : `'${text.replaceAll("'", "'\\''")}'`;
  return `node ${quote(join(source, 'bin/matt-orca.mjs'))} ${operation} --workspace ${quote(root)}`;
}

export function bootstrap(root, config) {
  return `团队 ${config.projectId}：先在 Orca 创建名为 ${config.bots.matt} 的主控 bot。\n在它的会话中发送：请从你自己的 bot home 执行以下安装命令，按回执完成团队安装与目录登记，安装后报告待处理项。\n${installerCommand(root)}\n其他 bot 接受创建后，也从各自 home 执行同一命令。已有绑定后可从普通终端升级。\n`;
}

function desiredFiles(root, config, role, repos, documents) {
  const purpose = team.roles[role].purpose;
  const files = {
    'SOUL.md': `## Matt 项目职责\n\n${purpose}\n\n本项目的需求、开发、审查、验收及团队就绪检查，先读取 skills/matt-orca/SKILL.md；角色、项目位置与协作对象见该 skill 的 project.json。模型规则以该 skill 为准。`,
    'skills/matt-orca/SKILL.md': read(source, 'templates/orca/SKILL.md'),
    'skills/matt-orca/role.md': read(source, `templates/orca/roles/${role}.md`),
    'skills/matt-orca/references/protocol.md': read(source, 'templates/orca/protocol.md'),
    'skills/matt-orca/project.json': encode({ version: 1, role, projectId: config.projectId, workspaceRoot: root, installer: join(source, 'bin/matt-orca.mjs'), bots: config.bots, repos, documents }),
  };
  for (const skill of team.roles[role].skills) {
    const entry = Object.entries(skillSources).find(([path]) => path.endsWith(`/${skill}`));
    if (!entry) throw new Error(`没有随包 skill：${skill}`);
    for (const resource of entry[1]) files[`skills/${skill}/${resource}`] = read(source, `vendor/mattpocock/${skill}/${resource}`);
  }
  return files;
}

export function buildPlan({ root, client, cwd = process.cwd(), homes = botRoot() }) {
  root = realpathSync(root);
  if (samePath(root, source)) throw new Error('请选择已初始化的消费工作区父目录，不是工具包仓库');
  const config = configuration(root);
  const state = loadState(root, config);
  const layout = documentLocations(root, json(root, '.matt/workspace.json'));
  if (layout.status === 'ambiguous') throw new Error('存在多份文档路径配置，请用 matt docs 核对候选，按已确认的位置选择 --owner');
  const documents = { agentDocs: layout.agentDocs, specs: layout.specs, fallbackTemplates: layout.fallbackTemplates, source: layout.source };
  const { e2e } = parseWorkflow(read(root, '.matt/workflow.json') ?? '');
  const runtime = join(root, '.matt/runtime/sessions.mjs');
  if (!existsSync(runtime)) throw new Error('请先用 matt init 初始化消费工作区');
  let sessions;
  try { sessions = JSON.parse(execFileSync(process.execPath, [runtime, '--host', 'orca'], { cwd: root, encoding: 'utf8', env: systemEnv(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })); }
  catch (error) { throw new Error(`无法解析 Orca 派单配置，请运行 matt update 并核对 sessions.json：${error.stderr?.toString().trim() || error.message}`); }
  const listing = inventory(client);
  const repos = projectRepos(root, config, listing.repos);
  const pending = [], changes = [], conflicts = [], bots = [];
  const conventions = read(root, 'CLAUDE.md') ?? read(root, 'AGENTS.md') ?? '';
  if (layout.source) {
    for (const name of ['issue-tracker.md', 'domain.md']) {
      if (!existsSync(documents.agentDocs) || !read(documents.agentDocs, name)?.trim()) pending.push({ kind: 'conventions', detail: `缺少共享约定：${join(documents.agentDocs, name)}；请核对分支和已选路径` });
    }
  } else if (!/^## Agent skills\s*$/m.test(conventions)) pending.push({ kind: 'conventions', detail: '父目录尚未登记 Agent skills 共享约定，请按 AI_SETUP.md 完成环境接入' });
  for (const path of ['.matt/AI_SETUP.md', '.matt/runtime/tasks.mjs', '.matt/runtime/workspace-files.mjs', '.matt/runtime/docs.mjs', '.agents/skills/matt-full-stack/SKILL.md', ...['dispatch', 'review', 'worktrees', 'issues', 'acceptance', 'tasks', 'claims'].map(name => `.agents/skills/matt-full-stack/references/${name}.md`)]) {
    if (!read(root, path)?.trim()) pending.push({ kind: 'workspace-assets', detail: `父层工作流文件缺失或为空：${path}；请用 matt update 修复` });
  }
  for (const [role, repo] of Object.entries(repos)) if (!repo.selector) pending.push({ kind: 'repo', role, detail: `apply 将注册 ${repo.checkout}` });
  if (read(root, configPath) === null) changes.push({ root, path: configPath, old: null, next: encode(config), action: 'seed' });
  const selfBots = listing.bots.filter(bot => bot.self);
  if (selfBots.length > 1) throw new Error('Orca 返回多个调用者 bot，无法登记');
  const caller = selfBots[0];
  let callerRole = null;
  for (const role of roles) {
    const name = config.bots[role];
    const matches = listing.bots.filter(bot => bot.name.toLowerCase() === name.toLowerCase());
    if (matches.length > 1) throw new Error(`本机有多个同名 bot：${name}`);
    const bot = matches[0];
    const saved = state.bots[role];
    if (saved && (!bot || saved.id !== bot.id)) throw new Error(`${name} 已删除、重建或改名；请核对安装绑定，不能自动接管另一个 bot`);
    if (!bot) {
      const offer = state.offers[role];
      if (offer && (offer.name !== name || !['pending', 'unknown'].includes(offer.status))) throw new Error(`${role} 创建回执与配置不符，请核对安装状态`);
      const status = offer?.status ?? 'missing';
      bots.push({ role, name, status });
      pending.push({ kind: 'bot', role, detail: status === 'missing' ? `待创建 ${name}` : `${name} 创建卡片${status === 'unknown' ? '结果不明，请在 Orca 核对，脚本不会重发' : '待接受；拒绝后需明确清除此角色的 offer 记录才会重新提出'}` });
      continue;
    }
    let home = saved?.home;
    if (caller?.id === bot.id) {
      callerRole = role;
      if (!home) home = validateHome(realpathSync(cwd), homes);
      else if (!samePath(realpathSync(cwd), home)) throw new Error(`请从 ${home} 执行本 bot 的登记/升级`);
    }
    if (!home) {
      bots.push({ role, name, id: bot.id, status: 'unbound' });
      pending.push({ kind: 'binding', role, detail: `在 ${name} 的会话中从自己的 home 运行 apply` });
      continue;
    }
    home = validateHome(home, homes);
    const identity = { format: 1, workspaceRoot: root, projectId: config.projectId, role, botId: bot.id };
    const marker = read(home, markerPath);
    if (marker !== null && digest(marker) !== digest(encode(identity))) throw new Error(`${home} 已绑定其他项目或角色，请核对 ${markerPath}`);
    if (saved && marker === null) throw new Error(`${home} 缺少身份标记，请恢复绑定后再升级`);
    if (!saved && marker === null) changes.push({ root: home, path: markerPath, old: null, next: encode(identity), action: 'bind', role });
    const files = desiredFiles(root, config, role, repos, documents), hashes = {};
    for (const [path, content] of Object.entries(files)) {
      const old = read(home, path);
      const section = path === 'SOUL.md' ? soulSection(old, content) : { current: old, fresh: content, next: content };
      if (path === 'SOUL.md' && old === null) section.next = `${team.roles[role].purpose}\n\n${section.next}`;
      const local = digest(section.current), upstream = digest(section.fresh);
      hashes[path] = upstream;
      if (local === upstream) continue;
      if (section.current === null || local === saved?.files[path]) changes.push({ root: home, path, old, next: section.next, action: old === null ? 'create' : 'update', role });
      else conflicts.push({ role, path: join(home, path), scope: path === 'SOUL.md' ? 'section' : 'file', expected: upstream, local, base: saved?.files[path] ?? null, proposed: section.fresh });
    }
    bots.push({ role, name, id: bot.id, agent: bot.agent, home, status: bot.paused ? 'paused' : 'bound', files: hashes });
    if (!saved || digest(encode(saved.files)) !== digest(encode(hashes))) pending.push({ kind: 'registration', role, detail: `${name} 需要 apply 登记当前文件版本` });
    if (bot.paused) pending.push({ kind: 'paused', role, detail: `${name} 在 Orca 中已暂停` });
  }
  const database = planDatabase(root, bots, state, client, changes, conflicts, pending);
  return { root, config, database, state, documents, e2e: e2e.enabled, e2eProvider: savedProvider(e2e) ?? null, repos, sessions, callerRole, bots, changes, conflicts, pending, bootstrap: bootstrap(root, config) };
}

export function report(plan) {
  return { workspaceRoot: plan.root, projectId: plan.config.projectId, database: plan.database, documents: plan.documents, e2e: plan.e2e, e2eProvider: plan.e2eProvider, config: plan.config, repos: plan.repos, sessions: plan.sessions, callerRole: plan.callerRole, bots: plan.bots.map(({ files, ...bot }) => bot), changes: plan.changes.map(({ root, path, action, role }) => ({ path: join(root, path), action, ...(role ? { role } : {}) })), conflicts: plan.conflicts, pending: plan.pending, bootstrap: plan.bootstrap };
}
