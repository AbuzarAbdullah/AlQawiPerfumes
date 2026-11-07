import { json, badRequest } from '../../../../_shared/response.js';
import { notifyOrder } from '../../../../_shared/notify.js';

export async function onRequestPost({ env, params, data }) {
  const actor = data?.admin || 'admin';
  const order = await env.DB.prepare(
    'SELECT id, payment_status FROM orders WHERE id = ?'
  ).bind(params.id).first();
  if (!order) return json({ error: 'Order not found' }, 404);
  if (!['submitted', 'pending', 'cod_pending'].includes(order.payment_status)) return badRequest(`Cannot verify from state ${order.payment_status}`);

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE orders SET payment_status = 'paid', status = 'paid', customer_stage = 'processing',
                         updated_at = datetime('now') WHERE id = ?`
    ).bind(params.id),
    env.DB.prepare(
      `UPDATE payments SET status = 'paid', verified_by = ?, verified_at = datetime('now'), updated_at = datetime('now')
         WHERE order_id = ? AND method IN ('upi_manual', 'cod') AND status IN ('submitted', 'pending', 'cod_pending')`
    ).bind(actor, params.id),
    env.DB.prepare(
      `INSERT INTO order_status_history (order_id, internal_status, customer_stage, note, actor)
       VALUES (?, 'preparing', 'processing', 'payment verified', ?)`
    ).bind(params.id, actor),
  ]);
  await notifyOrder(env, params.id, 'payment_verified').catch(() => {});
  return json({ ok: true });
}
