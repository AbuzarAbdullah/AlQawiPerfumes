(() => {
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inr = n => '₹' + n.toLocaleString('en-IN');
const UPI_VPA = document.body.dataset.upiVpa || '';
const UPI_QR = document.body.dataset.upiQr || '';

const STAGES = ['confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered'];
const STAGE_LABEL = {
  confirmed: 'Order Confirmed', processing: 'Processing', shipped: 'Shipped',
  out_for_delivery: 'Out for Delivery', delivered: 'Delivered', cancelled: 'Cancelled',
};
const PAY_LABEL = {
  pending: 'Payment Pending', submitted: 'Payment Submitted — awaiting admin confirmation',
  verified: 'Payment Confirmed by Admin', paid: 'Payment Confirmed by Admin',
  failed: 'Payment Failed', rejected: 'Payment Rejected',
  cod_pending: 'Cash on Delivery',
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

// shortcut: downscale to 1600px JPEG q=0.82 so base64 stays under the 512KB server cap. Upgrade when R2 is wired.
async function fileToDataUrl(file) {
  const img = new Image();
  img.src = URL.createObjectURL(file);
  await img.decode();
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(img.src);
  return canvas.toDataURL('image/jpeg', 0.82);
}

function render(order, token) {
  const stage = order.customerStage;
  const idx = STAGES.indexOf(stage);
  const timeline = stage === 'cancelled'
    ? '<span class="done">Cancelled</span>'
    : STAGES.map((s, i) => `<span class="${i <= idx ? 'done' : ''}">${STAGE_LABEL[s]}</span>`).join('');

  const canPay = order.paymentStatus === 'pending' || order.paymentStatus === 'failed' || order.paymentStatus === 'rejected';
  const payBlock = canPay ? `<div class="pay-options">
      <h3>Pay via UPI</h3>
      ${UPI_QR ? `<img class="upi-qr" src="${esc(UPI_QR)}" alt="UPI QR code for ${esc(UPI_VPA)}">` : ''}
      <p>UPI ID: <strong>${esc(UPI_VPA)}</strong></p>
      <p class="muted">After paying, enter your transaction ID and attach the payment screenshot below.</p>
      <form id="utr-form">
        <div class="form-field"><label for="utr">Transaction ID (UTR)</label><input id="utr" required inputmode="numeric" pattern="\\d{12,22}" maxlength="22" placeholder="12-digit UPI reference"></div>
        <div class="form-field"><label for="screenshot">Payment screenshot</label><input id="screenshot" type="file" accept="image/png,image/jpeg,image/webp" required></div>
        <button type="submit" class="button dark">Submit payment</button>
        <p id="utr-error" class="error-text" hidden></p>
      </form>
    </div>` : '';

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

  const form = $('#utr-form');
  if (form) form.addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#utr-error');
    err.hidden = true;
    const file = $('#screenshot').files[0];
    try {
      if (!file) throw new Error('Attach a payment screenshot');
      const screenshot = await fileToDataUrl(file);
      const res = await fetch(`/api/orders/track/${encodeURIComponent(token)}/utr`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ utr: $('#utr').value, screenshot }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not submit payment');
      lookup(token);
    } catch (e2) { err.textContent = e2.message; err.hidden = false; }
  });
}

$('#lookup-form').addEventListener('submit', e => { e.preventDefault(); lookup($('#order-id').value.trim()); });

const qs = new URLSearchParams(location.search);
const urlToken = qs.get('t') || qs.get('o');
if (urlToken) { $('#order-id').value = urlToken; lookup(urlToken); }
})();
