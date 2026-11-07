(() => {
'use strict';

/* ====== SETTINGS ====== */
const SB_URL = 'https://mxeqgqqaquqqjrxrmsgb.supabase.co/rest/v1/';
const SB_KEY = 'sb_publishable_38_AodqGZlFMYfurCZLZaA_0XAwys_z';
const PW_HASH = '14745ff1ea3ab569b064afd62464be2798baa2141a2c3d690571b69068bb92ed'; // SHA-256 of the admin password
const PAGE = 8;

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ssg = () => { try { return sessionStorage.getItem('dha'); } catch (e) { return null; } };
const sss = v => { try { v ? sessionStorage.setItem('dha', v) : sessionStorage.removeItem('dha'); } catch (e) {} };
const S = { brands: [], cats: [], prods: [], img: null, find: '' };

function toast(msg, type) {
  const d = document.createElement('div'); d.className = 'toast ' + (type || ''); d.textContent = msg;
  $('#toasts').appendChild(d); setTimeout(() => d.remove(), 3400);
}

/* ====== PASSWORD GATE ====== */
async function sha(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
let fails = 0, lockUntil = 0;
function gErr(msg) { $('#gErr').textContent = msg; const b = $('.gbox'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); }
function unlock() { $('#gate').classList.add('hidden'); $('#app').classList.remove('hidden'); start(); }
function lock() { sss(null); location.reload(); }
$('#gForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (Date.now() < lockUntil) return gErr(`Too many attempts. Wait ${Math.ceil((lockUntil - Date.now()) / 1000)}s`);
  let h; try { h = await sha($('#gIn').value); } catch (er) { return gErr('Open this page over https to unlock'); }
  if (h === PW_HASH) { sss(h); unlock(); }
  else { if (++fails >= 5) { lockUntil = Date.now() + 30000; fails = 0; } $('#gIn').value = ''; gErr('Wrong password'); }
});
$('#lock').addEventListener('click', lock);

/* ====== API (read + write, real error reasons) ====== */
async function api(path, method = 'GET', body, ms = 30000) {
  const c = new AbortController(), id = setTimeout(() => c.abort(), ms);
  let r;
  try {
    r = await fetch(SB_URL + path, { method, signal: c.signal, body: body ? JSON.stringify(body) : undefined,
      headers: { apikey: SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' } });
  } catch (e) { const er = new Error(e.name === 'AbortError' ? 'timeout' : 'network'); er.kind = er.message; throw er; }
  finally { clearTimeout(id); }
  const txt = await r.text(); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) {}
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
  if (e.kind === 'network') return 'Cannot reach Supabase. The project is probably paused (open the Supabase dashboard and press Restore), or your connection is down.';
  if (e.kind === 'timeout') return 'The server took too long to answer. Try again.';
  if (e.status === 401 || e.status === 403 || e.code === '42501') return 'Permission denied. Check the API key and the RLS policies.';
  if (e.status === 404 || e.code === 'PGRST205' || e.code === '42P01') return 'Tables not found. Run the SQL setup in Supabase first.';
  return 'Request failed: ' + e.message;
}
function fail(e, quiet) {
  console.error(e);
  const msg = explain(e);
  if (quiet) return toast(msg.slice(0, 140), 'err');
  $('#errMsg').textContent = msg;
  $('#errDet').textContent = [e.kind, e.status, e.code].filter(Boolean).join(' · ');
  $('#err').classList.remove('hidden');
  setConn('bad', 'Offline');
}
function setConn(cls, txt) { const c = $('#conn'); c.className = 'conn ' + cls; c.textContent = txt; }

/* ====== RENDER ====== */
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
function renderProducts() {
  const f = S.find.trim().toLowerCase();
  const list = S.prods.filter(p => !f || p.name.toLowerCase().includes(f) || (S.brands.find(b => b.id === p.brand_id)?.name || '').toLowerCase().includes(f));
  $('#pCount').textContent = `(${S.prods.length})`;
  $('#prodList').innerHTML = list.length ? list.map(p => {
    const b = S.brands.find(x => x.id === p.brand_id), c = S.cats.find(x => x.id === p.category_id);
    return `<div class="prow"><img src="${esc(p.image)}" alt="" loading="lazy">
      <div class="pinfo"><strong>${esc(p.name)}</strong><br><small>${esc(b?.name)} · ${esc(c?.name)} · ${esc(p.price)} QAR</small><br>
      <span class="status ${p.in_stock ? 'in' : 'out'}">${p.in_stock ? 'In stock' : 'Out of stock'}</span></div>
      <div class="acts"><button class="btn sm ghost" data-act="toggle" data-id="${p.id}">${p.in_stock ? 'Mark out of stock' : 'Back in stock'}</button>
      <button class="btn sm danger" data-act="del-prod" data-id="${p.id}">Delete</button></div></div>`;
  }).join('') : '<p class="muted">No products yet.</p>';
}

/* ====== LOAD (products come in small pages) ====== */
async function start() {
  $('#err').classList.add('hidden'); setConn('', 'Connecting…');
  S.prods = [];
  try {
    const [b, c] = await Promise.all([
      retry(() => api('brands?select=*&order=created_at.asc')),
      retry(() => api('categories?select=*&order=created_at.asc'))
    ]);
    S.brands = b; S.cats = c; renderBrands(); setConn('ok', 'Connected');
    for (let off = 0; ; off += PAGE) {
      const rows = await retry(() => api(`products?select=*&order=created_at.desc&limit=${PAGE}&offset=${off}`));
      S.prods.push(...rows); renderProducts();
      if (rows.length < PAGE) break;
    }
  } catch (e) { fail(e, S.brands.length > 0); }
}
$('#errRetry').addEventListener('click', start);

/* ====== IMAGE (file -> compressed data) ====== */
function fileToData(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const M = 800, s = Math.min(1, M / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', .8));
      };
      img.onerror = rej; img.src = fr.result;
    };
    fr.onerror = rej; fr.readAsDataURL(file);
  });
}
async function takeFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  try { S.img = await fileToData(file); } catch (e) { return toast('Could not read this image', 'err'); }
  const pv = $('#pPrev'); pv.src = S.img; pv.classList.remove('hidden'); $('#dropTxt').classList.add('hidden');
}
$('#drop').addEventListener('click', e => { if (e.target.id !== 'pImg') $('#pImg').click(); });
$('#pImg').addEventListener('change', e => takeFile(e.target.files[0]));
$('#drop').addEventListener('dragover', e => { e.preventDefault(); $('#drop').classList.add('over'); });
$('#drop').addEventListener('dragleave', () => $('#drop').classList.remove('over'));
$('#drop').addEventListener('drop', e => { e.preventDefault(); $('#drop').classList.remove('over'); takeFile(e.dataTransfer.files[0]); });

/* ====== ACTIONS ====== */
$('#pBrand').addEventListener('change', fillCats);
$('#pFind').addEventListener('input', e => { S.find = e.target.value; renderProducts(); });

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
  const body = { image: S.img, name: $('#pName').value.trim(), price: Number($('#pPrice').value), description: $('#pDesc').value.trim(), brand_id: $('#pBrand').value, category_id: $('#pCat').value, in_stock: true };
  const btn = $('#pSave'); btn.disabled = true;
  try {
    const [row] = await api('products', 'POST', body); S.prods.unshift(row);
    e.target.reset(); S.img = null; $('#pPrev').classList.add('hidden'); $('#dropTxt').classList.remove('hidden');
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
      await api('products?id=eq.' + id, 'PATCH', { in_stock: !p.in_stock }); p.in_stock = !p.in_stock;
    } else if (act === 'del-prod') {
      if (!confirm('Delete this product?')) return;
      await api('products?id=eq.' + id, 'DELETE'); S.prods = S.prods.filter(x => x.id !== id);
    } else if (act === 'del-cat') {
      if (!confirm('Delete this category and its products?')) return;
      await api('categories?id=eq.' + id, 'DELETE'); S.cats = S.cats.filter(x => x.id !== id); S.prods = S.prods.filter(x => x.category_id !== id);
    } else if (act === 'del-brand') {
      if (!confirm('Delete this brand with all its categories and products?')) return;
      await api('brands?id=eq.' + id, 'DELETE');
      S.brands = S.brands.filter(x => x.id !== id); S.cats = S.cats.filter(x => x.brand_id !== id); S.prods = S.prods.filter(x => x.brand_id !== id);
    }
    renderBrands(); renderProducts(); toast('Done ✓');
  } catch (er) { fail(er, true); }
});

/* ====== INIT ====== */
if (ssg() === PW_HASH) unlock();
})();