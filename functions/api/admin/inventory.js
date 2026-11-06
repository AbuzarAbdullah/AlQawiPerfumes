import { json } from '../../_shared/response.js';

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    `SELECT v.id AS variant_id, v.ml, v.price_inr, v.active,
            p.id AS product_id, p.name AS product_name, p.collection,
            COALESCE(i.qty_available, 0) AS qty_available,
            COALESCE(i.reserved, 0) AS reserved
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
  LEFT JOIN inventory i ON i.variant_id = v.id
      ORDER BY p.collection, p.id, v.ml`
  ).all();
  return json(results);
}
