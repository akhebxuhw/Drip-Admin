(() => {
'use strict';

/* ====== SETTINGS ====== */
const SB_URL = 'https://mxeqgqqaquqqjrxrmsgb.supabase.co/rest/v1/';
const SB_KEY = 'sb_publishable_38_AodqGZlFMYfurCZLZaA_0XAwys_z';
const AUTH = SB_URL.replace('/rest/v1/', '/auth/v1/');
const PAGE = 20, OPAGE = 50, SHOW = 30;
const COLS = 'id,name,price,old_price,description,brand_id,category_id,in_stock,sizes,thumb,created_at';
const TRACK_URL = n => 'https://www.aramex.com/track/results?ShipmentNumber=' + encodeURIComponent(n);
const SHOES = Array.from({ length: 12 }, (_, i) => String(36 + i));      // 36 ... 47
const CLOTHES = ['S', 'M', 'L', 'XL', '2XL', '3XL'];
const PRESET = { shoes: SHOES.join(', '), clothes: CLOTHES.join(', '), '': '' };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const digits = s => String(s || '').replace(/\D/g, '');
const num = x => Number(x || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const S = { brands: [], cats: [], prods: [], orders: [], img: null, thumb: null, shown: SHOW, find: '', view: 'dash', otab: 'pending', ed: new Set(), pendingIds: null };

function toast(msg, type) {
  const d = document.createElement('div'); d.className = 'toast ' + (type || ''); d.textContent = msg;
  $('#toasts').appendChild(d); setTimeout(() => d.remove(), 3400);
}

/* ====== SESSION (Supabase Auth) ====== */
let sess = null;
try { sess = JSON.parse(sessionStorage.getItem('dha3') || 'null'); } catch (e) {}
function saveSess(j) {
  sess = j ? { access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000 } : null;
  try { sess ? sessionStorage.setItem('dha3', JSON.stringify(sess)) : sessionStorage.removeItem('dha3'); } catch (e) {}
}
async function authCall(grant, body) {
  const r = await fetch(AUTH + 'token?grant_type=' + grant, { method: 'POST', headers: { apikey: SB_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const er = new Error(j.error_description || j.msg || j.message || 'Sign in failed'); er.status = r.status; throw er; }
  return j;
}
async function refreshSess() {
  if (!sess || !sess.refresh) throw new Error('no session');
  saveSess(await authCall('refresh_token', { refresh_token: sess.refresh }));
}
async function ensureToken() { if (sess && Date.now() > sess.exp - 60000) await refreshSess(); }

let fails = 0, lockUntil = 0;
function gErr(msg) { $('#gErr').textContent = msg; const b = $('.gbox'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); }
function showApp() { $('#gate').classList.add('hidden'); $('#app').classList.remove('hidden'); start(); }
function signOut() { saveSess(null); location.reload(); }
$('#gForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (Date.now() < lockUntil) return gErr(`Too many attempts. Wait ${Math.ceil((lockUntil - Date.now()) / 1000)}s`);
  const btn = $('#gGo'); btn.disabled = true;
  try {
    saveSess(await authCall('password', { email: $('#gEmail').value.trim(), password: $('#gIn').value }));
    $('#gIn').value = ''; $('#gErr').textContent = ''; showApp();
  } catch (er) {
    if (++fails >= 5) { lockUntil = Date.now() + 30000; fails = 0; }
    $('#gIn').value = '';
    gErr(er.status === 400 || er.status === 401 ? 'Wrong email or password' : (er.message === 'Failed to fetch' ? 'Cannot reach Supabase (project paused or offline)' : er.message));
  } finally { btn.disabled = false; }
});
$('#lock').addEventListener('click', signOut);

/* ====== API (signed-in requests) ====== */
async function api(path, method = 'GET', body, again) {
  try { await ensureToken(); } catch (e) { saveSess(null); $('#app').classList.add('hidden'); $('#gate').classList.remove('hidden'); gErr('Session expired. Sign in again.'); const er = new Error('session'); er.kind = 'session'; throw er; }
  const c = new AbortController(), id = setTimeout(() => c.abort(), 30000);
  const headers = { apikey: SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  if (sess) headers.Authorization = 'Bearer ' + sess.access;
  let r;
  try { r = await fetch(SB_URL + path, { method, headers, signal: c.signal, body: body ? JSON.stringify(body) : undefined }); }
  catch (e) { const er = new Error(e.name === 'AbortError' ? 'timeout' : 'network'); er.kind = er.message; throw er; }
  finally { clearTimeout(id); }
  const txt = await r.text(); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) {}
  if (r.status === 401 && !again) { try { await refreshSess(); return api(path, method, body, true); } catch (e) {} }
  if (!r.ok) { const er = new Error((j && (j.message || j.hint)) || txt.slice(0, 160) || ('HTTP ' + r.status)); er.kind = 'http'; er.status = r.status; er.code = j && j.code; throw er; }
  return j;
}
async function retry(fn, n = 3) {
  for (let i = 1; ; i++) {
    try { return await fn(); }
    catch (e) { const tr = e.kind === 'network' || e.kind === 'timeout' || e.status >= 500; if (!tr || i >= n) throw e; await sleep(1200 * i); }
  }
}
function explain(e) {
  if (e.kind === 'session') return 'Session expired. Sign in again.';
  if (e.kind === 'network') return 'Cannot reach Supabase. The project is probably paused (open the Supabase dashboard and press Restore), or your connection is down.';
  if (e.kind === 'timeout') return 'The server took too long to answer. Try again.';
  if (e.status === 401 || e.status === 403 || e.code === '42501') return 'Permission denied. Make sure the SQL setup was run and you are signed in.';
  if (e.status === 404 || e.code === 'PGRST205' || e.code === '42P01') return 'A table was not found. Run the SQL setup in Supabase first.';
  if (e.code === '42703' || /column/.test(e.message)) return 'A column is missing. Run the new SQL setup (sizes / old_price / orders) in Supabase.';
  return 'Request failed: ' + e.message;
}
function fail(e, quiet) {
  console.error(e);
  if (e.kind === 'session') return;
  const msg = explain(e);
  if (quiet) return toast(msg.slice(0, 160), 'err');
  $('#errMsg').textContent = msg;
  $('#errDet').textContent = [e.kind, e.status, e.code].filter(Boolean).join(' · ');
  $('#err').classList.remove('hidden');
  setConn('bad', 'Offline');
}
function setConn(cls, txt) { const c = $('#conn'); c.className = 'conn ' + cls; c.textContent = txt; }

/* ====== SIZES (free text: "38, 39, 43") ====== */
const AR_DIG = { '٠': 0, '١': 1, '٢': 2, '٣': 3, '٤': 4, '٥': 5, '٦': 6, '٧': 7, '٨': 8, '٩': 9 };
function parseSizes(str) {
  const out = [];
  String(str || '').replace(/[٠-٩]/g, d => AR_DIG[d]).split(/[,،;\/\s]+/).forEach(x => {
    x = x.trim().toUpperCase(); if (!x) return;
    if (x === 'XXL') x = '2XL'; if (x === 'XXXL') x = '3XL';
    if (!out.includes(x)) out.push(x);
  });
  const rank = x => CLOTHES.indexOf(x);
  return out.sort((a, b) => {
    const na = /^\d+(\.\d+)?$/.test(a), nb = /^\d+(\.\d+)?$/.test(b);
    if (na && nb) return a - b;
    if (na !== nb) return na ? -1 : 1;
    const ra = rank(a), rb = rank(b);
    if (ra >= 0 && rb >= 0) return ra - rb;
    return ra >= 0 ? -1 : rb >= 0 ? 1 : a.localeCompare(b);
  });
}
const prevHtml = list => list.map(s => `<span class="sz on">${esc(s)}</span>`).join('');
$('#pSizesIn').addEventListener('input', () => { $('#pSizesPrev').innerHTML = prevHtml(parseSizes($('#pSizesIn').value)); });
document.addEventListener('click', e => {
  const b = e.target.closest('[data-fill]'); if (!b) return;
  const input = b.closest('.ed') ? $('.edSizes', b.closest('.ed')) : $('#pSizesIn');
  input.value = PRESET[b.dataset.fill]; input.dispatchEvent(new Event('input'));
});

/* ====== RENDER: dashboard ====== */
function renderBrands() {
  $('#brandList').innerHTML = S.brands.length ? S.brands.map(b => {
    const cs = S.cats.filter(c => c.brand_id === b.id);
    return `<div class="bitem"><div class="bhead"><strong>${esc(b.name)}</strong><button class="btn sm danger" data-act="del-brand" data-id="${b.id}">Delete</button></div>
      <div class="mini">${cs.map(c => `<span class="tag">${esc(c.name)}<button data-act="del-cat" data-id="${c.id}" aria-label="remove">✕</button></span>`).join('') || '<em>No categories yet</em>'}</div>
      <form class="row catForm" data-brand="${b.id}"><input placeholder="Add category (Clothes, Shoes, Caps...)" required><button class="btn sm">Add</button></form></div>`;
  }).join('') : '<p class="muted">No brands yet. Add your first one above.</p>';
  fillSelects();
}
function fillSelects() {
  const pb = $('#pBrand'), cur = pb.value;
  pb.innerHTML = S.brands.length ? S.brands.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('') : '<option value="">Add a brand first</option>';
  if (S.brands.some(b => b.id === cur)) pb.value = cur;
  fillCats();
}
function fillCats() {
  const pc = $('#pCat'), cur = pc.value, cs = S.cats.filter(c => c.brand_id === $('#pBrand').value);
  pc.innerHTML = cs.length ? cs.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('') : '<option value="">Add a category to this brand first</option>';
  if (cs.some(c => c.id === cur)) pc.value = cur;
}
function editorHtml(p) {
  const sz = Array.isArray(p.sizes) ? p.sizes.join(', ') : '';
  return `<div class="ed" data-id="${p.id}">
    <div class="two">
      <div><label class="lbl">Price before discount</label><input class="edOld" type="number" step="0.01" min="0" value="${p.old_price ? esc(p.old_price) : ''}" placeholder="optional"></div>
      <div><label class="lbl">Price after discount (final)</label><input class="edPrice" type="number" step="0.01" min="0" value="${esc(p.price)}"></div>
    </div>
    <label class="lbl">Sizes (comma separated)</label>
    <input class="edSizes" value="${esc(sz)}" placeholder="38, 39, 43   or   S, M, L">
    <div class="szrow"><button type="button" class="sz" data-fill="shoes">Shoes 36–47</button><button type="button" class="sz" data-fill="clothes">Clothes S–3XL</button><button type="button" class="sz" data-fill="">Clear</button></div>
    <div class="szrow prev edPrev">${prevHtml(Array.isArray(p.sizes) ? p.sizes : [])}</div>
    <button class="btn sm" data-act="save-edit" data-id="${p.id}">Save changes</button></div>`;
}
document.addEventListener('input', e => { const i = e.target.closest('.edSizes'); if (i) $('.edPrev', i.closest('.ed')).innerHTML = prevHtml(parseSizes(i.value)); });
function renderProducts() {
  const f = S.find.trim().toLowerCase();
  const list = S.prods.filter(p => !f || p.name.toLowerCase().includes(f) || (S.brands.find(b => b.id === p.brand_id)?.name || '').toLowerCase().includes(f));
  $('#pCount').textContent = `(${S.prods.length})`;
  const vis = list.slice(0, S.shown);
  $('#prodList').innerHTML = list.length ? vis.map(p => {
    const b = S.brands.find(x => x.id === p.brand_id), c = S.cats.find(x => x.id === p.category_id);
    const sizes = Array.isArray(p.sizes) && p.sizes.length ? p.sizes.join(' · ') : 'No sizes';
    return `<div class="prow"><img src="${esc(p.thumb || '')}" alt="" loading="lazy" decoding="async">
      <div class="pinfo"><strong>${esc(p.name)}</strong><br><small>${esc(b?.name)} · ${esc(c?.name)} · ${p.old_price && Number(p.old_price) > Number(p.price) ? `<s>${esc(p.old_price)}</s> ` : ''}<b>${esc(p.price)} QAR</b></small><br>
      <small class="szl">Sizes: ${esc(sizes)}</small><br>
      <span class="status ${p.in_stock ? 'in' : 'out'}">${p.in_stock ? 'In stock' : 'Out of stock'}</span></div>
      <div class="acts"><button class="btn sm ghost" data-act="sizes" data-id="${p.id}">Edit</button>
      <button class="btn sm ghost" data-act="toggle" data-id="${p.id}">${p.in_stock ? 'Mark out of stock' : 'Back in stock'}</button>
      <button class="btn sm danger" data-act="del-prod" data-id="${p.id}">Delete</button></div>
      ${S.ed.has(p.id) ? editorHtml(p) : ''}</div>`;
  }).join('') + (list.length > S.shown ? `<button class="btn sm ghost more" data-act="more">Show more (${list.length - S.shown})</button>` : '') : '<p class="muted">No products yet.</p>';
}

/* ====== RENDER: orders ====== */
function orderCard(o) {
  const items = (Array.isArray(o.items) ? o.items : []).map(it => `<div class="oit"><span>${esc(it.qty)}× ${esc(it.name)}${it.size ? ` <b class="sizetag">${esc(it.size)}</b>` : ''}</span><span>${num(it.price_qar * it.qty)} QAR</span></div>`).join('');
  const done = o.status === 'done';
  const wa = digits(o.phone) ? `https://wa.me/${digits(o.phone)}` : '';
  return `<article class="ocard ${done ? 'isdone' : ''}" data-id="${o.id}">
    <div class="ohead">
      <button class="chk ${done ? 'on' : ''}" data-act="${done ? 'ord-undo' : 'ord-done'}" data-id="${o.id}" aria-label="${done ? 'Move back' : 'Mark delivered'}" title="${done ? 'Move back to not delivered' : 'Mark as delivered'}">✓</button>
      <div class="otitle"><strong>${esc(o.order_no)}</strong><small>${esc(new Date(o.created_at).toLocaleString())}</small></div>
      <div class="ototal"><b>${num(o.total_qar)} QAR</b>${o.display_total ? `<small>${esc(o.display_total)}</small>` : ''}</div>
    </div>
    <div class="obody">
      <div class="ocust"><b>${esc(o.customer_name)}</b>
        <a href="tel:${esc(o.phone)}">${esc(o.phone)}</a>${wa ? ` · <a href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        <div class="oaddr">${esc(o.country || '')}${o.city ? ' · ' + esc(o.city) : ''}<br>${esc(o.address)}</div>
        ${o.notes ? `<div class="onote">Note: ${esc(o.notes)}</div>` : ''}</div>
      <div class="oitems">${items}
        <div class="oit sm"><span>Delivery</span><span>${num(o.delivery_qar)} QAR</span></div></div>
      <div class="otrack"><input class="trin" placeholder="Aramex tracking number" value="${esc(o.tracking || '')}">
        <button class="btn sm" data-act="ord-track" data-id="${o.id}">Save</button>
        ${o.tracking ? `<a class="btn sm ghost" href="${TRACK_URL(o.tracking)}" target="_blank" rel="noopener">Track</a>` : ''}</div>
      <div class="oact"><button class="btn sm danger" data-act="ord-del" data-id="${o.id}">Delete</button></div>
    </div></article>`;
}
function renderOrders() {
  const pend = S.orders.filter(o => o.status !== 'done'), done = S.orders.filter(o => o.status === 'done');
  $('#oTabP').textContent = `Not delivered (${pend.length})`;
  $('#oTabD').textContent = `Completed (${done.length})`;
  $('#oTabP').classList.toggle('on', S.otab === 'pending'); $('#oTabD').classList.toggle('on', S.otab === 'done');
  const bd = $('#ordBadge'); bd.textContent = pend.length; bd.classList.toggle('hidden', pend.length === 0);
  const list = S.otab === 'done' ? done : pend;
  $('#ordList').innerHTML = list.length ? list.map(orderCard).join('') : `<p class="muted">${S.otab === 'done' ? 'No completed orders yet.' : 'No pending orders. 🎉'}</p>`;
}
async function loadOrders(silent) {
  try {
    const all = [];
    for (let off = 0; ; off += OPAGE) {
      const rows = await retry(() => api(`orders?select=*&order=created_at.desc&limit=${OPAGE}&offset=${off}`));
      all.push(...rows); if (rows.length < OPAGE) break;
    }
    const ids = new Set(all.filter(o => o.status !== 'done').map(o => o.id));
    if (silent && S.pendingIds) { const fresh = [...ids].filter(i => !S.pendingIds.has(i)).length; if (fresh) toast(`🔔 ${fresh} new order${fresh > 1 ? 's' : ''}`); }
    S.pendingIds = ids; S.orders = all;
    const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest('#ordList');
    if (!(silent && typing)) renderOrders(); else { $('#ordBadge').textContent = ids.size; }
  } catch (e) { fail(e, silent || S.brands.length > 0); }
}

/* ====== TABS ====== */
function setView(v) {
  S.view = v;
  $('#vDash').classList.toggle('hidden', v !== 'dash'); $('#vOrd').classList.toggle('hidden', v !== 'ord');
  $$('.tab').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  if (v === 'ord') loadOrders();
}
$$('.tab').forEach(b => b.addEventListener('click', () => setView(b.dataset.v)));
$$('.stab').forEach(b => b.addEventListener('click', () => { S.otab = b.dataset.t; renderOrders(); }));
$('#ordRefresh').addEventListener('click', () => loadOrders());
setInterval(() => { if (sess && !$('#app').classList.contains('hidden') && !document.hidden) loadOrders(true); }, 60000);

/* ====== LOAD ====== */
async function start() {
  $('#err').classList.add('hidden'); setConn('', 'Connecting…');
  S.prods = [];
  try {
    const [b, c] = await Promise.all([
      retry(() => api('brands?select=*&order=created_at.asc')),
      retry(() => api('categories?select=*&order=created_at.asc'))
    ]);
    S.brands = b; S.cats = c; renderBrands(); setConn('ok', 'Connected');
    loadOrders(true);
    for (let off = 0; ; off += PAGE) {
      const rows = await retry(() => api(`products?select=${COLS}&order=created_at.desc&limit=${PAGE}&offset=${off}`));
      S.prods.push(...rows); renderProducts();
      if (rows.length < PAGE) break;
    }
  } catch (e) { fail(e, S.brands.length > 0); }
}
$('#errRetry').addEventListener('click', start);

/* ====== IMAGE (file -> compressed data) ====== */
function shrink(img, M, q) {
  const k = Math.min(1, M / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
const readFile = f => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(f); });
async function takeFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  try { const img = await loadImg(await readFile(file)); S.img = shrink(img, 800, .8); S.thumb = shrink(img, 420, .72); }
  catch (e) { return toast('Could not read this image', 'err'); }
  const pv = $('#pPrev'); pv.src = S.thumb; pv.classList.remove('hidden'); $('#dropTxt').classList.add('hidden');
}
// one-time: build small thumbnails for products added before thumbnails existed
async function optimizeImages() {
  const btn = $('#optImg'), todo = S.prods.filter(p => !p.thumb);
  if (!todo.length) return toast('All images are already optimized ✓');
  btn.disabled = true; let n = 0;
  for (const p of todo) {
    try {
      const r = await api(`products?id=eq.${p.id}&select=image`);
      const th = shrink(await loadImg(r[0].image), 420, .72);
      await api(`products?id=eq.${p.id}&select=id`, 'PATCH', { thumb: th });
      p.thumb = th; n++; btn.textContent = `Optimizing ${n}/${todo.length}`;
      if (n % 4 === 0) renderProducts();
    } catch (e) { console.error(e); }
  }
  btn.disabled = false; btn.textContent = 'Optimize images'; renderProducts();
  toast(n === todo.length ? `Done ✓ ${n} images optimized` : `Optimized ${n} of ${todo.length}`, n === todo.length ? '' : 'err');
}
$('#optImg').addEventListener('click', optimizeImages);
$('#drop').addEventListener('click', e => { if (e.target.id !== 'pImg') $('#pImg').click(); });
$('#pImg').addEventListener('change', e => takeFile(e.target.files[0]));
$('#drop').addEventListener('dragover', e => { e.preventDefault(); $('#drop').classList.add('over'); });
$('#drop').addEventListener('dragleave', () => $('#drop').classList.remove('over'));
$('#drop').addEventListener('drop', e => { e.preventDefault(); $('#drop').classList.remove('over'); takeFile(e.dataTransfer.files[0]); });

/* ====== ACTIONS ====== */
$('#pBrand').addEventListener('change', fillCats);
$('#pFind').addEventListener('input', e => { S.find = e.target.value; S.shown = SHOW; renderProducts(); });

$('#brandForm').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('#brandName').value.trim(); if (!name) return;
  try { const [row] = await api('brands', 'POST', { name }); S.brands.push(row); $('#brandName').value = ''; renderBrands(); toast('Brand added ✓'); }
  catch (er) { fail(er, true); }
});
$('#brandList').addEventListener('submit', async e => {
  const f = e.target.closest('.catForm'); if (!f) return;
  e.preventDefault();
  const name = $('input', f).value.trim(); if (!name) return;
  try { const [row] = await api('categories', 'POST', { brand_id: f.dataset.brand, name }); S.cats.push(row); renderBrands(); toast('Category added ✓'); }
  catch (er) { fail(er, true); }
});
$('#prodForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!S.img) return toast('Please choose a product image', 'err');
  if (!$('#pBrand').value || !$('#pCat').value) return toast('Choose a brand and a category', 'err');
  const sizes = parseSizes($('#pSizesIn').value);
  const price = Number($('#pPrice').value), old = $('#pOld').value === '' ? null : Number($('#pOld').value);
  if (old !== null && old <= price) return toast('Price before discount must be higher than the final price (or leave it empty)', 'err');
  const body = { image: S.img, thumb: S.thumb, name: $('#pName').value.trim(), price, old_price: old, description: $('#pDesc').value.trim(), brand_id: $('#pBrand').value, category_id: $('#pCat').value, in_stock: true, sizes };
  const btn = $('#pSave'); btn.disabled = true;
  try {
    const [row] = await api('products?select=' + COLS, 'POST', body); S.prods.unshift(row);
    e.target.reset(); S.img = null; S.thumb = null; $('#pSizesPrev').innerHTML = '';
    $('#pPrev').classList.add('hidden'); $('#dropTxt').classList.remove('hidden');
    renderBrands(); renderProducts(); toast('Product added ✓');
  } catch (er) { fail(er, true); }
  finally { btn.disabled = false; }
});

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const id = b.dataset.id, act = b.dataset.act;
  try {
    if (act === 'toggle') {
      const p = S.prods.find(x => x.id === id);
      await api('products?id=eq.' + id + '&select=id', 'PATCH', { in_stock: !p.in_stock }); p.in_stock = !p.in_stock;
    } else if (act === 'more') {
      S.shown += SHOW; renderProducts(); return;
    } else if (act === 'sizes') {
      S.ed.has(id) ? S.ed.delete(id) : S.ed.add(id); renderProducts(); return;
    } else if (act === 'save-edit') {
      const ed = b.closest('.ed');
      const price = Number($('.edPrice', ed).value), old = $('.edOld', ed).value === '' ? null : Number($('.edOld', ed).value);
      if (!(price >= 0) || $('.edPrice', ed).value === '') return toast('Enter the final price', 'err');
      if (old !== null && old <= price) return toast('Price before discount must be higher than the final price', 'err');
      const sizes = parseSizes($('.edSizes', ed).value);
      const [row] = await api('products?id=eq.' + id + '&select=id,price,old_price,sizes', 'PATCH', { price, old_price: old, sizes });
      const p = S.prods.find(x => x.id === id); if (p && row) Object.assign(p, { price: row.price, old_price: row.old_price, sizes: row.sizes });
      S.ed.delete(id); renderProducts(); toast('Saved ✓'); return;
    } else if (act === 'del-prod') {
      if (!confirm('Delete this product?')) return;
      await api('products?id=eq.' + id + '&select=id', 'DELETE'); S.prods = S.prods.filter(x => x.id !== id);
    } else if (act === 'del-cat') {
      if (!confirm('Delete this category and its products?')) return;
      await api('categories?id=eq.' + id, 'DELETE'); S.cats = S.cats.filter(x => x.id !== id); S.prods = S.prods.filter(x => x.category_id !== id);
    } else if (act === 'del-brand') {
      if (!confirm('Delete this brand with all its categories and products?')) return;
      await api('brands?id=eq.' + id, 'DELETE');
      S.brands = S.brands.filter(x => x.id !== id); S.cats = S.cats.filter(x => x.brand_id !== id); S.prods = S.prods.filter(x => x.brand_id !== id);
    } else if (act === 'ord-done' || act === 'ord-undo') {
      const status = act === 'ord-done' ? 'done' : 'pending';
      await api('orders?id=eq.' + id, 'PATCH', { status });
      const o = S.orders.find(x => x.id === id); if (o) o.status = status;
      S.pendingIds = new Set(S.orders.filter(x => x.status !== 'done').map(x => x.id));
      renderOrders(); toast(status === 'done' ? 'Moved to Completed ✓' : 'Moved back to Not delivered'); return;
    } else if (act === 'ord-track') {
      const v = $('.trin', b.closest('.ocard')).value.trim();
      const [row] = await api('orders?id=eq.' + id, 'PATCH', { tracking: v || null });
      const o = S.orders.find(x => x.id === id); if (o && row) o.tracking = row.tracking;
      renderOrders(); toast('Tracking saved ✓'); return;
    } else if (act === 'ord-del') {
      if (!confirm('Delete this order permanently?')) return;
      await api('orders?id=eq.' + id, 'DELETE'); S.orders = S.orders.filter(x => x.id !== id);
      S.pendingIds = new Set(S.orders.filter(x => x.status !== 'done').map(x => x.id));
      renderOrders(); toast('Order deleted'); return;
    }
    renderBrands(); renderProducts(); toast('Done ✓');
  } catch (er) { fail(er, true); }
});

/* ====== INIT ====== */
if (sess) showApp();
})();
