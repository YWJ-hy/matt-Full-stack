import { createHash, randomUUID } from 'node:crypto';
import { isUtf8 } from 'node:buffer';
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { blocks, e2eManaged, e2eSeeds, managed, seeds, source, specTemplates, version } from './release.mjs';
import { discover } from './discover.mjs';
import { skillSources } from './matt-skills.mjs';
import { askE2e } from './e2e-option.mjs';
import { parseWorkflow, savedProvider, validateProvider, workflowPath } from '../templates/runtime/workflow.mjs';
import { documentLocations, localChoice, marker } from '../templates/runtime/docs.mjs';

const statePath = '.matt/manifest.json';
// Before 1.18 the manifest recorded template names without their content hashes.
const originalSpecSeeds = {
  'templates/spec/backend.md': '8f16d9a9e738be724ab9ebfe046bf9b534bb95a3c2000d2b9bd3b049b47bac64',
  'templates/spec/delivery.md': '6de476c95c8531641524663fabb8fd99fe5f6363a3a7afe70eda1e483a5b4983',
};
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

function sync(root, command, apply, keep, requestedE2e, requestedProvider, host) {
  const previous = read(root, statePath);
  const state = previous === null ? { format: 1, version: '0.0.0', files: {} } : JSON.parse(previous);
  if (state.format !== 1 || !state.files || !/^\d+\.\d+\.\d+$/.test(state.version)) throw new Error('无法识别清单，请先检查其版本或恢复清单');
  if (version.localeCompare(state.version, 'en', { numeric: true }) < 0) throw new Error('当前工具早于已安装版本，请使用新版');
  if (command === 'update' && !previous) throw new Error('未初始化，请先运行 init');
  const changes = [];
  const seeded = new Set(state.seeded ?? []);
  const oldWorkflow = read(root, workflowPath);
  if (oldWorkflow === null && seeded.has(workflowPath) && requestedE2e === undefined) throw new Error(`缺少 ${workflowPath}，请恢复文件或用 --e2e on|off 明确选择模式`);
  const workflow = oldWorkflow === null ? { e2e: { enabled: previous !== null } } : parseWorkflow(oldWorkflow);
  const enabled = requestedE2e ?? workflow.e2e.enabled;
  let provider = requestedProvider ?? savedProvider(workflow.e2e);
  if (!provider && seeded.has('e2e/matt.config.mjs')) provider = 'midscene';
  if (!provider && host === 'orca') provider = 'orca';
  if (!provider && enabled) provider = existsSync(safePath(root, '.matt/orca.json')) ? 'orca' : 'midscene';
  if (oldWorkflow === null || enabled !== workflow.e2e.enabled || provider !== workflow.e2e.provider) {
    workflow.e2e.enabled = enabled;
    workflow.e2e.provider = provider;
    changes.push({ name: workflowPath, old: oldWorkflow, next: encode(workflow), action: oldWorkflow === null ? 'seed' : 'configure' });
  }
  seeded.add(workflowPath);
  const useMidscene = enabled && provider === 'midscene';
  console.log(`e2e.enabled=${enabled}（${enabled ? '开发 + E2E' : '仅开发'}） e2e.provider=${provider ?? '未选择'}`);
  const files = {};
  let conflicts = 0;
  for (const [name, src] of Object.entries({ ...managed, ...e2eManaged, ...blocks })) {
    if (!useMidscene && Object.hasOwn(e2eManaged, name)) {
      if (state.files[name]) files[name] = state.files[name];
      continue;
    }
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
  const retired = new Set(Object.keys(state.files).filter(name => !Object.hasOwn(files, name)));
  for (const [directory, resources] of Object.entries(skillSources)) {
    const skill = directory.split('/')[1];
    const prefix = `.agents/skills/${skill}/`;
    if (!retired.has(`${prefix}SKILL.md`)) continue;
    const removals = [];
    let customized = false;
    for (const resource of resources) {
      const name = prefix + resource;
      const old = read(root, name);
      if (old === null) continue;
      const base = state.files[name];
      if (!base || base.kept || digest(old) !== base.upstream || digest(old) !== digest(template(`vendor/mattpocock/${skill}/${resource}`))) {
        customized = true;
        break;
      }
      removals.push({ name, old, action: 'remove-duplicate' });
    }
    if (customized) {
      console.log(`保留含本地改动的 skill，请核对同名入口 ${prefix}`);
      continue;
    }
    for (const change of removals) { changes.push(change); retired.delete(change.name); }
  }
  for (const name of retired) console.log(`retired (保留原文件，停止管理) ${name}`);
  const projectSeeds = { ...seeds, ...(useMidscene ? e2eSeeds : {}), '.matt/workspace.json': null };
  const localDocs = read(root, localChoice);
  const useLocalTemplates = host === 'orca' || seeded.has('.matt/spec-templates/shared.md') || localDocs !== null ||
    existsSync(safePath(root, '.matt/orca.json')) || existsSync(safePath(root, marker)) ||
    discover(root).candidates.some(({ repo }) => existsSync(join(root, repo, marker)));
  if (useLocalTemplates) {
    const file = read(root, '.matt/workspace.json');
    const mapping = file === null ? discover(root).config : JSON.parse(file.replace(/^\uFEFF/, ''));
    const docs = documentLocations(root, mapping);
    if (docs.status === 'ambiguous') throw new Error('存在多份文档配置，请先用 matt docs 查看候选并选择 --owner');
    if (localDocs === null && docs.source) changes.push({ action: 'seed', name: localChoice, old: null, next: encode({ expectedOwner: docs.owner }) });
  }
  const templates = useLocalTemplates ? '.matt/spec-templates' : 'spec/_templates';
  for (const name of specTemplates) projectSeeds[`${templates}/${name}`] = `templates/spec/${name}`;
  if (host === 'orca') projectSeeds['.matt/sessions.json'] = 'templates/orca/sessions.json';
  for (const [name, src] of Object.entries(projectSeeds)) {
    if (!seeded.has(name) && !existsSync(safePath(root, name))) changes.push({ name, old: null, next: src ? template(src) : encode(discover(root).config), action: 'seed' });
    if (seeded.has(name) && Object.hasOwn(originalSpecSeeds, src)) {
      const old = read(root, name);
      if (digest(old) === originalSpecSeeds[src]) changes.push({ name, old, next: template(src), action: 'update' });
    }
    seeded.add(name);
  }
  const manifest = encode({ format: 1, version, files, seeded: [...seeded] });
  if (digest(previous) !== digest(manifest)) changes.push({ name: statePath, old: previous, next: manifest, action: 'manifest' });
  for (const change of changes) console.log(`${change.action} ${change.name}`);
  if (conflicts) throw new Error(`${conflicts} 处冲突，本次未应用；请对比模板或查看 AI_SETUP.md 的 --keep`);
  if (apply) for (const { name, old, next, action } of changes) {
    if (read(root, name) !== old) throw new Error(`文件在预览后发生变化：${name}，请重新运行`);
    if (action === 'remove-duplicate') unlinkSync(safePath(root, name));
    else atomicWrite(root, name, next);
  }
  console.log(`${apply ? 'applied' : 'preview'} ${version} changes=${changes.length}`);
  return workflow.e2e;
}

export async function install(root, command, apply, keep, requestedE2e, requestedProvider, host) {
  if (host !== undefined && host !== 'orca') throw new Error('--host 仅支持 orca；其他宿主省略该参数');
  validateProvider(requestedProvider);
  const fresh = !existsSync(safePath(root, statePath));
  if (fresh && discover(root).candidates.length < 2) throw new Error('首次安装需要在包含至少两个独立 Git 子仓库的共同父目录执行');
  if (!apply) return sync(root, command, false, keep, requestedE2e, requestedProvider, host);
  if (host !== 'orca' && fresh && command === 'init' && requestedE2e === undefined && !existsSync(safePath(root, workflowPath))) requestedE2e = await askE2e();
  return withInstallLock(root, () => sync(root, command, true, keep, requestedE2e, requestedProvider, host));
}

export function withInstallLock(root, operation) {
  const lock = safePath(root, '.matt/install.lock');
  mkdirSync(dirname(lock), { recursive: true });
  const fd = openSync(lock, 'wx');
  try {
    writeFileSync(fd, String(process.pid));
    return operation();
  } finally { closeSync(fd); unlinkSync(lock); }
}
