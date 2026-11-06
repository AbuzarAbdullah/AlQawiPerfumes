import { json } from '../_shared/response.js';
import { COLLECTIONS } from '../_shared/config.js';

export async function onRequestGet({ request, env }) {
  const collection = new URL(request.url).searchParams.get('collection');
  const filterCol = COLLECTIONS.includes(collection) ? collection : null;
  const stmt = filterCol
    ? env.DB.prepare(
        `SELECT p.id, p.name, p.brand, p.inspiration, p.family, p.collection, v.ml, v.price_inr
         FROM products p JOIN product_variants v ON v.product_id = p.id
         WHERE p.active = 1 AND v.active = 1 AND v.price_inr IS NOT NULL AND p.collection = ?
         ORDER BY p.id, v.ml`
      ).bind(filterCol)
    : env.DB.prepare(
        `SELECT p.id, p.name, p.brand, p.inspiration, p.family, p.collection, v.ml, v.price_inr
         FROM products p JOIN product_variants v ON v.product_id = p.id
         WHERE p.active = 1 AND v.active = 1 AND v.price_inr IS NOT NULL
         ORDER BY p.id, v.ml`
      );
  const { results } = await stmt.all();
  const byId = new Map();
  for (const r of results) {
    if (!byId.has(r.id)) byId.set(r.id, { id: r.id, name: r.name, brand: r.brand, inspiration: r.inspiration, family: r.family, collection: r.collection, variants: [] });
    byId.get(r.id).variants.push({ ml: r.ml, priceInr: r.price_inr });
  }
  return json([...byId.values()]);
}
