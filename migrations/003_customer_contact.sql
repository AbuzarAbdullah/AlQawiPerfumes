-- v2.2: capture customer email and delivery instructions on orders.
ALTER TABLE orders ADD COLUMN email TEXT;
ALTER TABLE orders ADD COLUMN delivery_instructions TEXT;
