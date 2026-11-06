import { json, badRequest } from '../_shared/response.js';
import { isNonEmptyString, isIndianPhone, isIndianPincode, isEmail, verifyTurnstile } from '../_shared/validate.js';
import { SHIPPING_FEE_INR, UPI_VPA, UPI_PAYEE_NAME, MAX_QTY_PER_ITEM, ENFORCE_INVENTORY_DEFAULT } from '../_shared/config.js';
import { newTrackingToken, hashToken, orderNumber } from '../_shared/tokens.js';
import { notifyOrder } from '../_shared/notify.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const ok = await verifyTurnstile(body.turnstileToken, env.TURNSTILE_SECRET_KEY);
  if (!ok) return badRequest('Bot verification failed');

  // Idempotency: if the client replays the same key, return the existing order instead of creating a duplicate.
  const idemKey = typeof body.idempotencyKey === 'string' && body.idempotencyKey.length <= 80 ? body.idempotencyKey : null;
  if (idemKey) {
    const existing = await env.DB.prepare(
      'SELECT id, order_number, total_inr FROM orders WHERE idempotency_key = ?'
    ).bind(idemKey).first();
    if (existing) {
      return json({ id: existing.id, orderNumber: existing.order_number, totalInr: existing.total_inr, replayed: true }, 200);
    }
  }

  const c = body.customer || {};
  if (!isNonEmptyString(c.name, 100)) return badRequest('Name is required');
  if (!isIndianPhone(c.phone)) return badRequest('Enter a valid 10-digit Indian phone number');
  if (!isNonEmptyString(c.addressLine1, 200)) return badRequest('Address is required');
  if (!isNonEmptyString(c.city, 100)) return badRequest('City is required');
  if (!isNonEmptyString(c.state, 100)) return badRequest('State is required');
  if (!isIndianPincode(c.pincode)) return badRequest('Enter a valid 6-digit pincode');
  if (!isEmail(c.email)) return badRequest('Enter a valid email address');
  const deliveryInstructions = typeof c.deliveryInstructions === 'string' ? c.deliveryInstructions.slice(0, 500).trim() || null : null;

  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return badRequest('Cart is empty');
  if (items.length > 50) return badRequest('Too many line items');
  for (const it of items) {
    if (!isNonEmptyString(it.productId, 20) || !Number.isInteger(it.ml) || !Number.isInteger(it.qty) || it.qty < 1 || it.qty > MAX_QTY_PER_ITEM) {
      return badRequest('Invalid cart item');
    }
  }

  // Server-side price AND stock lookup. Client-supplied prices are ignored by construction.
  const enforceInventory = env.ENFORCE_INVENTORY === '1' || ENFORCE_INVENTORY_DEFAULT;
  const lineItems = [];
  for (const it of items) {
    const row = await env.DB.prepare(
      `SELECT p.id AS product_id, p.name, v.id AS variant_id, v.price_inr,
              COALESCE(i.qty_available, 0) - COALESCE(i.reserved, 0) AS stock_free
       FROM products p
       JOIN product_variants v ON v.product_id = p.id
       LEFT JOIN inventory i ON i.variant_id = v.id
       WHERE p.id = ? AND v.ml = ? AND p.active = 1 AND v.active = 1`
    ).bind(it.productId, it.ml).first();
    if (!row || row.price_inr == null) return badRequest(`${it.productId} (${it.ml}ml) is not available for purchase yet`);
    if (enforceInventory && row.stock_free < it.qty) return badRequest(`${row.name} (${it.ml}ml) is out of stock`);
    lineItems.push({
      productId: row.product_id, variantId: row.variant_id, productName: row.name,
      ml: it.ml, unitPriceInr: row.price_inr, qty: it.qty, lineTotalInr: row.price_inr * it.qty,
    });
  }

  const subtotalInr = lineItems.reduce((s, i) => s + i.lineTotalInr, 0);
  const shippingInr = SHIPPING_FEE_INR;
  const totalInr = subtotalInr + shippingInr;
  const id = crypto.randomUUID();
  const token = newTrackingToken();
  const tokenHash = await hashToken(token);
  const year = new Date().getUTCFullYear();

  // Bump the per-year counter atomically; a transient D1 unique collision retries once.
  let orderNum;
  for (let attempt = 0; attempt < 3; attempt++) {
    await env.DB.prepare(
      'INSERT INTO order_counters (year, last_seq) VALUES (?, 1) ON CONFLICT(year) DO UPDATE SET last_seq = last_seq + 1'
    ).bind(year).run();
    const row = await env.DB.prepare('SELECT last_seq FROM order_counters WHERE year = ?').bind(year).first();
    orderNum = orderNumber(year, row.last_seq);
    const clash = await env.DB.prepare('SELECT 1 FROM orders WHERE order_number = ?').bind(orderNum).first();
    if (!clash) break;
  }

  const statements = [
    env.DB.prepare(
      `INSERT INTO orders (id, order_number, tracking_token_hash, idempotency_key,
          customer_name, phone, email, address_line1, address_line2, city, state, pincode, delivery_instructions,
          subtotal_inr, shipping_inr, total_inr,
          status, payment_method, payment_status, customer_stage)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'placed', 'upi_manual', 'pending', 'confirmed')`
    ).bind(
      id, orderNum, tokenHash, idemKey,
      c.name.trim(), c.phone.trim(), c.email.trim(),
      c.addressLine1.trim(), (c.addressLine2 || '').trim() || null,
      c.city.trim(), c.state.trim(), c.pincode.trim(), deliveryInstructions,
      subtotalInr, shippingInr, totalInr,
    ),
    ...lineItems.map(i =>
      env.DB.prepare(
        `INSERT INTO order_items (order_id, product_id, product_name, ml, unit_price_inr, qty, line_total_inr) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, i.productId, i.productName, i.ml, i.unitPriceInr, i.qty, i.lineTotalInr)
    ),
    // Reserve stock. Safe even when inventory is unenforced — reserve column tracks demand either way.
    ...lineItems.map(i =>
      env.DB.prepare('UPDATE inventory SET reserved = reserved + ? WHERE variant_id = ?').bind(i.qty, i.variantId)
    ),
    // Pending UPI payment row; status only moves to VERIFIED after admin confirms.
    env.DB.prepare(
      `INSERT INTO payments (order_id, method, status, amount_inr) VALUES (?, 'upi_manual', 'pending', ?)`
    ).bind(id, totalInr),
    env.DB.prepare(
      `INSERT INTO order_status_history (order_id, internal_status, customer_stage, note, actor)
       VALUES (?, 'awaiting_payment', 'confirmed', 'order created', 'customer')`
    ).bind(id),
  ];
  await env.DB.batch(statements);
  await notifyOrder(env, id, 'order_confirmed').catch(() => {});

  const upiLink = `upi://pay?pa=${encodeURIComponent(UPI_VPA)}&pn=${encodeURIComponent(UPI_PAYEE_NAME)}&am=${totalInr}&cu=INR&tn=${encodeURIComponent('Order ' + orderNum)}`;
  return json({ id, orderNumber: orderNum, totalInr, upiLink, trackUrl: `/track.html?t=${token}` }, 201);
}
