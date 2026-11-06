-- v2.1: idempotency key on orders, counter table for the AQ-YYYY-NNNNN sequence.
ALTER TABLE orders ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idem ON orders(idempotency_key);

-- Per-year monotonic counter. We bump it inside the order batch so concurrent orders cannot collide.
CREATE TABLE IF NOT EXISTS order_counters (
  year INTEGER PRIMARY KEY,
  last_seq INTEGER NOT NULL DEFAULT 0
);
