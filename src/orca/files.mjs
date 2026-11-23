import { createHash, randomUUID } from 'node:crypto';
import { isUtf8 } from 'node:buffer';
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export const encode = value => JSON.stringify(value, null, 2) + '\n';
export const digest = text => text === null ? null : createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex');

export function safePath(root, name) {
  if (isAbsolute(name) || name.split(/[\\/]/).some(part => !part || ['.', '..'].includes(part))) throw new Error(`无效受管路径：${name}`);
  let path = resolve(root);
  const rootStat = lstatSync(path);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error(`需要实际目录：${path}`);
  const parts = name.split(/[\\/]/);
  for (const [index, part] of parts.entries()) {
    path = join(path, part);
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (!stat) continue;
    if (stat.isSymbolicLink() || (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory() || existsSync(join(path, '.git')))) throw new Error(`拒绝链接、子仓或类型不符的路径：${path}`);
  }
  return path;
}

export function read(root, name) {
  const path = safePath(root, name);
  if (!existsSync(path)) return null;
  const data = readFileSync(path);
  if (!isUtf8(data)) throw new Error(`需要 UTF-8 文件：${path}`);
  return data.toString('utf8');
}

export function json(root, name, fallback) {
  const text = read(root, name);
  if (text === null) {
    if (fallback !== undefined) return fallback;
    throw new Error(`缺少 ${join(root, name)}`);
  }
  try { return JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new Error(`JSON 无效：${join(root, name)}`); }
}

export function write(root, name, text, expected = read(root, name)) {
  if (read(root, name) !== expected) throw new Error(`文件在计划后已变化，请重跑：${join(root, name)}`);
  if (expected === text) return;
  const path = safePath(root, name);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, text, { flag: 'wx', mode: lstatSync(path, { throwIfNoEntry: false })?.mode ?? 0o644 });
    renameSync(temporary, path);
  } finally { if (existsSync(temporary)) unlinkSync(temporary); }
}

export function soulSection(current, content) {
  const begin = '<!-- matt-orca:begin -->', end = '<!-- matt-orca:end -->';
  const body = current ?? '';
  const from = body.indexOf(begin), to = body.indexOf(end);
  const fresh = `${begin}\n${content.trimEnd()}\n${end}`;
  if (from === -1 && to === -1) return { current: null, fresh, next: body + (body && !body.endsWith('\n') ? '\n' : '') + fresh + '\n' };
  if (from < 0 || to < from || body.lastIndexOf(begin) !== from || body.lastIndexOf(end) !== to) throw new Error('SOUL.md 中 matt-orca 标记重复或不完整');
  return { current: body.slice(from, to + end.length), fresh, next: body.slice(0, from) + fresh + body.slice(to + end.length) };
}
