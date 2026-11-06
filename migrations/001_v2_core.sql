-- v2 migration: collections, premium catalogue, prices, inventory, payments, admin, 5-stage tracking.
-- Additive only. Safe to run once on an existing v1 database.

-- 1. collection on products (default existing 28 rows to 'standard')
ALTER TABLE products ADD COLUMN collection TEXT NOT NULL DEFAULT 'standard';

-- 2. order fields for public order number, hashed tracking token, payment status, 5-stage customer view
ALTER TABLE orders ADD COLUMN order_number TEXT;
ALTER TABLE orders ADD COLUMN tracking_token_hash TEXT;
ALTER TABLE orders ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'upi_manual';
ALTER TABLE orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN customer_stage TEXT NOT NULL DEFAULT 'confirmed';
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_token ON orders(tracking_token_hash);

-- 3. the missing 29th standard entry + the 6 premium entries
INSERT INTO products (id, name, brand, inspiration, family, collection) VALUES
  ('29', 'Midnight Opium', 'Yves Saint Laurent', 'Black Opium', 'Warm & sweet', 'standard'),
  ('p1', 'Our Maracuja', 'Alqawiperfumes', 'House blend — tropical oud', 'Rich & woody', 'premium'),
  ('p2', 'Purpose 50', 'Alqawiperfumes', 'House blend — signature', 'Warm & sweet', 'premium'),
  ('p3', 'Bin Shaikh', 'Alqawiperfumes', 'House blend — royal oud', 'Rich & woody', 'premium'),
  ('p4', 'Boundless Dream Reserve', 'Louis Vuitton', 'Imagination', 'Warm & sweet', 'premium'),
  ('p5', 'Midnight Journey Reserve', 'Louis Vuitton', 'Ombre Nomade', 'Rich & woody', 'premium'),
  ('p6', 'Desert Royale Reserve', 'Lattafa', 'Sabaya', 'Warm & sweet', 'premium');

INSERT INTO product_variants (product_id, ml, price_inr) VALUES
  ('29', 10, NULL),('29', 30, NULL),('29', 50, NULL),('29', 100, NULL),
  ('p1', 10, NULL),('p1', 30, NULL),('p1', 50, NULL),('p1', 100, NULL),
  ('p2', 10, NULL),('p2', 30, NULL),('p2', 50, NULL),('p2', 100, NULL),
  ('p3', 10, NULL),('p3', 30, NULL),('p3', 50, NULL),('p3', 100, NULL),
  ('p4', 10, NULL),('p4', 30, NULL),('p4', 50, NULL),('p4', 100, NULL),
  ('p5', 10, NULL),('p5', 30, NULL),('p5', 50, NULL),('p5', 100, NULL),
  ('p6', 10, NULL),('p6', 30, NULL),('p6', 50, NULL),('p6', 100, NULL);

-- 4. spec prices (standard: 150/499/800/1500 · premium: 200/599/1000/2000) — only for rows still NULL
UPDATE product_variants SET price_inr = CASE ml WHEN 10 THEN 150 WHEN 30 THEN 499 WHEN 50 THEN 800 WHEN 100 THEN 1500 END
  WHERE price_inr IS NULL AND product_id IN (SELECT id FROM products WHERE collection = 'standard');
UPDATE product_variants SET price_inr = CASE ml WHEN 10 THEN 200 WHEN 30 THEN 599 WHEN 50 THEN 1000 WHEN 100 THEN 2000 END
  WHERE price_inr IS NULL AND product_id IN (SELECT id FROM products WHERE collection = 'premium');

-- 5. inventory: one row per variant. qty_available=stock on hand, reserved=in unpaid carts/orders.
CREATE TABLE IF NOT EXISTS inventory (
  variant_id INTEGER PRIMARY KEY REFERENCES product_variants(id),
  qty_available INTEGER NOT NULL DEFAULT 0,
  reserved INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO inventory (variant_id, qty_available) SELECT id, 0 FROM product_variants;

-- 6. payments: one row per payment attempt. UPI manual and gateway coexist.
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id),
  method TEXT NOT NULL,                    -- 'upi_manual' | 'razorpay'
  status TEXT NOT NULL DEFAULT 'pending',  -- PENDING|SUBMITTED|VERIFIED|PAID|FAILED|REJECTED|REFUND_PENDING|REFUNDED
  amount_inr INTEGER NOT NULL,
  utr TEXT,
  gateway_order_id TEXT,
  gateway_payment_id TEXT,
  gateway_signature TEXT,
  verified_by TEXT,
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_gateway ON payments(gateway_payment_id);

-- 7. webhook dedupe: event_id is the gateway's event identifier
CREATE TABLE IF NOT EXISTS payment_webhooks (
  event_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  payload TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 8. audit trail of internal order status changes
CREATE TABLE IF NOT EXISTS order_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id),
  internal_status TEXT NOT NULL,
  customer_stage TEXT,
  note TEXT,
  actor TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_status_history_order ON order_status_history(order_id);

-- 9. admin users (bcrypt-style hash in password_hash; initial user seeded by an out-of-band script)
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 10. refunds (gateway or manual)
CREATE TABLE IF NOT EXISTS refunds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id INTEGER NOT NULL REFERENCES payments(id),
  amount_inr INTEGER NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  gateway_refund_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 11. coupons (used in a later phase; empty placeholder schema is cheap)
CREATE TABLE IF NOT EXISTS coupons (
  code TEXT PRIMARY KEY,
  kind TEXT NOT NULL,              -- 'percent' | 'flat'
  value INTEGER NOT NULL,
  min_subtotal_inr INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT
);

-- 12. notification log (phase 9)
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT REFERENCES orders(id),
  channel TEXT NOT NULL,           -- 'email' | 'whatsapp'
  template TEXT NOT NULL,
  status TEXT NOT NULL,            -- 'queued' | 'sent' | 'failed'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
