import { closeSync, mkdirSync, openSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { encode, json, safePath, write } from './workspace-files.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const ledger = '.matt/private/tasks.json';
const commands = {
  list: [], approve: ['basis', 'return-to', 'needs', 'integration', 'at'],
  claim: ['at', 'actor'], start: ['at', 'actor', 'claim-id'], receipt: ['at', 'actor', 'claim-id', 'evidence'],
  progress: ['at', 'actor', 'evidence', 'tree'], deliver: ['at', 'actor', 'evidence'],
  hold: ['at', 'evidence'], follow: ['return-to'], transfer: ['at', 'actor', 'evidence'],
  use: ['at', 'actor'], release: ['at', 'actor'],
  cleanup: ['at', 'actor', 'evidence'], removed: ['at', 'actor', 'evidence'], retain: ['at', 'actor', 'evidence'],
};
const required = (value, label) => {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) throw new Error(`需要 ${label}`);
  return value;
};

function taskKey(key) {
  if (!/^(frontend|backend)\/[^\s/].*$/u.test(required(key, '责任端/任务引用'))) throw new Error('任务键格式：frontend/<引用> 或 backend/<引用>');
  return key;
}

function load() {
  const db = json(root, ledger, { version: 1, tasks: [] });
  if (db.version !== 1 || !Array.isArray(db.tasks)) throw new Error('无法识别派单记录，请核对 ' + ledger);
  return db;
}

function blockers(tasks, refs, inputs) {
  const byKey = new Map(tasks.map(task => [task.key, task]));
  const verified = new Map();
  function delivered(key) {
    if (!verified.has(key)) {
      const task = byKey.get(key);
      const valid = task?.status === 'delivered' && task.needs.every(dep =>
        delivered(dep) && task.inputs[dep] === byKey.get(dep).deliveryVersion);
      verified.set(key, valid);
    }
    return verified.get(key);
  }
  return refs.filter(key => !delivered(key) || (inputs && inputs[key] !== byKey.get(key).deliveryVersion));
}

function inspect(tasks, task) {
  return { ...task, developmentBlockedBy: blockers(tasks, task.needs, task.inputs), integrationBlockedBy: blockers(tasks, task.integration) };
}

function checkCycle(tasks, key, needs, visited = new Set()) {
  for (const dep of needs) {
    if (dep === key) throw new Error('开发依赖形成循环：' + key);
    if (visited.has(dep)) continue;
    visited.add(dep);
    checkCycle(tasks, key, tasks.find(task => task.key === dep)?.needs ?? [], visited);
  }
}

function approve(tasks, task, key, options) {
  if (task && task.status !== 'held') throw new Error('已有任务请续接；修订批准前先 hold');
  if (!task && options.at !== undefined) throw new Error('待修订的原任务不存在');
  const basis = required(options.basis, '获批修订和确认来源，或局部修复授权');
  const origin = required(options['return-to'], '原会话');
  const needs = (options.needs ?? []).map(taskKey);
  const integration = (options.integration ?? []).map(taskKey);
  checkCycle(tasks, key, needs);
  if (!task) {
    task = { key, version: 0, returns: [], history: [] };
    tasks.push(task);
  }
  if (!task.returns.includes(origin)) task.returns.push(origin);
  Object.assign(task, { basis, needs, integration, status: 'approved' });
  delete task.inputs;
  return task;
}

function manageTree(task, command, options) {
  const actor = options.actor;
  if (command === 'use' || command === 'release') {
    required(actor, '使用该目录的任务、服务或会话');
    if (!task.tree) throw new Error('尚未绑定工作树');
    task.users ??= [];
    if (command === 'use' && !task.users.includes(actor)) task.users.push(actor);
    if (command === 'release') task.users = task.users.filter(user => user !== actor);
  } else if (command === 'cleanup') {
    if (task.status !== 'delivered' || !task.tree || task.users?.length) throw new Error('尚无可清理的交付，或工作树仍被占用');
    required(options.evidence, '合入、干净状态、服务释放及清理授权的核对记录');
    task.cleanup = { state: 'pending', actor: required(actor, '清理会话') };
  } else if (command === 'removed' || command === 'retain') {
    if (task.cleanup?.state !== 'pending' || task.cleanup.actor !== actor) throw new Error('请由本次清理会话核对结果');
    required(options.evidence, '工作树清理回执或保留原因');
    if (command === 'removed') task.cleanup.state = 'removed';
    else delete task.cleanup;
  }
}

function dispatch(tasks, task, command, options) {
  const actor = options.actor;
  required(actor, '执行或派发会话 --actor');
  const missing = blockers(tasks, task.needs, task.inputs);
  if (command !== 'receipt' && missing.length) throw new Error('开发依赖未交付或已换版：' + missing.join(', '));
  switch (command) {
    case 'claim': {
      if (task.status !== 'approved') throw new Error('任务已认领或暂停，请核对已有派单');
      task.dispatcher = actor;
      task.claimId = randomUUID();
      task.inputs = Object.fromEntries(task.needs.map(dep => [dep, tasks.find(item => item.key === dep).deliveryVersion]));
      task.status = 'claimed';
      break;
    }
    case 'receipt': {
      if (actor !== task.dispatcher || options['claim-id'] !== task.claimId) throw new Error('请核对本次派单及派发会话');
      required(options.evidence, '回执或结果不明的依据');
      break;
    }
    case 'start': {
      if (task.status !== 'claimed' || options['claim-id'] !== task.claimId || (task.owner && task.owner !== actor)) throw new Error('请核对派单，续接原执行会话，勿重复开工');
      const role = task.key.split('/', 1)[0];
      const isolated = task.isolated ?? (json(root, '.matt/sessions.json').roles[role]?.worktree === true);
      if (!isolated && tasks.some(other => other !== task && other.key.startsWith(role + '/') && other.isolated === false && other.owner && other.status !== 'delivered')) {
        throw new Error('共享 checkout 仍有写入任务，请等待交接');
      }
      task.isolated = isolated;
      task.owner = actor;
      task.status = 'working';
      break;
    }
    case 'progress':
    case 'deliver': {
      if (task.status !== 'working' || actor !== task.owner) throw new Error('当前会话未持有本任务');
      required(options.evidence, '阶段证据、交接引用或阻塞原因');
      if (options.tree !== undefined) {
        if (!task.isolated) throw new Error('共享 checkout 的路径记入交接证据，不能登记为可清理的隔离工作树');
        if (task.tree && task.tree !== options.tree) throw new Error('任务已绑定其他工作树，请核对原树');
        if (tasks.some(other => other !== task && other.tree === options.tree && other.cleanup?.state !== 'removed')) throw new Error('工作树已绑定到其他任务');
        task.tree = required(options.tree, '实际工作树标识');
      }
      if (command === 'deliver') {
        if (task.isolated && !task.tree) throw new Error('请先登记本次交付实际使用的隔离工作树');
        task.status = 'delivered';
        task.deliveryVersion = task.version + 1;
      }
      break;
    }
  }
}

function transition(tasks, command, key, options) {
  let task = tasks.find(item => item.key === key);
  const actor = options.actor;
  if (task && command !== 'follow' && String(task.version) !== options.at) throw new Error('任务已登记或版本已变化，请 list 核对负责人和回执');
  if (!task && command !== 'approve') throw new Error('缺少此任务的批准或明确修复授权记录');
  if (task?.cleanup && !['follow', 'receipt', 'removed', 'retain'].includes(command)) throw new Error('工作树正在清理或已移除，请先核对现场');
  if (command === 'approve') {
    task = approve(tasks, task, key, options);
  } else if (command === 'follow') {
    const origin = required(options['return-to'], '返回会话');
    if (task.returns.includes(origin)) return task;
    task.returns.push(origin);
  } else if (['use', 'release', 'cleanup', 'removed', 'retain'].includes(command)) {
    manageTree(task, command, options);
  } else if (command === 'hold') {
    required(options.evidence, '暂停或返修依据');
    task.status = 'held';
  } else if (command === 'transfer') {
    if (task.status !== 'held' || !task.owner) throw new Error('交接执行者前需暂停已有执行任务');
    required(options.evidence, '原执行者停止写入的证据');
    task.owner = required(actor, '接替的执行会话');
  } else {
    dispatch(tasks, task, command, options);
  }
  task.version++;
  task.history.push({ command, ...options, time: new Date().toISOString() });
  return task;
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!Object.hasOwn(commands, command)) throw new Error('tasks.mjs ' + Object.keys(commands).join('|') + ' [责任端/任务引用] [选项]');
  const flags = commands[command].map(name => [name, { type: 'string', multiple: ['needs', 'integration'].includes(name) }]);
  const { positionals, values } = parseArgs({ args, allowPositionals: true, options: Object.fromEntries(flags) });
  if (positionals.length > 1) throw new Error('每次操作仅接受一个任务键');
  if (command === 'list') {
    const { tasks } = load();
    return tasks.filter(task => !positionals.length || task.key === positionals[0]).map(task => inspect(tasks, task));
  }
  const key = taskKey(positionals[0]);
  const lock = safePath(root, '.matt/private/tasks.lock');
  mkdirSync(dirname(lock), { recursive: true });
  let fd;
  try { fd = openSync(lock, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('派单记录正在写入，请 list 后重试；持续占用时核对 tasks.lock 的 PID');
    throw error;
  }
  try {
    writeFileSync(fd, String(process.pid));
    const db = load();
    const changed = transition(db.tasks, command, key, values);
    write(root, ledger, encode(db));
    return inspect(db.tasks, changed);
  } finally {
    closeSync(fd);
    unlinkSync(lock);
  }
}

try { console.log(encode(main()).trimEnd()); }
catch (error) { console.error(error.message); process.exitCode = 1; }
