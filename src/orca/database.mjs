import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { configPath, connectionFor, databaseConfig, emptyConfig } from '../../templates/runtime/database-mcp/config.mjs';
import { systemEnv } from '../../templates/runtime/system-env.mjs';
import { digest, encode, read, safePath, write } from './files.mjs';

const runtime = '.matt/runtime/database-mcp';
const receipt = runtime + '/node_modules/.matt-lock';
export const toolName = 'matt_db_schema';

export function planDatabase(root, bots, state, client, changes, conflicts, pending) {
  if (!existsSync(safePath(root, configPath))) {
    changes.push({ root, path: configPath, old: null, next: encode(emptyConfig), action: 'seed', mode: 0o600 });
  }
  const config = databaseConfig(root);
  const developmentWrites = Boolean(config.developmentWriteConnectionString);
  const enabledRoles = ['matt', 'backend', 'quality'].filter(role =>
    connectionFor(config, role) || (developmentWrites && ['matt', 'backend'].includes(role)));
  const result = { configPath: join(root, configPath), enabledRoles, developmentWrites, bindings: [], installDependencies: false };
  const entry = join(root, runtime, 'server.mjs');
  if (enabledRoles.length) {
    for (const file of ['server.mjs', 'config.mjs', 'development.mjs', 'confirmation.mjs', 'package.json', 'package-lock.json']) {
      if (!existsSync(safePath(root, runtime + '/' + file))) throw new Error('请先运行 matt update --apply 安装数据库 MCP 运行文件');
    }
    const hash = digest(read(root, runtime + '/package-lock.json'));
    result.installDependencies = read(root, receipt) !== hash || spawnSync(process.execPath, [entry, '--check-deps'], { stdio: 'ignore', env: systemEnv(), windowsHide: true }).status !== 0;
    if (result.installDependencies) pending.push({ kind: 'database-dependencies', detail: 'apply 将安装数据库 MCP 的锁定依赖' });
  }
  for (const bot of bots) {
    const enabled = enabledRoles.includes(bot.role);
    if (!bot.home || (!enabled && !state.bots[bot.role]?.databaseTool)) continue;
    const tokens = [process.execPath, entry, root, bot.role];
    const tools = client.run(['bot', 'tools', '--bot', bot.name]);
    if (!Array.isArray(tools.own) || !Array.isArray(tools.inherited)) throw new Error('无法核对 Orca bot 专属工具');
    const own = tools.own.find(tool => tool.name === toolName);
    if ((own && (own.remote || own.detail !== tokens.join(' '))) || (enabled && tools.inherited.some(tool => tool.name === toolName))) {
      conflicts.push({ role: bot.role, path: `${bot.name}/${toolName}`, scope: 'bot-tool', detail: '与其他 MCP 注册重名，请核对后继续' });
      continue;
    }
    const action = enabled ? (own ? 'bound' : 'add') : (own ? 'remove' : 'absent');
    result.bindings.push({ role: bot.role, bot: bot.name, action, health: tools.problems?.[toolName]?.kind ?? null });
    if (action === 'add' || action === 'remove' || enabled !== Boolean(state.bots[bot.role]?.databaseTool)) {
      pending.push({ kind: 'database-tool', role: bot.role, detail: `apply 将同步 ${bot.name} 的 ${toolName} 绑定` });
    }
    const problem = tools.problems?.[toolName];
    if (enabled && problem && problem.kind !== 'unconfirmed') pending.push({ kind: 'database-tool-health', role: bot.role, detail: `${bot.name} 的 ${toolName} 需要检查 (${problem.kind})` });
  }
  return result;
}

export function installDatabaseDependencies(root) {
  const cwd = safePath(root, runtime, { directory: true });
  const args = ['ci', '--ignore-scripts', '--no-fund', '--no-audit'];
  const result = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/c', 'npm.cmd', ...args], { cwd, env: systemEnv(), windowsHide: true })
    : spawnSync('npm', args, { cwd, env: systemEnv() });
  if (result.status !== 0) throw new Error(`无法安装数据库 MCP 依赖，请在 ${cwd} 运行 npm ci --ignore-scripts`);
  write(root, receipt, digest(read(root, runtime + '/package-lock.json')));
}

export function syncDatabaseBinding(root, binding, client) {
  if (binding.action === 'add') {
    const tokens = [process.execPath, join(root, runtime, 'server.mjs'), root, binding.role];
    // Orca tokenizes a single command; no credentials are part of its arguments.
    const command = tokens.map(token => "'" + token.replaceAll("'", "'\"'\"'") + "'").join(' ');
    client.run(['bot', 'tools', 'add', command, '--name', toolName, '--bot', binding.bot]);
  } else if (binding.action === 'remove') {
    client.run(['bot', 'tools', 'rm', toolName, '--bot', binding.bot]);
  }
}
