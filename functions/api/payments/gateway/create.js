// Customer requests a Razorpay order for an existing internal order (identified by tracking token).
// Creates a `payments` row with method='razorpay', status='pending', then calls Razorpay.
import { json, badRequest } from '../../../_shared/response.js';
import { hashToken } from '../../../_shared/tokens.js';
import { createGatewayOrder } from '../../../_shared/razorpay.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }
  if (typeof body.trackingToken !== 'string') return badRequest('trackingToken is required');

  const hash = await hashToken(body.trackingToken);
  const order = await env.DB.prepare(
    'SELECT id, order_number, total_inr, payment_status FROM orders WHERE tracking_token_hash = ?'
  ).bind(hash).first();
  if (!order) return json({ error: 'Order not found' }, 404);
  if (order.payment_status === 'paid') return badRequest('Order is already paid');

  const amountPaise = order.total_inr * 100;
  const gw = await createGatewayOrder({
    keyId: env.PAYMENT_GATEWAY_KEY_ID,
    keySecret: env.PAYMENT_GATEWAY_KEY_SECRET,
    amountPaise,
    receipt: order.order_number,
    notes: { internal_order_id: order.id },
  });

  await env.DB.prepare(
    `INSERT INTO payments (order_id, method, status, amount_inr, gateway_order_id)
     VALUES (?, 'razorpay', 'pending', ?, ?)`
  ).bind(order.id, order.total_inr, gw.id).run();

  return json({
    keyId: env.PAYMENT_GATEWAY_KEY_ID,
    gatewayOrderId: gw.id,
    amount: gw.amount,
    currency: gw.currency,
    orderNumber: order.order_number,
  });
}
