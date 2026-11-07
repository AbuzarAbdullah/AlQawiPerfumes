(() => {
'use strict';
const $ = s => document.querySelector(s);
const key = 'perfume-selection-v1';
const SHIPPING_FEE_INR = 60; // shortcut: keep in sync with functions/_shared/config.js until this is served from the API
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inr = n => '₹' + n.toLocaleString('en-IN');

let selectedIds = [];
try { const saved = JSON.parse(localStorage.getItem(key) || '[]'); if (Array.isArray(saved)) selectedIds = saved; } catch {}

let cart = []; // [{id,name,brand,inspiration,variants,ml,qty}]

function lineTotal(item) {
  const variant = item.variants.find(v => v.ml === item.ml);
  return variant ? variant.priceInr * item.qty : 0;
}

function renderCart() {
  const container = $('#cart-items');
  const empty = cart.length === 0;
  $('#empty-cart').hidden = !empty;
  $('#checkout-form').hidden = empty;
  $('#cart-card').hidden = empty;
  $('#summary-card').hidden = empty;
  if (empty) { container.innerHTML = ''; $('#order-summary').innerHTML = ''; return; }
  container.innerHTML = cart.map((item, i) => `<div class="cart-line">
    <div><strong>${esc(item.name)}</strong><br><small>Inspired by ${esc(item.brand)}</small></div>
    <select data-ml="${i}">${item.variants.map(v => `<option value="${v.ml}" ${v.ml === item.ml ? 'selected' : ''}>${v.ml}ml — ${inr(v.priceInr)}</option>`).join('')}</select>
    <input type="number" min="1" max="20" value="${item.qty}" data-qty="${i}" style="width:55px">
    <span>${inr(lineTotal(item))}</span>
    <button type="button" data-remove="${i}" aria-label="Remove ${esc(item.name)}">Remove</button>
  </div>`).join('');

  const subtotal = cart.reduce((s, i) => s + lineTotal(i), 0);
  const total = subtotal + SHIPPING_FEE_INR;
  $('#order-summary').innerHTML = `<div class="cart-line"><span>Subtotal</span><span>${inr(subtotal)}</span></div>
    <div class="cart-line"><span>Shipping</span><span>${inr(SHIPPING_FEE_INR)}</span></div>
    <div class="order-total"><span>Total</span><span>${inr(total)}</span></div>`;
}

async function loadCart() {
  const res = await fetch('/api/products');
  const products = await res.json();
  cart = selectedIds
    .map(id => products.find(p => p.id === id))
    .filter(p => p && p.variants.length)
    .map(p => ({ ...p, ml: p.variants[0].ml, qty: 1 }));
  renderCart();
}

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-remove]');
  if (!btn) return;
  cart.splice(Number(btn.dataset.remove), 1);
  renderCart();
});
document.addEventListener('change', e => {
  if (e.target.dataset.ml !== undefined) { cart[Number(e.target.dataset.ml)].ml = Number(e.target.value); renderCart(); }
  if (e.target.dataset.qty !== undefined) { cart[Number(e.target.dataset.qty)].qty = Math.max(1, Math.min(20, Number(e.target.value) || 1)); renderCart(); }
});

$('#checkout-form').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const errorEl = $('#checkout-error');
  errorEl.hidden = true;
  const turnstileToken = form.querySelector('[name="cf-turnstile-response"]')?.value;
  // Stable idempotency key: survives refreshes/retries of the same checkout attempt but regenerates after success.
  let idempotencyKey = sessionStorage.getItem('checkout-idem');
  if (!idempotencyKey) { idempotencyKey = crypto.randomUUID(); sessionStorage.setItem('checkout-idem', idempotencyKey); }
  const payload = {
    turnstileToken, idempotencyKey,
    customer: {
      name: form.name.value, phone: form.phone.value, email: form.email.value,
      addressLine1: form.address1.value, addressLine2: form.address2.value,
      city: form.city.value, state: form.state.value, pincode: form.pincode.value,
      deliveryInstructions: form.instructions.value,
    },
    items: cart.map(i => ({ productId: i.id, ml: i.ml, qty: i.qty })),
  };
  $('#place-order').disabled = true;
  try {
    const res = await fetch('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not place order');
    localStorage.removeItem(key);
    sessionStorage.removeItem('checkout-idem');
    form.hidden = true;
    $('#cart-items').hidden = true;
    $('#order-summary').hidden = true;
    $('#checkout-result').hidden = false;
    $('#checkout-result').innerHTML = `<h2>Order placed</h2>
      <p>Your order <strong>${esc(data.orderNumber || data.id)}</strong> for ${inr(data.totalInr)} has been received.</p>
      <p>Pay via UPI to complete your order, then submit the payment reference on your tracking page.</p>
      <a class="button dark" href="${data.upiLink}">Pay with UPI ↗</a>
      <p><a href="${esc(data.trackUrl)}">Track your order and submit payment reference →</a></p>
      <p class="muted">Keep this tracking link private — it is the only key to your order.</p>`;
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  } finally {
    $('#place-order').disabled = false;
  }
});

loadCart();
})();
