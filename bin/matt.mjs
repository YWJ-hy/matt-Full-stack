#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { discover } from '../src/discover.mjs';
import { install } from '../src/install.mjs';
import { source, version } from '../src/release.mjs';

try {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    workspace: { type: 'string', default: '.' }, apply: { type: 'boolean' }, keep: { type: 'string', multiple: true, default: [] }, help: { type: 'boolean' },
  } });
  const [command] = positionals;
  const root = realpathSync(values.workspace);
  if (values.help || !command) console.log(`matt-full-stack ${version}\nnode bin/matt.mjs discover|init|update [--workspace DIR] [--apply] [--keep PATH]`);
  else if (positionals.length !== 1) throw new Error('命令仅接受一个操作');
  else if (command === 'discover') console.log(JSON.stringify(discover(root), null, 2));
  else if (['init', 'update'].includes(command)) {
    if (root === realpathSync(source)) throw new Error('请选择消费工作区的父目录');
    install(root, command, !!values.apply, new Set(values.keep));
    if (values.apply) console.log('工具文件已同步；请在环境会话按 .matt/AI_SETUP.md 补齐模型配置并运行 setup，验证 Midscene E2E 环境。');
  } else throw new Error(`未知命令 ${command}`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
