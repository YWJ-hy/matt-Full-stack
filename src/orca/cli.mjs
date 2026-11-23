import { spawnSync } from 'node:child_process';

export function executable(env = process.env, platform = process.platform) {
  return env.ORCA_CLI_COMMAND || (env.ORCA_DEV_REPO_ROOT ? 'orca-dev' : platform === 'linux' ? 'orca-ide' : 'orca');
}

export function createClient({ cwd = process.cwd(), env = process.env, command = executable(env), spawn = spawnSync } = {}) {
  if (/\.(?:cmd|bat)$/i.test(command)) throw new Error('请使用 Orca 原生可执行文件，不能使用 .cmd/.bat');
  const localEnv = { ...env };
  delete localEnv.ORCA_ENVIRONMENT;
  delete localEnv.ORCA_PAIRING_CODE;
  return {
    command,
    run(args) {
      const flags = args[0] === 'agent-context' ? ['--json'] : ['--environment', 'local', '--json'];
      const result = spawn(command, [...args, ...flags], { cwd, env: localEnv, encoding: 'utf8', windowsHide: true, shell: false, timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
      if (result.error) throw new Error(`Orca ${args.slice(0, 2).join(' ')}：${result.error.message}；未自动重试`);
      let reply;
      try { reply = JSON.parse(result.stdout); }
      catch { throw new Error(`Orca 返回非 JSON（exit ${result.status}）：${(result.stderr || result.stdout || '').slice(0, 4000)}`); }
      if (result.status !== 0 || reply.ok === false) throw new Error(`Orca 命令失败；未自动重试：${JSON.stringify(reply.error ?? reply).slice(0, 4000)}`);
      return reply.result ?? reply;
    },
  };
}

export function inventory(client) {
  const schema = client.run(['agent-context']);
  const required = ['bot list', 'bot create', 'repo list', 'repo add'];
  if (!Array.isArray(schema.commands)) throw new Error('无法读取 Orca 命令能力；请更新 Orca');
  for (const name of required) if (!schema.commands.some(item => item.command === name)) throw new Error(`Orca 缺少 ${name}；请更新 Orca`);
  const create = schema.commands.find(item => item.command === 'bot create');
  if (!create.flags?.includes('offer')) throw new Error('当前 Orca 不支持 bot create --offer');
  const roster = client.run(['bot', 'list']);
  const projects = client.run(['repo', 'list']);
  if (!Array.isArray(roster.bots) || !Array.isArray(projects.repos)) throw new Error('无法识别 Orca bot/repo 列表，未进行安装');
  const bots = roster.bots.filter(bot => !bot.server);
  for (const bot of bots) if (typeof bot.id !== 'string' || typeof bot.name !== 'string' || typeof bot.agent !== 'string') throw new Error('无法识别 Orca bot 记录');
  return { bots, repos: projects.repos };
}
