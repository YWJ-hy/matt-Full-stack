#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createClient } from '../src/orca/cli.mjs';
import { apply } from '../src/orca/install.mjs';
import { doctor } from '../src/orca/doctor.mjs';
import { buildPlan, report } from '../src/orca/plan.mjs';

try {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { workspace: { type: 'string', default: '.' }, json: { type: 'boolean' }, help: { type: 'boolean' } } });
  const [command] = positionals;
  if (values.help || !command) {
    console.log('用法：node bin/matt-orca.mjs plan|apply|doctor --workspace <已初始化的父目录> [--json]\nplan 只读预览；apply 可重复安装/升级，从主控 bot 会话提出创建卡片；doctor 只读校验。\n退出码：0 已就绪（或 plan 无冲突），1 错误/冲突，2 apply/doctor 仍有待处理项。');
  } else {
    if (positionals.length !== 1 || !['plan', 'apply', 'doctor'].includes(command)) throw new Error('仅支持 plan、apply、doctor');
    const root = realpathSync(values.workspace);
    const options = { root, client: createClient() };
    const result = command === 'apply' ? apply(options) : command === 'doctor' ? doctor(options) : { ...report(buildPlan(options)), status: 'planned' };
    if (values.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`${command}: ${result.status} · ${result.projectId}`);
      console.log(`共享工程约定 ${result.documents.agentDocs}\n需求规格 ${result.documents.specs}`);
      for (const bot of result.bots) console.log(`${bot.role}: ${bot.name} · ${bot.status}${bot.home ? ` · ${bot.home}` : ''}`);
      for (const item of result.applied ?? []) console.log(`applied ${item.action} ${item.path ?? item.name}`);
      for (const item of result.changes) console.log(`${item.action} ${item.path}`);
      for (const item of result.conflicts) console.log(`CONFLICT ${item.path}`);
      for (const item of result.pending) console.log(`pending ${item.detail}`);
      if (result.validation) console.log(result.validation);
      if (result.pending.some(item => ['bot', 'binding'].includes(item.kind))) console.log(`\n${result.bootstrap}`);
    }
    process.exitCode = result.conflicts.length ? 1 : command !== 'plan' && result.status !== 'ready' ? 2 : 0;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
