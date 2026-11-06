import { json, badRequest } from '../../../../_shared/response.js';

export async function onRequestPost({ request, env, params, data }) {
  let body = {};
  try { body = await request.json(); } catch {}
  const reason = typeof body.reason === 'string' ? body.reason.slice(0, 200) : '';
  const actor = data?.admin || 'admin';

  const order = await env.DB.prepare('SELECT id, payment_status FROM orders WHERE id = ?').bind(params.id).first();
  if (!order) return json({ error: 'Order not found' }, 404);
  if (order.payment_status === 'paid' || order.payment_status === 'refunded') return badRequest('Cannot reject a paid or refunded order');

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE orders SET payment_status = 'rejected', status = 'placed',
                         updated_at = datetime('now') WHERE id = ?`
    ).bind(params.id),
    env.DB.prepare(
      `UPDATE payments SET status = 'rejected', verified_by = ?, verified_at = datetime('now'),
                           updated_at = datetime('now')
         WHERE order_id = ? AND method = 'upi_manual' AND status IN ('submitted', 'pending')`
    ).bind(actor, params.id),
    env.DB.prepare(
      `INSERT INTO order_status_history (order_id, internal_status, customer_stage, note, actor)
       VALUES (?, 'awaiting_payment', 'confirmed', ?, ?)`
    ).bind(params.id, `payment rejected${reason ? ': ' + reason : ''}`, actor),
  ]);
  return json({ ok: true });
}
