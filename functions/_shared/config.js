// shortcut: flat shipping fee and UPI identity are placeholders — set real values here before launch
export const SHIPPING_FEE_INR = 60;
export const UPI_VPA = 'yourupi@bank';
export const UPI_PAYEE_NAME = 'Alqawiperfumes';
export const MAX_QTY_PER_ITEM = 20;

// Legacy single-status enum (kept so existing admin.js / track.js keep rendering until Phase 4 rewrites them).
export const VALID_STATUSES = ['placed', 'utr_submitted', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'];

// v2 split: payment status and customer-facing fulfilment stage are independent.
export const PAYMENT_STATUSES = ['pending', 'submitted', 'verified', 'paid', 'failed', 'rejected', 'refund_pending', 'refunded'];
export const CUSTOMER_STAGES = ['confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'];
export const INTERNAL_STATUSES = ['awaiting_payment', 'payment_verification', 'preparing', 'packing', 'ready_for_dispatch', 'dispatched', 'delivery_in_progress', 'completed', 'cancelled'];

// Map every internal status to the simplified customer stage shown on the tracking page.
export const INTERNAL_TO_CUSTOMER = {
  awaiting_payment: 'confirmed',
  payment_verification: 'confirmed',
  preparing: 'processing',
  packing: 'processing',
  ready_for_dispatch: 'processing',
  dispatched: 'shipped',
  delivery_in_progress: 'out_for_delivery',
  completed: 'delivered',
  cancelled: 'cancelled',
};

export const COLLECTIONS = ['standard', 'premium'];

// shortcut: inventory is not enforced until the admin populates real stock levels.
// Flip to true (or set env ENFORCE_INVENTORY=1) once every variant has a real qty_available.
export const ENFORCE_INVENTORY_DEFAULT = false;
