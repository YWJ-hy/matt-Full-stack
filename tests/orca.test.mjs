import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, realpathSync, statSync, symlinkSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { source } from '../src/release.mjs';
import { apply } from '../src/orca/install.mjs';
import { doctor } from '../src/orca/doctor.mjs';
import { buildPlan, configPath, markerPath, roles, statePath } from '../src/orca/plan.mjs';
import { createClient, executable } from '../src/orca/cli.mjs';
import { digest } from '../src/orca/files.mjs';
import { get, put, repo, run, temp } from './helpers.mjs';

function fixture() {
  const root = temp('orca-project-');
  const frontend = repo(root, 'ui', true), backend = repo(root, 'api', false);
  run(root, process.execPath, [join(source, 'bin/matt.mjs'), 'init', '--apply', '--e2e', 'off']);
  put(root, 'AGENTS.md', get(root, 'AGENTS.md') + '\n## Agent skills\nFixture shared conventions.\n');
  const homes = join(temp('orca-host-'), 'bots'); mkdirSync(homes);
  const config = { version: 1, projectId: 'tickets', bots: Object.fromEntries(roles.map(role => [role, `tickets-${role}`])), repos: { frontend: null, backend: null } };
  put(root, configPath, config);
  const bots = [], repos = [], calls = [];
  let self, failOffer;
  const client = { run(args) {
    calls.push([...args]);
    const command = args.slice(0, 2).join(' ');
    if (args[0] === 'agent-context') return { commands: ['bot list', 'bot create', 'repo list', 'repo add'].map(command => ({ command, flags: command === 'bot create' ? ['offer'] : [] })) };
    if (command === 'bot list') return { bots: bots.map(bot => ({ ...bot, ...(bot.id === self ? { self: true } : {}) })) };
    if (command === 'repo list') return { repos };
    if (command === 'repo add') { const entry = { id: `repo-${repos.length}`, path: args[args.indexOf('--path') + 1], kind: 'git' }; repos.push(entry); return { repo: entry }; }
    if (command === 'bot create') { if (failOffer) throw new Error('connection lost after accepting offer'); return { offered: true, message: 'card' }; }
    throw new Error(`unexpected Orca call: ${args}`);
  } };
  const accept = role => {
    // A suffix deliberately differs from the display name: never guess a bot's folder.
    const home = join(homes, `${role}-reserved-2`); mkdirSync(home);
    put(home, 'SOUL.md', `User-owned soul for ${role}.\n`);
    put(home, 'MEMORY.md', 'User-owned memory.');
    bots.push({ id: `bot-${role}`, name: config.bots[role], agent: role === 'quality' ? 'claude' : 'codex', paused: false });
    return home;
  };
  const options = (role, cwd) => { self = role ? `bot-${role}` : undefined; return { root, homes, cwd: cwd ?? root, client }; };
  return { root, homes, config, frontend, backend, bots, repos, calls, client, accept, options, failOffers: () => { failOffer = true; } };
}

function installAll(f) {
  const homes = {};
  for (const role of roles) {
    homes[role] = f.accept(role);
    apply(f.options(role, homes[role]));
  }
  return homes;
}

test('plan 只读；apply 注册项目，bot 从各自 home 登记；重复执行和 doctor 无额外操作', () => {
  const f = fixture();
  const before = readdirSync(join(f.root, '.matt'));
  const preview = buildPlan(f.options());
  assert.equal(preview.bots.length, 4);
  assert.equal(preview.sessions.backend.model, null);
  assert.deepEqual(readdirSync(join(f.root, '.matt')), before);
  assert.ok(!existsSync(join(f.root, statePath)));
  assert.ok(!f.calls.some(args => args[1] === 'add' || args[1] === 'create'));
  const homes = installAll(f);
  assert.equal(f.calls.filter(args => args[1] === 'add').length, 2);
  assert.equal(f.calls.filter(args => args[1] === 'create').length, 3);
  assert.equal(doctor(f.options()).status, 'ready');
  const state = JSON.parse(get(f.root, statePath));
  for (const role of roles) {
    assert.equal(state.bots[role].home, realpathSync(homes[role]));
    assert.equal(get(homes[role], 'MEMORY.md'), 'User-owned memory.');
    assert.ok(get(homes[role], 'SOUL.md').startsWith(`User-owned soul for ${role}.`));
    const installed = JSON.parse(get(homes[role], 'skills/matt-orca/project.json'));
    assert.equal(installed.role, role);
    assert.equal(installed.workspaceRoot, f.root);
    assert.equal(installed.repos.frontend.selector, 'id:repo-0');
    assert.equal(installed.repos.backend.selector, 'id:repo-1');
  }
  const modified = statSync(join(f.root, statePath)).mtimeMs;
  const result = apply(f.options());
  assert.equal(result.status, 'ready'); assert.deepEqual(result.applied, []);
  assert.equal(statSync(join(f.root, statePath)).mtimeMs, modified);
  assert.equal(run(f.frontend, 'git', ['status', '--porcelain']), '?? README.md\n?? package.json\n');
  unlinkSync(join(f.root, '.agents/skills/matt-full-stack/references/review.md'));
  assert.equal(doctor(f.options()).status, 'pending');
});

test('接受创建卡片不等于已安装；同名远程 bot 不会被绑定，也不从名字猜 home', () => {
  const f = fixture();
  f.bots.push({ id: 'remote', name: f.config.bots.matt, agent: 'codex', server: { name: 'other', on: 'other' } });
  assert.equal(buildPlan(f.options()).bots[0].status, 'missing');
  const home = f.accept('matt');
  assert.equal(buildPlan(f.options()).bots[0].status, 'unbound');
  assert.throws(() => apply(f.options('matt', f.root)), /直接子目录/);
  const result = apply(f.options('matt', home));
  assert.equal(result.status, 'pending');
  assert.equal(result.bots.find(bot => bot.role === 'frontend').status, 'pending');
  apply(f.options('matt', home));
  assert.equal(f.calls.filter(args => args[1] === 'create').length, 3);
});

test('创建回执丢失先记录 unknown，重跑不再发同一张卡片', () => {
  const f = fixture(); const home = f.accept('matt'); f.failOffers();
  assert.throws(() => apply(f.options('matt', home)), /connection lost/);
  const record = JSON.parse(get(f.root, statePath));
  assert.equal(record.offers.frontend.status, 'unknown');
  assert.equal(doctor(f.options()).status, 'pending');
  assert.throws(() => apply(f.options('matt', home)), /connection lost/);
  const frontendOffers = f.calls.filter(args => args[1] === 'create' && args.includes('tickets-frontend'));
  assert.equal(frontendOffers.length, 1);
  assert.ok(!existsSync(join(f.root, '.matt/private/orca-install.lock')));
});

test('升级有本地冲突时整批停止；保留记忆和 SOUL 受管区外修改', () => {
  const f = fixture(), homes = installAll(f);
  const path = 'skills/matt-orca/role.md';
  const state = JSON.parse(get(f.root, statePath));
  put(homes.backend, path, 'older managed role');
  state.bots.backend.files[path] = digest('older managed role');
  put(f.root, statePath, state);
  put(homes.frontend, path, 'local customization');
  const conflicts = apply(f.options());
  assert.equal(conflicts.status, 'conflict');
  assert.deepEqual(conflicts.applied, []);
  assert.equal(conflicts.conflicts[0].proposed, get(source, 'templates/orca/roles/frontend.md'));
  assert.equal(get(homes.backend, path), 'older managed role');
  assert.equal(doctor(f.options()).status, 'conflict');
  put(homes.frontend, path, get(source, 'templates/orca/roles/frontend.md'));
  put(homes.backend, 'SOUL.md', get(homes.backend, 'SOUL.md') + '\nUser preference.\n');
  assert.equal(apply(f.options()).status, 'ready');
  assert.equal(get(homes.backend, path), get(source, 'templates/orca/roles/backend.md'));
  assert.ok(get(homes.backend, 'SOUL.md').endsWith('User preference.\n'));
});

test('拒绝重建的同名 bot、外部 home、文件链接以及错误项目映射', () => {
  const f = fixture(), homes = installAll(f);
  f.bots[0].id = 'replacement';
  assert.throws(() => buildPlan(f.options()), /重建或改名/);
  f.bots[0].id = 'bot-matt';
  const state = JSON.parse(get(f.root, statePath));
  state.bots.frontend.home = f.frontend; put(f.root, statePath, state);
  assert.throws(() => apply(f.options()), /直接子目录/);
  state.bots.frontend.home = homes.frontend; put(f.root, statePath, state);
  put(homes.frontend, markerPath, '{}');
  assert.throws(() => apply(f.options()), /已绑定其他项目/);

  const g = fixture(), home = g.accept('matt');
  symlinkSync(g.frontend, join(home, 'skills'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => apply(g.options('matt', home)), /拒绝链接/);
  assert.equal(g.calls.filter(args => args[1] === 'add').length, 0);
  const h = fixture(); h.config.repos.frontend = 'id:wrong'; put(h.root, configPath, h.config);
  assert.throws(() => buildPlan(h.options()), /标识不存在/);
});

test('Orca 模型优先级：派单 > 角色 > 接单 bot 默认，旧 inherit 不参与跨 bot 继承', () => {
  const f = fixture();
  const runtime = join(f.root, '.matt/runtime/sessions.mjs');
  const settings = { version: 1, roles: { frontend: { model: '@coding', worktree: true }, backend: {}, standards: { model: 'inherit' }, spec: { model: 'bot-default' } } };
  put(f.root, '.matt/sessions.json', settings);
  put(f.root, '.matt/private/models.json', { coding: 'coding-model', review: 'review-model' });
  const invoke = args => JSON.parse(run(f.root, process.execPath, [runtime, ...args, '--host', 'orca']));
  assert.equal(invoke(['frontend']).model, 'coding-model');
  assert.equal(invoke(['frontend']).modelSource, 'role');
  assert.equal(invoke(['frontend', '--model', '@review']).model, 'review-model');
  assert.equal(invoke(['frontend', '--model', '@review']).modelSource, 'dispatch');
  assert.equal(invoke(['frontend', '--model', 'bot-default']).model, null);
  for (const role of ['backend', 'standards', 'spec']) {
    assert.equal(invoke([role]).model, null);
    assert.equal(invoke([role]).modelSource, 'bot-default');
    assert.equal(invoke([role]).botRole, role === 'backend' ? role : 'quality');
  }
  assert.match(run(f.root, process.execPath, [runtime, 'backend', '--model', 'x'], 1), /仅用于/);
  assert.match(run(f.root, process.execPath, [runtime, '--host', 'orca', '--model', 'x'], 1), /已指定角色/);
  assert.match(run(f.root, process.execPath, [runtime, 'frontend', '--host', 'orca', '--model', '@missing'], 1), /映射/);
});

test('CLI 固定本机，用参数数组执行，保留引号与多行正文；错误不自动重试', () => {
  assert.equal(executable({}, 'linux'), 'orca-ide');
  assert.equal(executable({ ORCA_DEV_REPO_ROOT: '/dev' }, 'win32'), 'orca-dev');
  assert.equal(executable({ ORCA_CLI_COMMAND: 'exact-orca' }, 'linux'), 'exact-orca');
  const calls = [];
  const client = createClient({ command: 'orca.exe', env: { ORCA_ENVIRONMENT: 'remote', ORCA_PAIRING_CODE: 'private', ORCA_AGENT_SESSION_ID: 'session' }, spawn: (...args) => { calls.push(args); return { status: 0, stdout: '{"ok":true,"result":{"offered":true}}' }; } });
  const text = 'quote " and `literal`\nline two $(literal)';
  assert.equal(client.run(['bot', 'create', '--does', text]).offered, true);
  assert.equal(calls[0][1][3], text);
  assert.deepEqual(calls[0][1].slice(-3), ['--environment', 'local', '--json']);
  assert.equal(calls[0][2].shell, false);
  assert.equal(calls[0][2].env.ORCA_ENVIRONMENT, undefined);
  assert.equal(calls[0][2].env.ORCA_PAIRING_CODE, undefined);
  assert.equal(calls[0][2].env.ORCA_AGENT_SESSION_ID, 'session');
  let attempts = 0;
  const failing = createClient({ spawn: () => { attempts++; return { status: 1, stdout: '{"ok":false,"error":{"message":"runtime unavailable"}}' }; } });
  assert.throws(() => failing.run(['bot', 'create']), /未自动重试/);
  assert.equal(attempts, 1);
});
