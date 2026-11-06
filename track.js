(() => {
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inr = n => '₹' + n.toLocaleString('en-IN');

const STAGES = ['confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered'];
const STAGE_LABEL = {
  confirmed: 'Order Confirmed', processing: 'Processing', shipped: 'Shipped',
  out_for_delivery: 'Out for Delivery', delivered: 'Delivered', cancelled: 'Cancelled',
};
const PAY_LABEL = {
  pending: 'Payment Pending', submitted: 'Payment Submitted', verified: 'Payment Verified',
  paid: 'Payment Verified', failed: 'Payment Failed', rejected: 'Payment Failed',
  refund_pending: 'Refund Pending', refunded: 'Refunded',
};

async function lookup(token) {
  const errorEl = $('#track-error');
  errorEl.hidden = true;
  $('#track-result').hidden = true;
  try {
    const res = await fetch(`/api/orders/track/${encodeURIComponent(token)}`);
    const order = await res.json();
    if (!res.ok) throw new Error(order.error || 'Order not found');
    render(order, token);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
}

function render(order, token) {
  const stage = order.customerStage;
  const idx = STAGES.indexOf(stage);
  const timeline = stage === 'cancelled'
    ? '<span class="done">Cancelled</span>'
    : STAGES.map((s, i) => `<span class="${i <= idx ? 'done' : ''}">${STAGE_LABEL[s]}</span>`).join('');

  const canPay = order.paymentStatus === 'pending' || order.paymentStatus === 'failed' || order.paymentStatus === 'rejected';
  const payBlock = canPay ? `<div class="pay-options">
      <h3>Pay now</h3>
      <button type="button" id="pay-gateway" class="button dark">Pay online (card/UPI/netbanking)</button>
      <details><summary>Or pay via UPI manually and submit the reference</summary>
        <form id="utr-form">
          <div class="form-field"><label for="utr">UPI transaction reference (UTR)</label><input id="utr" required maxlength="50"></div>
          <button type="submit" class="button">Submit payment reference</button>
          <p id="utr-error" class="error-text" hidden></p>
        </form>
      </details>
    </div>` : order.paymentStatus === 'submitted' ? '<p class="muted">Payment reference received — we\'ll confirm it shortly.</p>' : '';

  $('#track-result').hidden = false;
  $('#track-result').innerHTML = `<h2>Order ${esc(order.orderNumber)}</h2>
    <p class="status-badge">${STAGE_LABEL[stage] || stage}</p>
    <p class="muted">${PAY_LABEL[order.paymentStatus] || order.paymentStatus}</p>
    <div class="timeline">${timeline}</div>
    ${order.items.map(i => `<div class="cart-line"><span>${esc(i.productName)} (${i.ml}ml) × ${i.qty}</span><span>${inr(i.lineTotalInr)}</span></div>`).join('')}
    <div class="cart-line"><span>Shipping to</span><span>${esc(order.shipTo.city)}, ${esc(order.shipTo.state)}</span></div>
    <div class="cart-line"><span>Shipping</span><span>${inr(order.shippingInr)}</span></div>
    <div class="order-total"><span>Total</span><span>${inr(order.totalInr)}</span></div>
    <p class="muted">Last updated ${esc(order.updatedAt)}</p>
    ${payBlock}`;

  const payBtn = $('#pay-gateway');
  if (payBtn) payBtn.addEventListener('click', () => payWithGateway(token, order));

  const form = $('#utr-form');
  if (form) form.addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#utr-error');
    err.hidden = true;
    try {
      const res = await fetch(`/api/orders/track/${encodeURIComponent(token)}/utr`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ utr: $('#utr').value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not submit reference');
      lookup(token);
    } catch (e2) { err.textContent = e2.message; err.hidden = false; }
  });
}

async function payWithGateway(token, order) {
  if (typeof Razorpay === 'undefined') { alert('Payment SDK did not load — try again in a moment.'); return; }
  const res = await fetch('/api/payments/gateway/create', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ trackingToken: token }),
  });
  const data = await res.json();
  if (!res.ok) { alert(data.error || 'Could not start payment'); return; }
  const rz = new Razorpay({
    key: data.keyId, amount: data.amount, currency: data.currency,
    name: 'Alqawiperfumes', description: `Order ${order.orderNumber}`,
    order_id: data.gatewayOrderId,
    handler: async r => {
      const v = await fetch('/api/payments/gateway/verify', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          trackingToken: token,
          razorpayOrderId: r.razorpay_order_id,
          razorpayPaymentId: r.razorpay_payment_id,
          razorpaySignature: r.razorpay_signature,
        }),
      });
      const vd = await v.json();
      if (!v.ok) { alert(vd.error || 'Verification failed — if you were charged, contact support.'); return; }
      lookup(token);
    },
    theme: { color: '#dab36a' },
  });
  rz.open();
}

$('#lookup-form').addEventListener('submit', e => { e.preventDefault(); lookup($('#order-id').value.trim()); });

const qs = new URLSearchParams(location.search);
const urlToken = qs.get('t') || qs.get('o'); // 'o' preserved as legacy alias
if (urlToken) { $('#order-id').value = urlToken; lookup(urlToken); }
})();
