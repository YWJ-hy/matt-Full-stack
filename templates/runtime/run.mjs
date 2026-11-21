import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { systemEnv } from './system-env.mjs';

const [command, selected, ...extra] = process.argv.slice(2);
const root = process.cwd();
const runtime = fileURLToPath(new URL('.', import.meta.url));
const cli = '@midscene/test/bin/midscene-test';
const child = (entry, args, env = systemEnv(), cwd = root, stdio = 'inherit') => {
  const result = spawnSync(process.execPath, [resolve(runtime, 'node_modules', entry), ...args], { cwd, env, stdio });
  if (result.error) throw result.error;
  return result.status ?? 1;
};

function modelEnv(required = false) {
  const env = systemEnv();
  const path = '.matt/private/model.env';
  if (existsSync(path)) for (const [key, value] of Object.entries(parseEnv(readFileSync(path, 'utf8')))) {
    if (!/^MIDSCENE_(?:(?:PLANNING|INSIGHT|LOCATE)_)?MODEL_[A-Z0-9_]+$/.test(key)) throw new Error('model.env 只接受 Midscene 模型设置');
    env[key] = value;
  }
  if (required) {
    const missing = ['BASE_URL', 'NAME', 'FAMILY', 'API_KEY'].map(field => `MIDSCENE_MODEL_${field}`).filter(key => !env[key]?.trim());
    if (missing.length) throw new Error(`初始化未完成。请补充 ${missing.join('、')} 至 ${path}；密钥请通过安全输入或本地编辑器填写，不要粘贴到聊天。`);
  }
  return env;
}

function rejectDotEnv() {
  if (existsSync('.env')) throw new Error('Midscene 可能自动读取父目录 .env；为避免混用凭据，本工具拒绝运行。请按 AI_SETUP.md 处理。');
}

function verifyModel() {
  rejectDotEnv();
  const env = modelEnv(true);
  if (!existsSync(resolve(runtime, 'node_modules', cli))) throw new Error('请先按 AI_SETUP.md 安装父目录运行依赖');
  console.log('正在运行 Midscene 模型验证…');
  const status = child(cli, ['model', 'verify'], env, root, 'ignore');
  if (status !== 0) throw new Error('模型验证失败；请核对网络、base URL、模型名、family 和 Key。原生诊断可能含凭据，未输出。');
  console.log('Midscene 模型验证通过');
  return 0;
}

function versions(workspace) {
  return Object.fromEntries(['frontend', 'backend'].map(role => {
    const repo = workspace[role]?.repo;
    if (!repo || /[\\/]/.test(repo) || repo === '..' || !existsSync(resolve(repo, '.git'))) return [role, null];
    const git = (...args) => spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: systemEnv(), windowsHide: true });
    const head = git('rev-parse', 'HEAD');
    const dirty = git('status', '--porcelain');
    return [role, { repo, sha: head.status === 0 ? head.stdout.trim() : null, dirty: dirty.status === 0 ? !!dirty.stdout : null }];
  }));
}

async function main() {
  if (relative(root, resolve(runtime, '../..')) || !existsSync('.matt/manifest.json')) throw new Error('请从已初始化的共同父目录运行');
  if (command === 'selftest' || command === 'setup') {
    const ports = [selected, extra[0]];
    if (extra.length !== 1 || ports.some(port => !/^[1-9]\d{0,4}$/.test(port) || Number(port) > 65535) || ports[0] === ports[1]) {
      throw new Error(`${command} 需要两个独立的本机夹具端口：${command} <前端端口> <后端端口>`);
    }
    const dir = resolve(runtime, 'selftest');
    if (existsSync(resolve(dir, '.env'))) throw new Error('隔离自测目录不可包含 .env');
    if (command === 'setup') verifyModel();
    const out = `.matt/reports/selftest-${randomUUID()}`;
    mkdirSync(out, { recursive: true });
    const env = { ...systemEnv(), MATT_SELFTEST_FRONTEND: `http://127.0.0.1:${ports[0]}`, MATT_SELFTEST_BACKEND: `http://127.0.0.1:${ports[1]}`, MATT_SELFTEST_REPORT: resolve(out, 'html') };
    const status = child(cli, ['environment.yaml', '--config', 'config.mjs', '--result-dir', resolve(out)], env, dir);
    console.log(`隔离链路自测：${status === 0 ? '通过' : '失败'}（不验证模型或业务）。报告：${out}`);
    if (command === 'setup' && status === 0) console.log('Midscene E2E 环境初始化完成：模型验证与隔离链路自测均已通过。');
    return status;
  }
  if (extra.length || (selected && command !== 'test')) throw new Error('只有 test 接受一个可选 YAML 文件或目录');
  if (command === 'chromium') return child('playwright/cli.js', ['install', 'chromium']);
  if (command === 'model-config') {
    modelEnv(true);
    console.log('模型必填项已填写；尚未执行在线验证。');
    return 0;
  }
  if (command === 'model') return verifyModel();
  const workspace = JSON.parse(readFileSync('.matt/workspace.json', 'utf8'));
  if (command === 'doctor') {
    let ok = true;
    for (const role of ['frontend', 'backend']) {
      try {
        const response = await fetch(workspace[role].healthUrl, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
        console.log(`${role}: HTTP ${response.status}`);
        if (!response.ok) ok = false;
        await response.body?.cancel();
      } catch { console.log(`${role}: 健康检查未配置或不可达`); ok = false; }
    }
    try {
      const { chromium } = await import('playwright');
      const browser = await chromium.launch({ env: systemEnv() });
      console.log(`Chromium: ${browser.version()}`); await browser.close();
    } catch { console.log('Chromium: 不可用，请检查依赖和浏览器安装'); ok = false; }
    return ok ? 0 : 1;
  }
  if (!['nodes', 'test'].includes(command)) throw new Error('用法：node .matt/runtime/run.mjs setup|selftest <前端端口> <后端端口> 或 chromium|model-config|model|doctor|nodes|test [e2e/cases/文件.yaml]');
  rejectDotEnv();
  const config = ['--config', 'e2e/matt.config.mjs'];
  if (command === 'nodes') return child(cli, ['nodes', ...config]);
  const target = relative(resolve('e2e/cases'), resolve(selected ?? 'e2e/cases'));
  if (target.split(sep)[0] === '..' || target.includes(':') || !existsSync(resolve('e2e/cases', target))) throw new Error('用例必须位于 e2e/cases');
  const id = `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`;
  const out = `.matt/reports/${id}`;
  const env = modelEnv();
  mkdirSync(out, { recursive: true });
  const receipt = { startedAt: new Date().toISOString(), selection: selected ?? 'e2e/cases', checkoutBefore: versions(workspace), result: 'interrupted', acceptance: 'not-assessed' };
  const save = () => writeFileSync(`${out}/receipt.json`, JSON.stringify(receipt, null, 2));
  save();
  const status = child(cli, [resolve('e2e/cases', target), ...config, '--result-dir', out], env);
  Object.assign(receipt, { endedAt: new Date().toISOString(), checkoutAfter: versions(workspace), result: status === 0 ? 'runner-passed' : 'runner-failed' });
  save(); console.log(`留证：${out}/receipt.json（不自动判定业务验收）`);
  return status;
}

try { process.exitCode = await main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
