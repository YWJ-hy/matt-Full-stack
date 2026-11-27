export { digest, encode, json, read, safePath, write } from '../../templates/runtime/workspace-files.mjs';

export function soulSection(current, content) {
  const begin = '<!-- matt-orca:begin -->', end = '<!-- matt-orca:end -->';
  const body = current ?? '';
  const from = body.indexOf(begin), to = body.indexOf(end);
  const fresh = `${begin}\n${content.trimEnd()}\n${end}`;
  if (from === -1 && to === -1) return { current: null, fresh, next: body + (body && !body.endsWith('\n') ? '\n' : '') + fresh + '\n' };
  if (from < 0 || to < from || body.lastIndexOf(begin) !== from || body.lastIndexOf(end) !== to) throw new Error('SOUL.md 中 matt-orca 标记重复或不完整');
  return { current: body.slice(from, to + end.length), fresh, next: body.slice(0, from) + fresh + body.slice(to + end.length) };
}
