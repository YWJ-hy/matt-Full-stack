import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { encode, json, read, safePath, write } from './workspace-files.mjs';

export const marker = '.matt-docs.json';
export const localChoice = '.matt/private/docs-location.json';
const defaults = { version: 1, agentDocs: 'docs/agents', specs: 'spec' };

function portable(path) {
  if (typeof path !== 'string' || path.split('/').some(part =>
    !part || !part.trim() || part.startsWith('.') || /[:\\<>|"?*\x00-\x1f]/.test(part) || /[ .]$/.test(part))) {
    throw new Error(`文档路径需要可移植的相对目录：${path}`);
  }
  return path;
}

function projectRoots(root, mapping) {
  const roots = { parent: realpathSync(root) };
  for (const role of ['frontend', 'backend']) {
    const name = mapping[role]?.repo;
    if (name == null) continue;
    portable(name);
    if (name.includes('/')) throw new Error(`${role}.repo 需要直接子仓名`);
    const path = join(roots.parent, name);
    if (!lstatSync(path, { throwIfNoEntry: false })?.isDirectory() || !existsSync(join(path, '.git'))) throw new Error(`需要实际 Git 子仓：${path}`);
    roots[role] = realpathSync(path);
  }
  return roots;
}

function directory(base, path, roots) {
  const parts = portable(path).split('/');
  // A parent-level convention can refer to either mapped checkout. Other nested repos stay out of scope.
  const child = Object.values(roots).find(path => !relative(path, join(base, parts[0])));
  if (base === roots.parent && child) {
    base = child;
    parts.shift();
  }
  if (!parts.length) throw new Error('文档路径需要指向仓库中的目录');
  return safePath(base, parts.join('/'), { directory: true });
}

function locations(roots, owner, config, source) {
  if (config?.version !== 1 || !config.agentDocs || !config.specs) throw new Error(`请核对文档配置 version、agentDocs 和 specs：${source}`);
  const current = join(roots.parent, '.matt', 'spec-templates');
  const legacy = join(roots.parent, 'spec', '_templates');
  return {
    owner, source, agentDocs: directory(roots[owner], config.agentDocs, roots),
    specs: directory(roots[owner], config.specs, roots), fallbackTemplates: !existsSync(current) && existsSync(legacy) ? legacy : current,
  };
}

export function documentLocations(root, mapping, options = {}) {
  const roots = projectRoots(root, mapping);
  const entries = Object.entries(roots);
  const markers = entries.filter(([, base]) => read(base, marker) !== null).map(([role]) => role);
  const saved = json(root, localChoice, {});
  const { owner, local, apply, agentDocs, specs } = options;
  if (owner !== undefined && !Object.hasOwn(roots, owner)) throw new Error('请选 parent、frontend 或 backend，并先核对该端仓库映射');
  const candidateInfo = () => entries.map(([role, base]) => ({
    owner: role, root: base, marker: markers.includes(role),
    instructions: ['CLAUDE.md', 'AGENTS.md'].filter(name => existsSync(join(base, name))).map(name => join(base, name)),
    directories: ['docs/agents', 'spec'].filter(path => existsSync(join(base, path))).map(path => join(base, path)),
  }));
  if (owner && !markers.includes(owner) && markers.length) throw new Error(`已有共享配置：${markers.map(role => join(roots[role], marker)).join('、')}，请复用或明确迁移`);
  const expectedOwner = saved.markerOwner ?? saved.expectedOwner;
  if (expectedOwner && !markers.includes(expectedOwner) && !owner) throw new Error(`已选的 ${expectedOwner}/${marker} 缺失，请核对分支或重新选择`);
  const selected = owner ?? saved.markerOwner ?? (markers.length === 1 ? markers[0] : undefined);
  if (selected && markers.includes(selected)) {
    const existing = json(roots[selected], marker);
    if ((agentDocs && agentDocs !== existing.agentDocs) || (specs && specs !== existing.specs)) throw new Error('与已有文档配置不同，请先核对路径');
    const result = locations(roots, selected, existing, join(roots[selected], marker));
    if (apply) write(root, localChoice, encode({ markerOwner: selected }));
    return { status: 'configured', ...result };
  }
  if (markers.length > 1) {
    const choices = markers.map(role => locations(roots, role, json(roots[role], marker), join(roots[role], marker)));
    const first = choices[0];
    if (choices.every(item => !relative(first.agentDocs, item.agentDocs) && !relative(first.specs, item.specs))) return { status: 'configured', ...first };
    return { status: 'ambiguous', candidates: choices };
  }
  if (owner) {
    const config = { ...defaults, agentDocs: agentDocs ?? defaults.agentDocs, specs: specs ?? defaults.specs };
    const source = local ? join(root, localChoice) : join(roots[owner], marker);
    const result = locations(roots, owner, config, source);
    if (apply) {
      if (local) write(root, localChoice, encode({ owner, config }));
      else {
        write(roots[owner], marker, encode(config), null);
        write(root, localChoice, encode({ markerOwner: owner }));
      }
    }
    return { status: apply ? 'configured' : 'proposed', ...result };
  }
  if (saved.config) {
    if (!Object.hasOwn(roots, saved.owner)) throw new Error('本机约定引用的仓库缺失，请核对仓库映射');
    return { status: 'configured', ...locations(roots, saved.owner, saved.config, join(root, localChoice)) };
  }
  return { status: 'unconfigured', ...locations(roots, 'parent', defaults, null), candidates: candidateInfo() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const result = documentLocations(root, json(root, '.matt/workspace.json'));
    console.log(encode(result).trimEnd());
    if (result.status === 'ambiguous') process.exitCode = 2;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
