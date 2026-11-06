// Dashboard numbers. Revenue is always from verified (paid) payments, not from order totals.
import { json } from '../../../_shared/response.js';

export async function onRequestGet({ env }) {
  const q = env.DB;
  const [totals, today, pendingPay, lowStock, byCollection, bestProducts, bestSizes, daily] = await Promise.all([
    q.prepare(
      `SELECT
         COUNT(*) AS total_orders,
         SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END) AS paid_orders,
         SUM(CASE WHEN payment_status = 'paid' THEN total_inr ELSE 0 END) AS verified_revenue_inr,
         SUM(CASE WHEN customer_stage = 'processing' THEN 1 ELSE 0 END) AS processing_orders,
         SUM(CASE WHEN customer_stage = 'delivered' THEN 1 ELSE 0 END) AS delivered_orders,
         SUM(CASE WHEN customer_stage = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_orders,
         SUM(CASE WHEN payment_status IN ('refunded','refund_pending') THEN total_inr ELSE 0 END) AS refunds_inr
       FROM orders`
    ).first(),
    q.prepare(
      `SELECT COUNT(*) AS n FROM orders WHERE date(created_at) = date('now')`
    ).first(),
    q.prepare(
      `SELECT COUNT(*) AS n FROM orders WHERE payment_status IN ('pending','submitted')`
    ).first(),
    q.prepare(
      `SELECT p.name AS product_name, v.ml, i.qty_available, i.reserved
         FROM inventory i
         JOIN product_variants v ON v.id = i.variant_id
         JOIN products p ON p.id = v.product_id
        WHERE (i.qty_available - i.reserved) <= 5
        ORDER BY (i.qty_available - i.reserved) ASC LIMIT 20`
    ).all(),
    q.prepare(
      `SELECT p.collection, SUM(oi.line_total_inr) AS revenue_inr, COUNT(DISTINCT o.id) AS orders
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN products p ON p.id = oi.product_id
        WHERE o.payment_status = 'paid'
        GROUP BY p.collection`
    ).all(),
    q.prepare(
      `SELECT oi.product_name, SUM(oi.qty) AS units_sold, SUM(oi.line_total_inr) AS revenue_inr
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
        WHERE o.payment_status = 'paid'
        GROUP BY oi.product_id ORDER BY units_sold DESC LIMIT 10`
    ).all(),
    q.prepare(
      `SELECT oi.ml, SUM(oi.qty) AS units_sold
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
        WHERE o.payment_status = 'paid'
        GROUP BY oi.ml ORDER BY units_sold DESC`
    ).all(),
    q.prepare(
      `SELECT date(created_at) AS day, SUM(total_inr) AS revenue_inr
         FROM orders WHERE payment_status = 'paid' AND created_at >= date('now','-30 days')
        GROUP BY day ORDER BY day`
    ).all(),
  ]);

  return json({
    totals: totals || {},
    todayOrders: today?.n ?? 0,
    pendingPayments: pendingPay?.n ?? 0,
    lowStock: lowStock.results,
    byCollection: byCollection.results,
    bestSellers: bestProducts.results,
    bySize: bestSizes.results,
    daily: daily.results,
  });
}
