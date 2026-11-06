// Minimal multi-channel notifier. Each call records a row in `notifications`, attempts delivery when creds exist,
// and is a no-op otherwise so dev / unconfigured deploys keep working.
//
// Templates: 'order_confirmed' | 'payment_verified' | 'shipped' | 'delivered' | 'cancelled'
const SUBJECTS = {
  order_confirmed: 'Your Alqawiperfumes order is confirmed',
  payment_verified: 'Payment verified — we are preparing your order',
  shipped: 'Your Alqawiperfumes order is on its way',
  delivered: 'Your Alqawiperfumes order has been delivered',
  cancelled: 'Your Alqawiperfumes order was cancelled',
};

function body(template, order, trackUrl) {
  const n = order.order_number || order.id.slice(0, 8);
  const common = `\n\nTrack here: ${trackUrl}\n\n— Alqawiperfumes`;
  switch (template) {
    case 'order_confirmed': return `Hi ${order.customer_name},\n\nWe received your order ${n} for ₹${order.total_inr}. Complete payment to start processing.${common}`;
    case 'payment_verified': return `Hi ${order.customer_name},\n\nPayment confirmed for order ${n}. We are preparing it now.${common}`;
    case 'shipped': return `Hi ${order.customer_name},\n\nOrder ${n} has shipped.${common}`;
    case 'delivered': return `Hi ${order.customer_name},\n\nOrder ${n} has been delivered. Thank you!${common}`;
    case 'cancelled': return `Hi ${order.customer_name},\n\nOrder ${n} was cancelled.${common}`;
    default: return `Update on your order ${n}.${common}`;
  }
}

async function sendEmailResend(env, to, subject, text) {
  if (!env.RESEND_API_KEY || !env.NOTIFY_FROM_EMAIL || !to) return 'skipped';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'authorization': `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.NOTIFY_FROM_EMAIL, to, subject, text }),
  });
  return res.ok ? 'sent' : 'failed';
}

async function sendWhatsAppCloud(env, phone, text) {
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID || !phone) return 'skipped';
  // shortcut: free-form text works only inside the 24-hour customer-service window; outside it, needs an approved template
  const res = await fetch(`https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { 'authorization': `Bearer ${env.WHATSAPP_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: text } }),
  });
  return res.ok ? 'sent' : 'failed';
}

export async function notifyOrder(env, orderId, template) {
  const order = await env.DB.prepare(
    'SELECT id, order_number, customer_name, phone, email, total_inr, tracking_token_hash FROM orders WHERE id = ?'
  ).bind(orderId).first();
  if (!order) return;

  // Dedupe: skip if this template already fired for this order.
  const dup = await env.DB.prepare(
    `SELECT 1 FROM notifications WHERE order_id = ? AND template = ? AND status = 'sent' LIMIT 1`
  ).bind(orderId, template).first();
  if (dup) return;

  // The raw tracking token is not stored — the customer already has it. Use the admin-friendly order-number link.
  const base = env.PUBLIC_BASE_URL || '';
  const trackUrl = `${base}/track.html?n=${encodeURIComponent(order.order_number || '')}`;

  const text = body(template, order, trackUrl);
  const subject = SUBJECTS[template] || 'Order update';

  const email = order.email || env.NOTIFY_BCC_EMAIL || null;
  const emailStatus = await sendEmailResend(env, email, subject, text).catch(() => 'failed');
  const waStatus = await sendWhatsAppCloud(env, order.phone, text).catch(() => 'failed');

  await env.DB.batch([
    env.DB.prepare(`INSERT INTO notifications (order_id, channel, template, status) VALUES (?, 'email', ?, ?)`).bind(orderId, template, emailStatus),
    env.DB.prepare(`INSERT INTO notifications (order_id, channel, template, status) VALUES (?, 'whatsapp', ?, ?)`).bind(orderId, template, waStatus),
  ]);
}
