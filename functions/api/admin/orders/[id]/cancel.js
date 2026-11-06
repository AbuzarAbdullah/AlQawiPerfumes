// Cancels an order and releases its stock reservation. Paid orders still need a separate refund action.
import { json, badRequest } from '../../../../_shared/response.js';
import { notifyOrder } from '../../../../_shared/notify.js';

export async function onRequestPost({ request, env, params, data }) {
  let body = {};
  try { body = await request.json(); } catch {}
  const reason = typeof body.reason === 'string' ? body.reason.slice(0, 200) : '';
  const actor = data?.admin || 'admin';

  const order = await env.DB.prepare(
    'SELECT id, customer_stage, payment_status FROM orders WHERE id = ?'
  ).bind(params.id).first();
  if (!order) return json({ error: 'Order not found' }, 404);
  if (order.customer_stage === 'cancelled') return badRequest('Order already cancelled');
  if (order.customer_stage === 'delivered') return badRequest('Cannot cancel a delivered order');

  const { results: items } = await env.DB.prepare(
    `SELECT v.id AS variant_id, oi.qty
       FROM order_items oi
       JOIN product_variants v ON v.product_id = oi.product_id AND v.ml = oi.ml
      WHERE oi.order_id = ?`
  ).bind(params.id).all();

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE orders SET customer_stage = 'cancelled', status = 'cancelled', updated_at = datetime('now') WHERE id = ?`
    ).bind(params.id),
    ...items.map(i =>
      env.DB.prepare(
        `UPDATE inventory SET reserved = MAX(0, reserved - ?) WHERE variant_id = ?`
      ).bind(i.qty, i.variant_id)
    ),
    env.DB.prepare(
      `INSERT INTO order_status_history (order_id, internal_status, customer_stage, note, actor)
       VALUES (?, 'cancelled', 'cancelled', ?, ?)`
    ).bind(params.id, `cancelled${reason ? ': ' + reason : ''}`, actor),
  ]);

  await notifyOrder(env, params.id, 'cancelled').catch(() => {});
  return json({ ok: true, needsRefund: order.payment_status === 'paid' });
}
