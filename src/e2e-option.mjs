import { createInterface } from 'node:readline/promises';

export function parseE2eOption(value) {
  if (value === undefined) return undefined;
  if (!['on', 'off'].includes(value)) throw new Error('--e2e 只接受 on 或 off');
  return value === 'on';
}

export async function askE2e() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('首次初始化请选择模式：--e2e off（推荐，仅开发）或 --e2e on（开发 + 浏览器验收）');
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await prompt.question('是否启用浏览器 E2E 验收？[y/N，默认仅开发] ')).trim().toLowerCase();
    if (['', 'n', 'no'].includes(answer)) return false;
    if (['y', 'yes'].includes(answer)) return true;
    throw new Error('请选择 y 或 n，或使用 --e2e on|off');
  } finally { prompt.close(); }
}
