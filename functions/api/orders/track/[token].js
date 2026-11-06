// Public tracking: lookup by hashed token. No PII (phone, address, email) leaves this endpoint.
import { json } from '../../../_shared/response.js';
import { hashToken } from '../../../_shared/tokens.js';

export async function onRequestGet({ env, params }) {
  const hash = await hashToken(params.token);
  const order = await env.DB.prepare(
    `SELECT order_number, customer_stage, payment_status, city, state,
            subtotal_inr, shipping_inr, total_inr, created_at, updated_at
       FROM orders WHERE tracking_token_hash = ?`
  ).bind(hash).first();
  if (!order) return json({ error: 'Order not found' }, 404);

  const { results: items } = await env.DB.prepare(
    'SELECT product_name, ml, qty, line_total_inr FROM order_items WHERE order_id = (SELECT id FROM orders WHERE tracking_token_hash = ?)'
  ).bind(hash).all();

  return json({
    orderNumber: order.order_number,
    customerStage: order.customer_stage,
    paymentStatus: order.payment_status,
    shipTo: { city: order.city, state: order.state },
    subtotalInr: order.subtotal_inr,
    shippingInr: order.shipping_inr,
    totalInr: order.total_inr,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    items: items.map(i => ({ productName: i.product_name, ml: i.ml, qty: i.qty, lineTotalInr: i.line_total_inr })),
  });
}
