import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
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
import { applyDevelopmentSql, confirmDevelopmentSql } from '../templates/runtime/database-mcp/development.mjs';
import { confirmWithPerson } from '../templates/runtime/database-mcp/confirmation.mjs';

test('两入口竞争同一认领，部分批准与开发依赖受检，返修和占用中的原树可恢复', async () => {
  const f = fixture();
  put(f.root, '.matt/sessions.json', { version: 1, roles: { frontend: { worktree: true }, backend: { worktree: true } } });
  const entry = join(f.root, '.matt/runtime/tasks.mjs');
  const call = (...args) => JSON.parse(run(f.frontend, process.execPath, [entry, ...args]));
  const denied = (...args) => run(f.frontend, process.execPath, [entry, ...args], 1);
  const ui = 'frontend/reschedule/T01', api = 'backend/reschedule/T01';
  const unapproved = 'backend/reschedule/T02';
  assert.deepEqual(call('list'), []);
  assert.ok(!existsSync(join(f.root, '.matt/private/tasks.json')));
  assert.match(denied('claim', unapproved, '--at', '1', '--actor', 'matt'), /批准/);
  call('approve', ui, '--basis', 'v1 T01 / chat 1', '--return-to', 'matt', '--integration', api);
  call('approve', api, '--basis', 'v1 T01 / chat 1', '--return-to', 'matt', '--needs', ui);
  assert.match(denied('claim', api, '--at', '1', '--actor', 'matt'), /开发依赖/);
  const contenders = await Promise.allSettled(['matt', 'direct'].map(actor =>
    promisify(execFile)(process.execPath, [entry, 'claim', ui, '--at', '1', '--actor', actor], { cwd: f.backend, windowsHide: true })));
  assert.equal(contenders.filter(result => result.status === 'fulfilled').length, 1);
  const [claim] = call('list', ui);
  assert.equal(claim.status, 'claimed');
  assert.deepEqual(claim.developmentBlockedBy, []);
  assert.deepEqual(claim.integrationBlockedBy, [api]);
  const followed = call('follow', ui, '--return-to', 'new-chat');
  assert.deepEqual(followed.returns, ['matt', 'new-chat']);
  const step = (command, task, ...args) => call(command, task.key, '--at', String(task.version), ...args);
  const worker = ['--actor', 'frontend-session'];
  let current = step('start', followed, ...worker, '--claim-id', claim.claimId);
  assert.match(denied('start', ui, '--at', String(current.version), '--actor', 'other', '--claim-id', claim.claimId), /重复开工/);
  current = step('progress', current, ...worker, '--tree', 'tree-1', '--evidence', 'stage 1 receipt');
  const held = step('hold', current, '--evidence', 'needs rework');
  const revised = step('approve', held, '--basis', 'v2 T01 / chat 2', '--return-to', 'matt', '--integration', api);
  const retry = step('claim', revised, '--actor', 'matt');
  assert.notEqual(retry.claimId, claim.claimId);
  assert.match(denied('start', ui, '--at', String(retry.version), ...worker, '--claim-id', claim.claimId), /核对派单/);
  current = step('start', retry, ...worker, '--claim-id', retry.claimId);
  assert.equal(current.tree, 'tree-1');
  assert.match(denied('progress', ui, '--at', String(current.version), ...worker, '--tree', 'tree-2', '--evidence', 'wrong tree'), /其他工作树/);
  current = step('deliver', current, ...worker, '--evidence', 'fixed version and test receipt');
  assert.equal(call('claim', api, '--at', '1', '--actor', 'matt').status, 'claimed');
  const service = ['--actor', 'test-server'], cleanup = ['--actor', 'matt', '--evidence', 'merge and clean tree checked; cleanup approved'];
  current = step('use', current, ...service);
  assert.match(denied('cleanup', ui, '--at', String(current.version), ...cleanup), /占用/);
  current = step('release', current, ...service);
  current = step('cleanup', current, ...cleanup);
  assert.match(denied('use', ui, '--at', String(current.version), ...service), /正在清理/);
  assert.equal(step('removed', current, '--actor', 'matt', '--evidence', 'Orca receipt; branch retained').cleanup.state, 'removed');
  assert.deepEqual(call('list', unapproved), []);
});

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

test('四个 bot 和 doctor 使用同一后端文档目录，规则缺失指出具体路径，规格可按需创建', () => {
  const f = fixture();
  put(f.backend, '.matt-docs.json', { version: 1, agentDocs: 'policy', specs: 'requirements' });
  put(f.backend, 'policy/issue-tracker.md', 'Project tracker');
  const homes = installAll(f);
  const pending = doctor(f.options());
  assert.equal(pending.status, 'pending');
  assert.ok(pending.pending.some(item => item.detail.includes(join(f.backend, 'policy', 'domain.md'))));
  put(f.backend, 'policy/domain.md', 'Project domain layout');
  const ready = doctor(f.options());
  assert.equal(ready.status, 'ready');
  assert.equal(ready.documents.specs, join(f.backend, 'requirements'));
  for (const home of Object.values(homes)) assert.deepEqual(JSON.parse(get(home, 'skills/matt-orca/project.json')).documents, ready.documents);
  assert.ok(!existsSync(ready.documents.specs));
});

test('可选数据库绑定随角色登记、可重试并可撤下，连接信息不进入 Orca 或报告', () => {
  const f = fixture(), toolsByBot = new Map();
  const runOrca = f.client.run;
  f.client.run = args => {
    if (args[1] !== 'tools') return runOrca(args);
    const bot = args[args.indexOf('--bot') + 1];
    if (args[2] === 'add') {
      assert.ok(!toolsByBot.has(bot));
      assert.ok(!args.join(' ').includes('secret'));
      const tokens = Array.from(args[3].matchAll(/'([^']*)'/g), match => match[1]);
      toolsByBot.set(bot, { name: 'matt_db_schema', detail: tokens.join(' '), remote: false });
      return {};
    }
    if (args[2] === 'rm') { toolsByBot.delete(bot); return {}; }
    return { own: toolsByBot.has(bot) ? [toolsByBot.get(bot)] : [], inherited: [] };
  };
  const path = '.matt/private/database.json', runtime = '.matt/runtime/database-mcp';
  apply(f.options());
  const config = JSON.parse(get(f.root, path));
  assert.equal(config.connectionString, '');
  config.connectionString = 'postgresql://fixture:secret@localhost/project';
  put(f.root, path, config);
  // Exercise the role lifecycle offline, using a fixture in place of the dependency probe.
  put(f.root, runtime + '/server.mjs', '');
  put(f.root, runtime + '/node_modules/.matt-lock', digest(get(f.root, runtime + '/package-lock.json')));
  installAll(f);
  assert.deepEqual([...toolsByBot.keys()].sort(), [f.config.bots.backend, f.config.bots.matt]);
  const check = doctor(f.options());
  assert.equal(check.status, 'ready');
  assert.ok(!JSON.stringify(check).includes('secret'));
  assert.ok(!get(f.root, statePath).includes('secret'));
  assert.deepEqual(apply(f.options()).applied, []);
  toolsByBot.set(f.config.bots.matt, { name: 'matt_db_schema', detail: 'user-configured', remote: false });
  assert.equal(apply(f.options()).status, 'conflict');
  toolsByBot.delete(f.config.bots.matt);
  apply(f.options());
  config.qualityTestConnectionString = 'postgresql://fixture:secret@localhost/test';
  config.connectionString = '';
  put(f.root, path, config);
  assert.equal(apply(f.options()).status, 'ready');
  assert.deepEqual([...toolsByBot.keys()], [f.config.bots.quality]);
  unlinkSync(join(f.root, path));
  apply(f.options());
  assert.equal(toolsByBot.size, 0);
  put(f.root, path, '{"version":1,"connectionString":"secret"}');
  assert.throws(() => doctor(f.options()), error => !error.message.includes('secret') && error.message.includes('connectionString'));
});

test('开发库逐份审批绑定原始文件、项目位置和连接，重试及并发只执行一次', async () => {
  const f = fixture();
  const settings = '.matt/private/database.json';
  const config = { version: 1, developmentWriteConnectionString: 'postgres://fixture:secret@localhost/dev' };
  put(f.root, settings, config);
  put(f.frontend, '.matt-docs.json', { version: 1, agentDocs: 'rules', specs: '产品需求' });
  const args = { requirement: '预约', file: '01-add.sql', impact: '增加预约字段' };
  const file = '产品需求/预约/delivery-sql/01-add.sql';
  put(f.frontend, file, 'SELECT 1;\n');
  const request = (input = args, confirm = () => true) => confirmDevelopmentSql(f.root, input, confirm);
  await assert.rejects(request(), /delivery.md/);
  put(f.frontend, '产品需求/预约/delivery.md', '# 交付');
  for (const input of [{ ...args, file: '../other.sql' }, { ...args, file: 'dot.sql:extra.sql' }, { ...args, requirement: '_templates' }]) {
    await assert.rejects(request(input), /文件名/);
  }
  let runs = 0;
  const execute = (id, fn = () => runs++) => applyDevelopmentSql(f.root, id, fn);
  await assert.rejects(execute('0'.repeat(64)), /缺少/);
  assert.deepEqual(await request(args, () => false), { status: '未批准' });
  assert.ok(!existsSync(join(f.root, '.matt/private/development-sql')));
  const { approvalId } = await request(args, review => {
    assert.equal(review.target, 'fixture@localhost:5432/dev');
    assert.equal(review.sql, 'SELECT 1;\n');
    assert.ok(!JSON.stringify(review).includes('secret'));
    return true;
  });
  put(f.frontend, file, 'SELECT 2;\n');
  await assert.rejects(execute(approvalId), /重新确认/);
  put(f.frontend, file, 'SELECT 1;\n');
  put(f.root, settings, { ...config, developmentWriteConnectionString: 'postgres://fixture:secret@localhost/dev2' });
  await assert.rejects(execute(approvalId), /重新确认/);
  put(f.root, settings, { version: 1 });
  await assert.rejects(execute(approvalId), /尚未启用/);
  put(f.root, settings, config);
  let finish;
  const first = execute(approvalId, (value, sql) => {
    assert.equal(value, config.developmentWriteConnectionString);
    assert.equal(sql, 'SELECT 1;\n');
    runs++;
    return new Promise(resolve => { finish = resolve; });
  });
  assert.match((await execute(approvalId)).status, /待核对/);
  finish();
  const success = await first;
  assert.equal(success.status, '执行成功');
  assert.deepEqual(await execute(approvalId), success);
  assert.equal(runs, 1);
  const second = await request();
  const grantPath = '.matt/private/development-sql/' + second.approvalId + '.json';
  const originalGrant = get(f.root, grantPath);
  put(f.root, grantPath, { ...JSON.parse(originalGrant), file: 'unapproved.sql' });
  await assert.rejects(execute(second.approvalId), /有效人工批准/);
  put(f.root, grantPath, originalGrant);
  const failed = await execute(second.approvalId, () => { throw Object.assign(new Error('secret'), { code: '42P01' }); });
  assert.equal(failed.sqlState, '42P01');
  assert.ok(!JSON.stringify(failed).includes('secret'));
  assert.deepEqual(await execute(second.approvalId), failed);
  assert.equal(runs, 1);
});

test('人工表单只接受本人显式勾选，取消、拒绝及客户端异常均不批准', async () => {
  const review = { path: 'spec/task/delivery-sql/01.sql', target: 'dev', sha256: '123', impact: 'create', sql: 'SELECT 1;' };
  const form = { getClientCapabilities: () => ({ elicitation: { form: {} } }) };
  for (const [answer, expected] of [
    [{ action: 'cancel' }, false], [{ action: 'decline' }, false], [{ action: 'accept', content: { approve: false } }, false],
    [{ action: 'accept' }, false], [{ action: 'accept', content: { approve: true } }, true],
  ]) {
    form.elicitInput = async request => {
      for (const value of Object.values(review)) assert.ok(request.message.includes(value));
      assert.equal(request.requestedSchema.properties.approve.default, false);
      return answer;
    };
    assert.equal(await confirmWithPerson(form, review), expected);
  }
  form.elicitInput = async () => { throw new Error('offline'); };
  await assert.rejects(confirmWithPerson(form, review), /offline/);
});

test('依赖返修换版后，旧派单和间接下游都需重新核对；仅追加会话或回执不影响版本', () => {
  const f = fixture(), entry = join(f.root, '.matt/runtime/tasks.mjs');
  const call = (...args) => JSON.parse(run(f.root, process.execPath, [entry, ...args]));
  const step = (command, task, ...args) => call(command, task.key, '--at', String(task.version), ...args);
  const batch = ['--basis', 'v1 approved', '--return-to', 'matt'];
  const actor = ['--actor', 'worker'];
  const start = approved => {
    const claim = step('claim', approved, ...actor);
    return step('start', claim, ...actor, '--claim-id', claim.claimId);
  };
  const deliver = task => step('deliver', task, ...actor, '--evidence', 'checked handoff');
  let first = deliver(start(call('approve', 'backend/feature/T01', ...batch)));
  const second = deliver(start(call('approve', 'frontend/feature/T02', ...batch, '--needs', first.key)));
  const third = step('claim', call('approve', 'frontend/feature/T03', ...batch, '--needs', second.key), ...actor);
  first = call('follow', first.key, '--return-to', 'direct-chat');
  assert.deepEqual(call('list', third.key)[0].developmentBlockedBy, []);
  const held = step('hold', first, '--evidence', 'fix required');
  assert.deepEqual(call('list', third.key)[0].developmentBlockedBy, [second.key]);
  deliver(start(step('approve', held, ...batch)));
  assert.match(run(f.root, process.execPath, [entry, 'start', third.key, '--at', String(third.version), ...actor, '--claim-id', third.claimId], 1), /开发依赖/);
  assert.deepEqual(call('list', second.key)[0].developmentBlockedBy, [first.key]);
});

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
