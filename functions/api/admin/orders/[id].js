// Admin reads one order with its items, or PATCHes the internal status.
// Customer-facing stage is derived from the internal status via INTERNAL_TO_CUSTOMER.
import { json, badRequest } from '../../../_shared/response.js';
import { INTERNAL_STATUSES, INTERNAL_TO_CUSTOMER, VALID_STATUSES } from '../../../_shared/config.js';
import { notifyOrder } from '../../../_shared/notify.js';

const NOTIFY_ON_STAGE = { shipped: 'shipped', delivered: 'delivered', cancelled: 'cancelled' };

export async function onRequestGet({ env, params }) {
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(params.id).first();
  if (!order) return json({ error: 'Order not found' }, 404);
  const { results: items } = await env.DB.prepare('SELECT * FROM order_items WHERE order_id = ?').bind(params.id).all();
  const { results: history } = await env.DB.prepare(
    'SELECT internal_status, customer_stage, note, actor, created_at FROM order_status_history WHERE order_id = ? ORDER BY id DESC'
  ).bind(params.id).all();
  const { results: payments } = await env.DB.prepare(
    'SELECT id, method, status, amount_inr, utr, screenshot_data, gateway_payment_id, verified_at, created_at FROM payments WHERE order_id = ? ORDER BY id DESC'
  ).bind(params.id).all();
  return json({ ...order, items, history, payments });
}

export async function onRequestDelete({ env, params, request }) {
  // Only supports ?target=screenshot — permanent wipe of the payment screenshot.
  const target = new URL(request.url).searchParams.get('target');
  if (target !== 'screenshot') return badRequest('Unsupported delete target');
  const res = await env.DB.prepare(
    `UPDATE payments SET screenshot_data = NULL, updated_at = datetime('now')
       WHERE order_id = ? AND screenshot_data IS NOT NULL`
  ).bind(params.id).run();
  return json({ ok: true, cleared: res.meta.changes });
}

export async function onRequestPatch({ request, env, params, data }) {
  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }
  const actor = data?.admin || 'admin';

  // New path: admin sends internalStatus; we derive customer_stage.
  if (body.internalStatus) {
    if (!INTERNAL_STATUSES.includes(body.internalStatus)) return badRequest('Invalid internal status');
    const stage = INTERNAL_TO_CUSTOMER[body.internalStatus];
    const note = typeof body.note === 'string' ? body.note.slice(0, 200) : '';

    const result = await env.DB.prepare(
      `UPDATE orders SET customer_stage = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(stage, params.id).run();
    if (result.meta.changes === 0) return json({ error: 'Order not found' }, 404);

    await env.DB.prepare(
      `INSERT INTO order_status_history (order_id, internal_status, customer_stage, note, actor) VALUES (?, ?, ?, ?, ?)`
    ).bind(params.id, body.internalStatus, stage, note, actor).run();

    const template = NOTIFY_ON_STAGE[stage];
    if (template) await notifyOrder(env, params.id, template).catch(() => {});
    return json({ ok: true, customerStage: stage });
  }

  // Legacy path kept so the old admin dropdown still functions during rollout.
  if (body.status) {
    if (!VALID_STATUSES.includes(body.status)) return badRequest('Invalid status');
    const result = await env.DB.prepare(
      `UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(body.status, params.id).run();
    if (result.meta.changes === 0) return json({ error: 'Order not found' }, 404);
    return json({ ok: true });
  }

  return badRequest('Provide internalStatus or status');
}
