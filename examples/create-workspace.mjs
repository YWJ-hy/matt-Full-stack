import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const examples = fileURLToPath(new URL('.', import.meta.url));

function create() {
  if (process.argv.length !== 3) throw new Error('用法：node examples/create-workspace.mjs <新目录>');
  const workspace = resolve(process.argv[2]);
  mkdirSync(workspace);
  for (const role of ['frontend', 'backend']) {
    const repo = join(workspace, role);
    cpSync(join(examples, role), repo, {
      recursive: true,
      filter: file => !['.git', 'node_modules', 'dist'].includes(basename(file)),
    });
    const git = args => execFileSync('git', args, { cwd: repo, stdio: 'inherit' });
    git(['init', '-q']);
    git(['add', '--', '.']);
    git(['-c', 'user.name=Matt Demo', '-c', 'user.email=demo@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=.unused-hooks', 'commit', '-qm', 'Start ticket desk exercise']);
  }
  const cli = fileURLToPath(new URL('../bin/matt.mjs', import.meta.url));
  execFileSync(process.execPath, [cli, 'init', '--apply'], { cwd: workspace, stdio: 'inherit' });
  cpSync(join(examples, 'REQUIREMENT.md'), join(workspace, 'REQUIREMENT.md'));
  mkdirSync(join(workspace, 'e2e/cases'), { recursive: true });
  cpSync(join(examples, 'baseline.yaml'), join(workspace, 'e2e/cases/ticket-list.yaml'));
  cpSync(join(examples, 'login.mjs'), join(workspace, 'e2e/login.mjs'));
  console.log(`体验工作区已创建，环境尚未验证。在 ${workspace} 打开环境会话：请按 .matt/AI_SETUP.md 初始化 Midscene E2E，向我询问缺少的模型配置，验证模型和隔离链路。`);
  console.log('setup 通过后，在同一父目录新开需求会话：$matt-full-stack 实现 REQUIREMENT.md 中的「客服领取工单」。');
}

try { create(); } catch (error) { console.error(error.message); process.exitCode = 1; }
