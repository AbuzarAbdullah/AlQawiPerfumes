-- D1 full setup (idempotent): final v2.2 schema + catalog seed in one file.
-- Safe to re-run against any state.

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  inspiration TEXT NOT NULL,
  family TEXT NOT NULL,
  collection TEXT NOT NULL DEFAULT 'standard',
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS product_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL REFERENCES products(id),
  ml INTEGER NOT NULL,
  price_inr INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(product_id, ml)
);
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  pincode TEXT NOT NULL,
  delivery_instructions TEXT,
  subtotal_inr INTEGER NOT NULL,
  shipping_inr INTEGER NOT NULL,
  total_inr INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'placed',
  utr_reference TEXT,
  order_number TEXT,
  tracking_token_hash TEXT,
  payment_method TEXT NOT NULL DEFAULT 'upi_manual',
  payment_status TEXT NOT NULL DEFAULT 'pending',
  customer_stage TEXT NOT NULL DEFAULT 'confirmed',
  idempotency_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idem ON orders(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_orders_token ON orders(tracking_token_hash);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id),
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  ml INTEGER NOT NULL,
  unit_price_inr INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  line_total_inr INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS order_counters (
  year INTEGER PRIMARY KEY,
  last_seq INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS inventory (
  variant_id INTEGER PRIMARY KEY REFERENCES product_variants(id),
  qty_available INTEGER NOT NULL DEFAULT 0,
  reserved INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id),
  method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
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

CREATE TABLE IF NOT EXISTS payment_webhooks (
  event_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  payload TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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

CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS refunds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id INTEGER NOT NULL REFERENCES payments(id),
  amount_inr INTEGER NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  gateway_refund_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS coupons (
  code TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  value INTEGER NOT NULL,
  min_subtotal_inr INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT REFERENCES orders(id),
  channel TEXT NOT NULL,
  template TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Catalog seed (idempotent via INSERT OR IGNORE)
INSERT OR IGNORE INTO products (id, name, brand, inspiration, family, collection) VALUES
 ('01','Sacred Wood','Diptyque','Tam Dao','Rich & woody','standard'),
 ('02','Paradox Bloom','Prada','Paradoxe','Warm & sweet','standard'),
 ('03','Midnight Journey','Louis Vuitton','Ombre Nomade','Rich & woody','standard'),
 ('04','Bold Elixir','Jean Paul Gaultier','Le Male Elixir','Warm & sweet','standard'),
 ('05','Rose & Reverie','Ahmed Al Maghribi','Oud & Roses','Rich & woody','standard'),
 ('06','Beyond the Horizon','Amouage','Outlands','Rich & woody','standard'),
 ('07','Otherworld','Marc-Antoine Barrois','Ganymede','Rich & woody','standard'),
 ('08','Golden Hour','Xerjoff','Naxos','Warm & sweet','standard'),
 ('09','After Hours','Giorgio Armani','Stronger With You Absolutely','Warm & sweet','standard'),
 ('10','Blue Intention','Yves Saint Laurent','Y Eau de Parfum','Fresh & bright','standard'),
 ('11','Amber Embrace','Parfums de Marly','Althair','Warm & sweet','standard'),
 ('12','Crimson Aura','Maison Francis Kurkdjian','Baccarat Rouge 540','Warm & sweet','standard'),
 ('13','Golden Fortune','Paco Rabanne','One Million','Warm & sweet','standard'),
 ('14','Wild Elixir','Dior','Sauvage Elixir','Rich & woody','standard'),
 ('15','Boundless Dream','Louis Vuitton','Imagination','Warm & sweet','standard'),
 ('16','Leather Legacy','Tom Ford','Tuscan Leather','Rich & woody','standard'),
 ('17','Lavender Oud','Independent blend','Oudh & Lavender accord','Rich & woody','standard'),
 ('18','Velvet Orchard','Penhaligon''s','Halfeti','Rich & woody','standard'),
 ('19','Smoke Interlude','Amouage','Interlude Man','Rich & woody','standard'),
 ('20','Satin Oud','Maison Francis Kurkdjian','Oud Satin Mood','Rich & woody','standard'),
 ('21','Velvet Ember','Tom Ford','Tobacco Vanille','Warm & sweet','standard'),
 ('22','Tropical Oud','Maison Crivelli','Oud Maracuja','Rich & woody','standard'),
 ('23','Azure Signature','Chanel','Bleu de Chanel EDP','Fresh & bright','standard'),
 ('24','Intense Tobacco','Ormonde Jayne','Montabaco Intensivo','Rich & woody','standard'),
 ('25','Deep Horizon','Giorgio Armani','Acqua di Gio Profondo','Fresh & bright','standard'),
 ('26','Pure Garden','Xerjoff','Erba Pura','Fresh & bright','standard'),
 ('27','Desert Royale','Lattafa','Sabaya','Warm & sweet','standard'),
 ('28','Heritage Oud','Arabian Oud','Signature Oud Blend','Rich & woody','standard'),
 ('29','Midnight Opium','Yves Saint Laurent','Black Opium','Warm & sweet','standard'),
 ('p1','Our Maracuja','Alqawiperfumes','House blend tropical oud','Rich & woody','premium'),
 ('p2','Purpose 50','Alqawiperfumes','House blend signature','Warm & sweet','premium'),
 ('p3','Bin Shaikh','Alqawiperfumes','House blend royal oud','Rich & woody','premium'),
 ('p4','Boundless Dream Reserve','Louis Vuitton','Imagination','Warm & sweet','premium'),
 ('p5','Midnight Journey Reserve','Louis Vuitton','Ombre Nomade','Rich & woody','premium'),
 ('p6','Desert Royale Reserve','Lattafa','Sabaya','Warm & sweet','premium');

INSERT OR IGNORE INTO product_variants (product_id, ml, price_inr)
SELECT p.id, m.ml,
  CASE WHEN p.collection = 'premium'
    THEN CASE m.ml WHEN 10 THEN 200 WHEN 30 THEN 599 WHEN 50 THEN 1000 WHEN 100 THEN 2000 END
    ELSE CASE m.ml WHEN 10 THEN 150 WHEN 30 THEN 499 WHEN 50 THEN 800  WHEN 100 THEN 1500 END
  END
FROM products p
JOIN (SELECT 10 AS ml UNION SELECT 30 UNION SELECT 50 UNION SELECT 100) m;

INSERT OR IGNORE INTO inventory (variant_id, qty_available) SELECT id, 0 FROM product_variants;
