import { spawn } from 'node:child_process';
import { join } from 'node:path';

// The host supplies the form response. The Windows fallback receives review
// text only through stdin; SQL is never interpolated into PowerShell code.
const windowsDialog = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$review = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd()))
$form = New-Object Windows.Forms.Form
$form.Text = 'Matt - PostgreSQL development database'
$form.Size = New-Object Drawing.Size(820, 620)
$form.StartPosition = 'CenterScreen'
$form.TopMost = $true
$body = New-Object Windows.Forms.TextBox
$body.Multiline = $true
$body.ReadOnly = $true
$body.ScrollBars = 'Both'
$body.Dock = 'Fill'
$body.Text = $review.Replace([string][char]10, [Environment]::NewLine)
$buttons = New-Object Windows.Forms.FlowLayoutPanel
$buttons.Dock = 'Bottom'
$buttons.Height = 50
$cancel = New-Object Windows.Forms.Button
$cancel.Text = 'Cancel'
$cancel.DialogResult = 'Cancel'
$allow = New-Object Windows.Forms.Button
$allow.Text = 'Approve once'
$allow.AutoSize = $true
$allow.DialogResult = 'Yes'
$buttons.Controls.AddRange(@($cancel, $allow))
$form.Controls.AddRange(@($body, $buttons))
$form.CancelButton = $cancel
$form.AcceptButton = $cancel
$form.ActiveControl = $cancel
if ($form.ShowDialog() -eq 'Yes') { exit 0 }
exit 2
`;

export async function confirmWithPerson(server, review, signal) {
  const { target, path, sha256, impact, sql } = review;
  const message = ['允许 Backend 在以下开发库执行一次此 SQL 吗？', target, path,
    'SHA-256 ' + sha256, '预计影响：' + impact, '', sql].join('\n');
  if (server.getClientCapabilities()?.elicitation?.form) {
    const answer = await server.elicitInput({ mode: 'form', message, requestedSchema: {
      type: 'object', properties: { approve: { type: 'boolean', title: '我批准这一次开发库执行', default: false } }, required: ['approve'],
    } }, { signal });
    return answer.action === 'accept' && answer.content?.approve === true;
  }
  if (process.platform !== 'win32') throw new Error('当前客户端没有人工确认表单。请在支持 MCP 表单的 Matt 会话中发起确认。');
  const exe = join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
  return new Promise((resolve, reject) => {
    const child = spawn(exe, ['-NoProfile', '-NonInteractive', '-STA', '-Command', windowsDialog], {
      windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'], signal,
    });
    child.on('error', reject);
    child.stdin.on('error', reject);
    child.on('close', code => {
      if (code === 0 || code === 2) resolve(code === 0);
      else reject(new Error('本机确认窗口未完成，未取得人工批准'));
    });
    child.stdin.end(Buffer.from(message).toString('base64'));
  });
}
