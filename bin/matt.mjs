#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { discover } from '../src/discover.mjs';
import { install, withInstallLock } from '../src/install.mjs';
import { source, version } from '../src/release.mjs';
import { parseE2eOption } from '../src/e2e-option.mjs';
import { documentLocations } from '../templates/runtime/docs.mjs';
import { json } from '../templates/runtime/workspace-files.mjs';

try {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    workspace: { type: 'string', default: '.' }, apply: { type: 'boolean' }, keep: { type: 'string', multiple: true, default: [] }, host: { type: 'string' }, e2e: { type: 'string' }, 'e2e-provider': { type: 'string' }, help: { type: 'boolean' },
    owner: { type: 'string' }, local: { type: 'boolean' }, 'agent-docs': { type: 'string' }, specs: { type: 'string' },
  } });
  const [command] = positionals;
  const root = realpathSync(values.workspace);
  if (values.help || !command) console.log(`matt-full-stack ${version}\nnode bin/matt.mjs discover|init|update [--workspace DIR] [--host orca] [--apply] [--keep PATH] [--e2e off|on] [--e2e-provider orca|midscene]\nnode bin/matt.mjs docs [--workspace DIR] [--owner parent|frontend|backend [--agent-docs DIR] [--specs DIR] [--local] [--apply]]`);
  else if (positionals.length !== 1) throw new Error('命令仅接受一个操作');
  else if (command !== 'docs' && ['owner', 'local', 'agent-docs', 'specs'].some(key => values[key] !== undefined)) throw new Error('文档位置选项用于 docs 子命令');
  else if (command === 'discover') console.log(JSON.stringify(discover(root), null, 2));
  else if (command === 'docs') {
    if (!values.owner && ['apply', 'local', 'agent-docs', 'specs'].some(key => values[key] !== undefined)) throw new Error('保存或指定文档位置需要 --owner');
    if (values.apply && root === realpathSync(source)) throw new Error('请选择消费工作区的父目录');
    const inspect = () => {
      const mapping = json(root, '.matt/workspace.json', null) ?? discover(root).config;
      return documentLocations(root, mapping, { owner: values.owner, local: values.local, agentDocs: values['agent-docs'], specs: values.specs, apply: values.apply });
    };
    const result = values.apply ? withInstallLock(root, inspect) : inspect();
    console.log(JSON.stringify(result, null, 2));
    if (result.status === 'ambiguous') process.exitCode = 2;
  }
  else if (['init', 'update'].includes(command)) {
    if (root === realpathSync(source)) throw new Error('请选择消费工作区的父目录');
    const e2e = await install(root, command, !!values.apply, new Set(values.keep), parseE2eOption(values.e2e), values['e2e-provider'], values.host);
    if (values.apply) {
      if (values.host === 'orca') console.log('父目录工具已同步。按 .matt/ORCA_SETUP.md 核对项目约定、登记项目团队 bot，并汇报 doctor 检查结果。');
      else console.log('工具文件已同步。请在共同父目录按 .matt/AI_SETUP.md 核对共享工程约定；已有配置直接复用，缺失时在环境会话中发送 $mattpocock-skills:setup-matt-pocock-skills。');
      if (e2e.enabled && e2e.provider === 'midscene') console.log('父目录约定就绪后，补齐模型配置并运行 Midscene setup，验证模型和隔离链路。');
      if (e2e.enabled && e2e.provider === 'orca') console.log('已选择 Orca 原生浏览器。按 .agents/skills/matt-full-stack/references/acceptance.md 准备用例并核验实际版本。');
    }
  } else throw new Error(`未知命令 ${command}`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
