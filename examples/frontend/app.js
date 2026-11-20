import { ticketStatus } from './labels.js';

const list = document.querySelector('ul');
const status = document.querySelector('#status');
const signin = document.querySelector('#signin');

async function refresh() {
  const response = await fetch('/api/tickets');
  if (response.status === 401) {
    signin.hidden = false;
    status.textContent = '请先登录查看工单。';
    list.replaceChildren();
    return;
  }
  if (!response.ok) throw new Error('工单加载失败，请确认后端已启动。');
  const tickets = await response.json();
  signin.hidden = true;
  status.textContent = `体验客服 · ${tickets.length} 张工单`;
  list.replaceChildren(...tickets.map(ticket => {
    const item = document.createElement('li');
    const title = document.createElement('strong');
    const detail = document.createElement('small');
    title.textContent = `${ticket.id} ${ticket.title}`;
    detail.textContent = ticketStatus(ticket);
    item.append(title, detail);
    return item;
  }));
}

function showError(error) { status.textContent = error.message; }
signin.onclick = async () => {
  try {
    const response = await fetch('/api/demo-session', { method: 'POST' });
    if (!response.ok) throw new Error('体验登录失败。');
    await refresh();
  } catch (error) { showError(error); }
};
refresh().catch(showError);
