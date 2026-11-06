(() => {
'use strict';
let catalog=window.PERFUME_CATALOG||[];
const $=s=>document.querySelector(s), key='perfume-selection-v1';
const urlCollection=new URLSearchParams(location.search).get('c'); // 'standard' | 'premium' | null
let selected=[],filter='All',collection=urlCollection==='premium'||urlCollection==='standard'?urlCollection:'all',timer;
try{const saved=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(saved))selected=[...new Set(saved)].filter(id=>catalog.some(p=>p.id===id));}catch{}
const inr=n=>'₹'+Number(n).toLocaleString('en-IN');
const minPrice=p=>Math.min(...p.variants.map(v=>v.priceInr||Infinity));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// shortcut: only 15 hand-designed backgrounds exist (brand.css scene-01..15); cycle them for the 28-item catalog until bespoke art is made per item
const sceneId=id=>String(((parseInt(id,10)-1)%15)+1).padStart(2,'0');
const wa=message=>'https://wa.me/918801470568?text='+encodeURIComponent(message);
const identify=p=>`${p.name} (inspired by ${p.brand} — ${p.inspiration})`;
function notice(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(timer);timer=setTimeout(()=>$('#toast').classList.remove('show'),2600);}
function persist(){try{localStorage.setItem(key,JSON.stringify(selected));}catch{}$('#bag-count').textContent=selected.length;render();}
function add(id){if(!catalog.some(p=>p.id===id))return;if(!selected.includes(id)){selected.push(id);persist();notice('Added to your selection');}else notice('Already in your selection');document.querySelectorAll(`[data-add="${id}"]`).forEach(b=>{b.textContent='Selected ✓';});}
function render(){const query=$('#search').value.trim().toLowerCase();const items=catalog.filter(p=>(collection==='all'||p.collection===collection)&&(filter==='All'||p.family===filter)&&`${p.name} ${p.brand} ${p.inspiration}`.toLowerCase().includes(query));$('#results').textContent=`${items.length} of ${catalog.length} inspirations`;$('#empty').hidden=items.length!==0;$('#products').innerHTML=items.map(p=>{const price=minPrice(p);const priceLabel=price&&price!==Infinity?`From ${inr(price)}`:'Price on enquiry';const col=p.collection==='premium'?'<span class="collection-badge premium">Premium</span>':'<span class="collection-badge standard">Standard</span>';return `<article class="product">${col}<button class="product-image scene scene-${sceneId(p.id)}" data-detail="${p.id}" aria-label="View ${esc(p.name)} inspired by ${esc(p.inspiration)}"><span class="product-number">N° ${esc(p.id)}</span><img src="assets/alqawi-bottle.png" alt="Alqawiperfumes bottle for ${esc(p.name)}" loading="lazy" width="1024" height="1536"><span class="view-label">Discover ↗</span></button><p class="family">${esc(p.family)}</p><h3>${esc(p.name)}</h3><p class="inspiration">Inspired by ${esc(p.brand)}<br>${esc(p.inspiration)}</p><div class="product-bottom"><span>${priceLabel}</span><button class="add" data-add="${p.id}" aria-label="Add ${esc(p.name)} to selection">${selected.includes(p.id)?'Selected ✓':'Select +'}</button></div></article>`}).join('');}
function detail(id){const p=catalog.find(p=>p.id===id);if(!p)return;const sizes=(p.variants&&p.variants.length?p.variants.map(v=>`${v.ml}ml — ${inr(v.priceInr)}`):p.sizes.map(ml=>`${ml}ml`)).join(' · ');$('#product-detail').innerHTML=`<div class="detail-grid"><div class="detail-art scene scene-${sceneId(p.id)}"><img src="assets/alqawi-bottle.png" alt="Alqawiperfumes bottle for ${esc(p.name)}"></div><div><p class="eyebrow">N° ${esc(p.id)} · ${esc(p.collection==='premium'?'Premium':'Standard')} · ${esc(p.family)}</p><h2 id="detail-title">${esc(p.name)}</h2><p>Inspired by <strong>${esc(p.brand)} — ${esc(p.inspiration)}</strong>.</p><p class="sizes">${sizes}</p><p>An independent inspired fragrance. Final blend, concentration, bottle size, price and availability are confirmed on enquiry.</p><p><small>Our signature Alqawiperfumes bottle. An independent inspired fragrance, not an original designer product.</small></p><div class="detail-actions"><button class="button dark" data-add="${p.id}">${selected.includes(id)?'Selected ✓':'Add to my selection +'}</button><a class="button" href="${wa('Hello! I would like to enquire about '+identify(p)+'. Please share the price, sizes, concentration and availability.')}" target="_blank" rel="noopener noreferrer">Enquire on WhatsApp ↗</a></div></div></div>`;$('#product-dialog').setAttribute('aria-labelledby','detail-title');$('#product-dialog').showModal();}
function bag(){const items=catalog.filter(p=>selected.includes(p.id));$('#bag-items').innerHTML=items.length?items.map(p=>`<div class="bag-item"><div><h3>${esc(p.name)}</h3><p>Inspired by ${esc(p.brand)} — ${esc(p.inspiration)}</p></div><button data-remove="${p.id}" aria-label="Remove ${esc(p.name)}">Remove</button></div>`).join('')+'<button id="clear-selection">Clear selection</button>':'<p>Your selection is empty. Explore the collection and add the inspirations you love.</p>';$('#send-selection').hidden=!items.length;$('#checkout-link').hidden=!items.length;$('#send-selection').href=wa('Hello! I’m interested in these fragrances:\n\n'+items.map(p=>'• '+identify(p)).join('\n')+'\n\nPlease share prices, bottle sizes, concentration, availability and delivery options.');}
document.addEventListener('click',e=>{const el=e.target.closest('button');if(!el)return;if(el.dataset.add)add(el.dataset.add);if(el.dataset.detail)detail(el.dataset.detail);if(el.hasAttribute('data-close'))el.closest('dialog').close();if(el.dataset.remove){selected=selected.filter(id=>id!==el.dataset.remove);persist();bag();}if(el.id==='clear-selection'){selected=[];persist();bag();}if(el.dataset.filter){filter=el.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b===el);b.setAttribute('aria-pressed',String(b===el));});render();}});
$('#search').addEventListener('input',render);$('#reset').addEventListener('click',()=>{$('#search').value='';document.querySelector('[data-filter="All"]').click();});$('#bag-open').addEventListener('click',()=>{bag();$('#bag-dialog').showModal();});$('#privacy-open').addEventListener('click',()=>$('#privacy-dialog').showModal());
document.querySelectorAll('dialog').forEach(d=>{d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});});
document.querySelectorAll('[data-whatsapp]').forEach(a=>{a.href=wa('Hello! I would like help choosing a perfume inspiration. Please share your collection details, prices and customisation options.');a.target='_blank';a.rel='noopener noreferrer';});$('#year').textContent=new Date().getFullYear();persist();
if(!(window.CSS&&CSS.supports&&CSS.supports('animation-timeline','view()'))){const heroImg=document.querySelector('.hero-art>img');if(heroImg)new IntersectionObserver(([e])=>{if(e.isIntersecting)heroImg.classList.add('in-view');},{threshold:.3}).observe(heroImg);}

// Inject Standard/Premium collection chips above the family filter.
(() => {
  const filterRow=document.querySelector('.catalog-tools .filters');
  if(!filterRow)return;
  const bar=document.createElement('div');
  bar.className='filters collection-filters';
  bar.setAttribute('role','group');
  bar.setAttribute('aria-label','Filter by collection');
  bar.innerHTML=['all','standard','premium'].map(c=>`<button data-collection="${c}" class="${c===collection?'active':''}" aria-pressed="${c===collection}">${c==='all'?'All collections':c[0].toUpperCase()+c.slice(1)}</button>`).join('');
  filterRow.parentNode.insertBefore(bar,filterRow);
  bar.addEventListener('click',e=>{const b=e.target.closest('[data-collection]');if(!b)return;collection=b.dataset.collection;bar.querySelectorAll('button').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});const u=new URL(location.href);collection==='all'?u.searchParams.delete('c'):u.searchParams.set('c',collection);history.replaceState(null,'',u);render();});
})();

// Prefer live DB catalogue (prices, collection, new entries). Fall back silently to catalog.js.
fetch('/api/products').then(r=>r.ok?r.json():null).then(data=>{
  if(!Array.isArray(data)||!data.length)return;
  catalog=data.map(p=>({...p,sizes:p.variants.map(v=>v.ml)}));
  selected=selected.filter(id=>catalog.some(p=>p.id===id));
  persist();
}).catch(()=>{});
})();
