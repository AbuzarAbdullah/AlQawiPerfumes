import { json } from '../../_shared/response.js';

export async function onRequestGet({ env, params }) {
  const order = await env.DB.prepare(
    'SELECT id, customer_name, status, subtotal_inr, shipping_inr, total_inr, created_at FROM orders WHERE id = ?'
  ).bind(params.id).first();
  if (!order) return json({ error: 'Order not found' }, 404);

  const { results: items } = await env.DB.prepare(
    'SELECT product_name, ml, qty, line_total_inr FROM order_items WHERE order_id = ?'
  ).bind(params.id).all();

  return json({
    id: order.id,
    customerName: order.customer_name,
    status: order.status,
    subtotalInr: order.subtotal_inr,
    shippingInr: order.shipping_inr,
    totalInr: order.total_inr,
    createdAt: order.created_at,
    items: items.map(i => ({ productName: i.product_name, ml: i.ml, qty: i.qty, lineTotalInr: i.line_total_inr })),
  });
}
