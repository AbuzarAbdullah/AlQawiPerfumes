(() => {
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inr = n => '₹' + Number(n).toLocaleString('en-IN');
const INTERNAL_STATUSES = ['awaiting_payment', 'payment_verification', 'preparing', 'packing', 'ready_for_dispatch', 'dispatched', 'delivery_in_progress', 'completed', 'cancelled'];

async function api(path, opts) {
  const res = await fetch(path, { headers: { 'content-type': 'application/json' }, credentials: 'same-origin', ...opts });
  if (res.status === 401) { showLogin(); throw new Error('Signed out'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function showLogin() { $('#login-section').hidden = false; $('#admin-body').hidden = true; }
function showAdmin(username) { $('#login-section').hidden = true; $('#admin-body').hidden = false; $('#admin-who').textContent = username || '—'; }

$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('#login-error'); err.hidden = true;
  try {
    const data = await (await fetch('/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: $('#login-username').value, password: $('#login-password').value }) })).json();
    if (!data.ok) throw new Error(data.error || 'Invalid credentials');
    showAdmin(data.username);
    loadOrders(); loadProducts();
  } catch (ex) { err.textContent = ex.message; err.hidden = false; }
});

$('#logout-btn').addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' });
  showLogin();
});

document.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b === btn));
  $('#tab-orders').hidden = btn.dataset.tab !== 'orders';
  $('#tab-products').hidden = btn.dataset.tab !== 'products';
  $('#tab-inventory').hidden = btn.dataset.tab !== 'inventory';
  if (btn.dataset.tab === 'inventory') loadInventory();
}));

async function loadInventory() {
  const rows = await api('/api/admin/inventory');
  $('#inventory-body').innerHTML = rows.map(r => `<tr>
    <td>${esc(r.product_name)}</td>
    <td>${esc(r.collection)}</td>
    <td>${r.ml}ml</td>
    <td><input type="number" min="0" value="${r.qty_available}" data-stock="${r.variant_id}" style="width:80px"></td>
    <td>${r.reserved}</td>
    <td>${r.qty_available - r.reserved}</td>
  </tr>`).join('');
}

document.addEventListener('change', async e => {
  if (!e.target.dataset.stock) return;
  const qty = Math.max(0, Number(e.target.value) || 0);
  try { await api(`/api/admin/inventory/${e.target.dataset.stock}`, { method: 'PATCH', body: JSON.stringify({ qtyAvailable: qty }) }); }
  catch (ex) { alert(ex.message); }
});

async function loadAnalytics() {
  try {
    const r = await api('/api/admin/reports/sales');
    const t = r.totals || {};
    const tile = (label, value) => `<div class="tile"><span>${label}</span><strong>${value}</strong></div>`;
    const low = r.lowStock.length
      ? r.lowStock.map(l => `<li>${esc(l.product_name)} ${l.ml}ml — ${l.qty_available - l.reserved} free</li>`).join('')
      : '<li class="muted">All variants above the low-stock threshold.</li>';
    $('#analytics').innerHTML = `<div class="tiles">
      ${tile('Total orders', t.total_orders || 0)}
      ${tile("Today's orders", r.todayOrders)}
      ${tile('Pending payments', r.pendingPayments)}
      ${tile('Paid orders', t.paid_orders || 0)}
      ${tile('Processing', t.processing_orders || 0)}
      ${tile('Delivered', t.delivered_orders || 0)}
      ${tile('Verified revenue', inr(t.verified_revenue_inr || 0))}
      ${tile('Refunds', inr(t.refunds_inr || 0))}
    </div>
    <details><summary>Low stock (${r.lowStock.length})</summary><ul>${low}</ul></details>`;
  } catch {}
}

async function loadOrders() {
  await loadAnalytics();
  const orders = await api('/api/admin/orders');

  $('#orders-body').innerHTML = orders.map(o => {
    const pay = o.payment_status || 'pending';
    const payActions = pay === 'submitted' || pay === 'pending'
      ? `<button type="button" data-verify="${o.id}">Verify</button> <button type="button" data-reject="${o.id}">Reject</button>`
      : pay === 'paid'
        ? `<small>paid</small> <button type="button" data-refund="${o.id}" data-amt="${o.total_inr}">Refund</button>`
        : `<small>${esc(pay)}</small>`;
    const cancelBtn = o.customer_stage !== 'cancelled' && o.customer_stage !== 'delivered'
      ? ` <button type="button" data-cancel="${o.id}">Cancel</button>` : '';
    return `<tr>
      <td><code>${esc(o.order_number || o.id.slice(0, 8))}</code></td>
      <td>${esc(o.customer_name)}</td>
      <td>${esc(o.phone)}</td>
      <td>${inr(o.total_inr)}</td>
      <td><select data-internal="${o.id}"><option value="">—</option>${INTERNAL_STATUSES.map(s => `<option value="${s}">${s.replace(/_/g, ' ')}</option>`).join('')}</select><br><small>stage: ${esc(o.customer_stage || 'confirmed')}</small></td>
      <td>${payActions}</td>
      <td>${esc(o.created_at)}</td>
      <td><button type="button" data-view="${o.id}">View</button>${cancelBtn}</td>
    </tr><tr id="detail-${o.id}" hidden><td colspan="8"></td></tr>`;
  }).join('');
}

document.addEventListener('click', async e => {
  const v = e.target.closest('[data-verify]');
  const r = e.target.closest('[data-reject]');
  if (v) { try { await api(`/api/admin/orders/${v.dataset.verify}/verify-payment`, { method: 'POST' }); loadOrders(); } catch (ex) { alert(ex.message); } }
  if (r) {
    const reason = prompt('Reject reason (optional):') || '';
    try { await api(`/api/admin/orders/${r.dataset.reject}/reject-payment`, { method: 'POST', body: JSON.stringify({ reason }) }); loadOrders(); } catch (ex) { alert(ex.message); }
  }
  const c = e.target.closest('[data-cancel]');
  if (c) {
    if (!confirm('Cancel this order and release its stock?')) return;
    const reason = prompt('Cancellation reason (optional):') || '';
    try { await api(`/api/admin/orders/${c.dataset.cancel}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }); loadOrders(); } catch (ex) { alert(ex.message); }
  }
  const rf = e.target.closest('[data-refund]');
  if (rf) {
    const amt = prompt(`Refund amount in ₹ (max ${rf.dataset.amt}):`, rf.dataset.amt);
    if (!amt) return;
    const reason = prompt('Refund reason (optional):') || '';
    try { await api('/api/admin/refunds', { method: 'POST', body: JSON.stringify({ orderId: rf.dataset.refund, amountInr: Number(amt), reason }) }); loadOrders(); } catch (ex) { alert(ex.message); }
  }
});

document.addEventListener('change', async e => {
  if (e.target.dataset.internal) {
    const val = e.target.value;
    if (!val) return;
    try { await api(`/api/admin/orders/${e.target.dataset.internal}`, { method: 'PATCH', body: JSON.stringify({ internalStatus: val }) }); loadOrders(); }
    catch (err) { alert(err.message); }
  }
});

document.addEventListener('click', async e => {
  const viewBtn = e.target.closest('[data-view]');
  if (viewBtn) {
    const row = $(`#detail-${viewBtn.dataset.view} td`);
    const detailRow = $(`#detail-${viewBtn.dataset.view}`);
    if (!detailRow.hidden) { detailRow.hidden = true; return; }
    const order = await api(`/api/admin/orders/${viewBtn.dataset.view}`);
    row.innerHTML = `<strong>${esc(order.address_line1)}${order.address_line2 ? ', ' + esc(order.address_line2) : ''}, ${esc(order.city)}, ${esc(order.state)} ${esc(order.pincode)}</strong><br>
      UTR: ${esc(order.utr_reference || '—')}<br>
      ${order.items.map(i => `${esc(i.product_name)} (${i.ml}ml) × ${i.qty} — ${inr(i.line_total_inr)}`).join('<br>')}`;
    detailRow.hidden = false;
  }
});

async function loadProducts() {
  const products = await api('/api/admin/products');
  $('#products-body').innerHTML = products.map(p => p.variants.map((v, i) => `<tr>
      ${i === 0 ? `<td rowspan="${p.variants.length}">${esc(p.name)}<br><small>${esc(p.brand)} — ${esc(p.inspiration)}</small></td>` : ''}
      <td>${v.ml}ml</td>
      <td><input type="number" min="0" value="${v.price_inr ?? ''}" placeholder="not set" data-variant="${v.id}"></td>
      <td><input type="checkbox" ${v.active ? 'checked' : ''} data-variant-active="${v.id}"></td>
      ${i === 0 ? `<td rowspan="${p.variants.length}"><button type="button" data-deactivate="${p.id}">${p.active ? 'Deactivate' : 'Reactivate'}</button></td>` : ''}
    </tr>`).join('')).join('');
}

document.addEventListener('change', async e => {
  if (e.target.dataset.variant) {
    const val = e.target.value === '' ? null : Number(e.target.value);
    try { await api(`/api/admin/variants/${e.target.dataset.variant}`, { method: 'PATCH', body: JSON.stringify({ priceInr: val }) }); }
    catch (err) { alert(err.message); }
  }
  if (e.target.dataset.variantActive) {
    try { await api(`/api/admin/variants/${e.target.dataset.variantActive}`, { method: 'PATCH', body: JSON.stringify({ active: e.target.checked }) }); }
    catch (err) { alert(err.message); }
  }
});

document.addEventListener('click', async e => {
  const btn = e.target.closest('[data-deactivate]');
  if (!btn) return;
  try {
    const products = await api('/api/admin/products');
    const p = products.find(x => x.id === btn.dataset.deactivate);
    await api(`/api/admin/products/${btn.dataset.deactivate}`, { method: 'PATCH', body: JSON.stringify({ active: p.active ? 0 : 1 }) });
    loadProducts();
  } catch (err) { alert(err.message); }
});

$('#add-product-form').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const errorEl = $('#product-error');
  errorEl.hidden = true;
  try {
    await api('/api/admin/products', { method: 'POST', body: JSON.stringify({ id: form.id.value, name: form.name.value, brand: form.brand.value, inspiration: form.inspiration.value, family: form.family.value }) });
    form.reset();
    loadProducts();
  } catch (err) { errorEl.textContent = err.message; errorEl.hidden = false; }
});

// Probe session before loading; the 401 path auto-shows the login panel.
loadOrders().then(() => { showAdmin(''); loadProducts(); }).catch(() => {});
})();
