import { createHash, randomUUID } from 'node:crypto';
import { isUtf8 } from 'node:buffer';
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { blocks, managed, seeds, source, version } from './release.mjs';
import { discover } from './discover.mjs';

const statePath = '.matt/manifest.json';
const encode = value => JSON.stringify(value, null, 2) + '\n';
const digest = text => text === null ? null : createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex');
const template = name => readFileSync(join(source, name), 'utf8').replaceAll('\r\n', '\n');

function safePath(root, name) {
  let dest = root;
  const parts = name.split('/');
  for (const [index, part] of parts.entries()) {
    dest = join(dest, part);
    const stat = lstatSync(dest, { throwIfNoEntry: false });
    if (!stat) break;
    if (stat.isSymbolicLink() || (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory() || existsSync(join(dest, '.git')))) {
      throw new Error(`路径属于子仓、链接或类型不符：${name}`);
    }
  }
  return join(root, name);
}

function read(root, name) {
  const dest = safePath(root, name);
  if (!existsSync(dest)) return null;
  const data = readFileSync(dest);
  if (!isUtf8(data)) throw new Error(`需要 UTF-8 文件：${name}`);
  return data.toString('utf8');
}

function section(name, content, body) {
  const marker = label => name === '.gitignore' ? `# matt-full-stack:${label}` : `<!-- matt-full-stack:${label} -->`;
  const start = marker('begin');
  const end = marker('end');
  const fresh = `${start}\n${body.trimEnd()}\n${end}`;
  const full = content ?? '';
  const newline = full.includes('\r\n') ? '\r\n' : '\n';
  const replacement = fresh.replaceAll('\n', newline);
  const from = full.indexOf(start);
  const to = full.indexOf(end);
  if (from === -1 && to === -1) {
    return { current: null, fresh, next: full + (full && !full.endsWith('\n') ? newline : '') + replacement + newline };
  }
  if (from < 0 || to < from || full.lastIndexOf(start) !== from || full.lastIndexOf(end) !== to) throw new Error(`请先修复重复或不完整的受管标记：${name}`);
  return { current: full.slice(from, to + end.length), fresh, next: full.slice(0, from) + replacement + full.slice(to + end.length) };
}

function atomicWrite(root, name, text) {
  const dest = safePath(root, name);
  mkdirSync(dirname(dest), { recursive: true });
  const temp = `${dest}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, text, { flag: 'wx', mode: lstatSync(dest, { throwIfNoEntry: false })?.mode ?? 0o644 });
    renameSync(temp, dest);
  } finally { if (existsSync(temp)) unlinkSync(temp); }
}

function sync(root, command, apply, keep) {
  const previous = read(root, statePath);
  const state = previous === null ? { format: 1, version: '0.0.0', files: {} } : JSON.parse(previous);
  if (state.format !== 1 || !state.files || !/^\d+\.\d+\.\d+$/.test(state.version)) throw new Error('无法识别清单，请先检查其版本或恢复清单');
  if (version.localeCompare(state.version, 'en', { numeric: true }) < 0) throw new Error('当前工具早于已安装版本，请使用新版');
  if (command === 'update' && !previous) throw new Error('未初始化，请先运行 init');
  const changes = [];
  const files = {};
  let conflicts = 0;
  for (const [name, src] of Object.entries({ ...managed, ...blocks })) {
    const old = read(root, name);
    const body = template(src);
    const { current, fresh, next } = Object.hasOwn(blocks, name) ? section(name, old, body) : { current: old, fresh: body, next: body };
    const local = digest(current);
    const upstream = digest(fresh);
    const base = state.files[name];
    files[name] = { upstream };
    if (local === upstream) continue;
    if ((!base && current === null) || (base && local === base.upstream)) {
      changes.push({ name, old, next, action: old === null ? 'create' : 'update' });
    } else if (name !== '.gitignore' && current !== null && (keep.has(name) || (base?.upstream === upstream && base?.kept === local))) {
      files[name].kept = local;
      console.log(`keep ${name}`);
    } else {
      conflicts++;
      console.log(`CONFLICT ${name} base=${base?.upstream ?? '-'} local=${local ?? '-'} upstream=${upstream}\n  模板 ${join(source, src)}`);
    }
  }
  for (const name of keep) if (!Object.hasOwn(files, name) || name === '.gitignore') throw new Error(`无法保留此路径：${name}`);
  for (const name of Object.keys(state.files)) if (!Object.hasOwn(files, name)) console.log(`retired (保留原文件，停止管理) ${name}`);
  const seeded = new Set(state.seeded ?? []);
  for (const [name, src] of Object.entries({ ...seeds, '.matt/workspace.json': null })) {
    if (!seeded.has(name) && !existsSync(safePath(root, name))) changes.push({ name, old: null, next: src ? template(src) : encode(discover(root).config), action: 'seed' });
    seeded.add(name);
  }
  const manifest = encode({ format: 1, version, files, seeded: [...seeded] });
  if (digest(previous) !== digest(manifest)) changes.push({ name: statePath, old: previous, next: manifest, action: 'manifest' });
  for (const change of changes) console.log(`${change.action} ${change.name}`);
  if (conflicts) throw new Error(`${conflicts} 处冲突，本次未应用；请对比模板或查看 AI_SETUP.md 的 --keep`);
  if (apply) for (const { name, old, next } of changes) {
    if (read(root, name) !== old) throw new Error(`文件在预览后发生变化：${name}，请重新运行`);
    atomicWrite(root, name, next);
  }
  console.log(`${apply ? 'applied' : 'preview'} ${version} changes=${changes.length}`);
}

export function install(root, command, apply, keep) {
  if (!existsSync(safePath(root, statePath)) && discover(root).candidates.length < 2) throw new Error('首次安装需要在包含至少两个独立 Git 子仓库的共同父目录执行');
  if (!apply) return sync(root, command, false, keep);
  const lock = safePath(root, '.matt/install.lock');
  mkdirSync(dirname(lock), { recursive: true });
  const fd = openSync(lock, 'wx');
  try {
    writeFileSync(fd, String(process.pid));
    sync(root, command, true, keep);
  } finally { closeSync(fd); unlinkSync(lock); }
}
