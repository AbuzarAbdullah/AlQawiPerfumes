CREATE TABLE products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  inspiration TEXT NOT NULL,
  family TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE product_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL REFERENCES products(id),
  ml INTEGER NOT NULL,
  price_inr INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(product_id, ml)
);
CREATE INDEX idx_variants_product ON product_variants(product_id);

-- orders.id is a random UUID: it doubles as the public order-tracking token,
-- so it must never be assigned sequentially.
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  pincode TEXT NOT NULL,
  subtotal_inr INTEGER NOT NULL,
  shipping_inr INTEGER NOT NULL,
  total_inr INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'placed',
  utr_reference TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id),
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  ml INTEGER NOT NULL,
  unit_price_inr INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  line_total_inr INTEGER NOT NULL
);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_orders_status ON orders(status);
