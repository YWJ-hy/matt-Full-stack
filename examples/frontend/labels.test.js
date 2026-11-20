import assert from 'node:assert/strict';
import test from 'node:test';
import { ticketStatus } from './labels.js';

test('工单状态包含当前处理人', () => {
  assert.equal(ticketStatus({ owner: null }), '待领取');
  assert.equal(ticketStatus({ owner: '客服乙' }), '处理中 · 客服乙');
});
