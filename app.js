'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const CATS = { top: 'Top', bottom: 'Bottom', layer: 'Layer', shoes: 'Shoes' };
const WARMTH = { light: 1, medium: 2, warm: 3 };
const OCCASION_STYLE = { casual: 'casual', work: 'smart', party: 'smart', gym: 'sport' };

const state = {
  items: [],
  worn: [],
  occasion: 'casual',
  temp: 20,
  rain: null,
  filter: 'all',
  draft: null,
};

/* ---------- small helpers ---------- */

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else el.setAttribute(k, v);
  }
  el.append(...kids);
  return el;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

const newId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2));

/* ---------- storage (IndexedDB, stays on the user's device) ---------- */

let db;
function openDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('stylo', 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('items', { keyPath: 'id' });
      r.result.createObjectStore('worn', { keyPath: 'id' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
const store = (name, mode = 'readonly') => db.transaction(name, mode).objectStore(name);
const wrap = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const getAll = (name) => wrap(store(name).getAll());
const put = (name, v) => wrap(store(name, 'readwrite').put(v));
const remove = (name, id) => wrap(store(name, 'readwrite').delete(id));

/* ---------- photo + colour ---------- */

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}

function shrink(img, max = 520) {
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s);
  c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

const toHex = (r, g, b) =>
  '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

// Looks at the middle of the photo and returns the most common colour.
function dominantColour(canvas) {
  const w = 40, hgt = 40;
  const c = document.createElement('canvas');
  c.width = w; c.height = hgt;
  const ctx = c.getContext('2d');
  ctx.drawImage(canvas, canvas.width * 0.2, canvas.height * 0.2, canvas.width * 0.6, canvas.height * 0.6, 0, 0, w, hgt);
  const d = ctx.getImageData(0, 0, w, hgt).data;
  const buckets = new Map();
  for (let i = 0; i < d.length; i += 4) {
    const key = ((d[i] >> 5) << 6) | ((d[i + 1] >> 5) << 3) | (d[i + 2] >> 5);
    const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    b.n++; b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2];
    buckets.set(key, b);
  }
  let best = null;
  for (const b of buckets.values()) if (!best || b.n > best.n) best = b;
  return toHex(best.r / best.n, best.g / best.n, best.b / best.n);
}

function hsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let hue = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue = (hue * 60 + 360) % 360;
  }
  return { h: hue, s, l };
}

/* ---------- outfit logic ---------- */

const isNeutral = (c) => c.s < 0.18 || c.l < 0.15 || c.l > 0.88;
const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

// Higher is a better match. Neutrals go with everything.
function colourMatch(hexA, hexB) {
  const a = hsl(hexA), b = hsl(hexB);
  if (isNeutral(a) || isNeutral(b)) return 1;
  const gap = hueGap(a.h, b.h);
  if (gap < 35) return 0.8;      // same colour family
  if (gap > 150) return 0.7;     // opposites
  if (a.s < 0.35 || b.s < 0.35) return 0.2; // muted colours clash less
  return -0.8;
}

function daysSinceWorn() {
  const map = new Map();
  const today = new Date(new Date().toDateString());
  for (const w of state.worn) {
    const days = Math.round((today - new Date(w.date + 'T00:00:00')) / 864e5);
    for (const id of w.ids) if (!map.has(id) || days < map.get(id)) map.set(id, days);
  }
  return map;
}

function scoreOutfit(o, ctx) {
  const { top, bottom, layer, shoes } = o;
  const parts = [top, bottom, layer, shoes].filter(Boolean);
  let s = 0;

  for (const p of parts) {
    if (p.style === ctx.style) s += 1;
    else if (ctx.occasion === 'gym' || p.style === 'sport') s -= 2;
    else s -= 0.5;
  }

  const warmth = (WARMTH[top.warmth] + WARMTH[bottom.warmth]) / 2 + (layer ? WARMTH[layer.warmth] * 0.5 : 0);
  s -= Math.abs(warmth - ctx.target) * 1.5;

  s += colourMatch(top.colour, bottom.colour) * 1.5;
  if (layer) s += colourMatch(layer.colour, top.colour) + colourMatch(layer.colour, bottom.colour);
  if (shoes) s += colourMatch(shoes.colour, bottom.colour);

  for (const p of parts) {
    const d = ctx.recent.get(p.id);
    if (d !== undefined && d <= 1) s -= 2;
    else if (d !== undefined && d <= 3) s -= 0.8;
  }
  return s + Math.random() * 0.6;
}

function suggest() {
  const by = (c) => state.items.filter((i) => i.cat === c);
  const tops = by('top'), bottoms = by('bottom'), layers = by('layer'), shoes = by('shoes');
  if (!tops.length || !bottoms.length) return null;

  const t = state.temp;
  const ctx = {
    occasion: state.occasion,
    style: OCCASION_STYLE[state.occasion],
    target: t >= 30 ? 1 : t >= 24 ? 1.5 : t >= 18 ? 2 : t >= 12 ? 2.5 : 3,
    recent: daysSinceWorn(),
  };
  const layerOptions = t < 20 && layers.length ? layers : [null];
  const shoeOptions = shoes.length ? shoes : [null];

  const all = [];
  for (const top of tops)
    for (const bottom of bottoms)
      for (const layer of layerOptions)
        for (const shoe of shoeOptions) {
          const o = { top, bottom, layer, shoes: shoe };
          all.push({ ...o, score: scoreOutfit(o, ctx) });
        }
  all.sort((a, b) => b.score - a.score);

  // Prefer three outfits that don't reuse the same top or bottom.
  const picked = [];
  for (const o of all) {
    if (picked.length === 3) break;
    if (picked.every((p) => p.top.id !== o.top.id && p.bottom.id !== o.bottom.id)) picked.push(o);
  }
  for (const o of all) {
    if (picked.length === 3) break;
    const key = (x) => [x.top.id, x.bottom.id, x.layer?.id, x.shoes?.id].join('|');
    if (!picked.some((p) => key(p) === key(o))) picked.push(o);
  }
  return picked.map((o) => ({ ...o, items: [o.top, o.bottom, o.layer, o.shoes].filter(Boolean), ctx }));
}

function reasonFor(o) {
  const t = state.temp;
  const feel = t >= 30 ? 'Light pieces for the heat' : t >= 22 ? 'Easy pieces for a warm day' : t >= 16 ? 'Balanced for mild weather' : 'Warm enough for the cold';
  const bits = [feel];
  if (o.layer) bits.push('with a layer on top');
  if (colourMatch(o.top.colour, o.bottom.colour) >= 0.7) bits.push('colours that sit well together');
  return bits.join(', ') + '.';
}

/* ---------- rendering ---------- */

function renderWardrobe() {
  const list = state.items
    .filter((i) => state.filter === 'all' || i.cat === state.filter)
    .sort((a, b) => b.added - a.added);
  const grid = $('#grid');
  grid.replaceChildren();
  for (const it of list) {
    const del = h('button', { class: 'remove', type: 'button', 'aria-label': `Remove ${CATS[it.cat].toLowerCase()}` }, 'Remove');
    del.addEventListener('click', async () => {
      if (!confirm('Remove this item from your wardrobe?')) return;
      await remove('items', it.id);
      state.items = state.items.filter((x) => x.id !== it.id);
      renderWardrobe();
    });
    const dot = h('span', { class: 'dot' });
    dot.style.background = it.colour;
    grid.append(
      h('article', { class: 'item' },
        h('img', { src: it.photo, alt: CATS[it.cat], loading: 'lazy' }),
        h('div', { class: 'meta' }, dot, CATS[it.cat], del))
    );
  }
  $('#empty').hidden = list.length > 0;
  $('#count').textContent = state.items.length ? `(${state.items.length})` : '';
}

function renderOutfits(list) {
  const box = $('#results');
  box.replaceChildren();

  if (!list) {
    box.append(
      h('p', { class: 'empty stitch' },
        'Add at least one top and one bottom in the Wardrobe tab, and Stylo can suggest outfits.')
    );
    return;
  }

  list.forEach((o, i) => {
    const pieces = h('div', { class: 'pieces' });
    for (const it of o.items) {
      pieces.append(h('figure', {}, h('img', { src: it.photo, alt: CATS[it.cat] }), h('figcaption', {}, CATS[it.cat])));
    }
    const btn = h('button', { class: 'btn primary', type: 'button' }, 'Wear this today');
    btn.addEventListener('click', async () => {
      const today = new Date();
      const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const entry = { id: newId(), date, ids: o.items.map((x) => x.id) };
      await put('worn', entry);
      state.worn.push(entry);
      btn.textContent = 'Saved for today';
      btn.disabled = true;
      toast("Saved. Stylo will vary tomorrow's picks.");
    });
    box.append(
      h('article', { class: 'outfit stitch' },
        h('h3', {}, `Outfit ${i + 1}`),
        h('p', { class: 'why' }, reasonFor(o)),
        pieces, btn)
    );
  });
}

/* ---------- weather ---------- */

function useLocation() {
  const note = $('#weather-note');
  if (!navigator.geolocation) { note.textContent = 'Location is not available. Pick the weather from the list.'; return; }
  note.textContent = 'Checking the weather...';
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        const { latitude, longitude } = pos.coords;
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
          '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1';
        const res = await fetch(url);
        if (!res.ok) throw new Error('bad response');
        const j = await res.json();
        const max = j.daily.temperature_2m_max[0], min = j.daily.temperature_2m_min[0];
        state.temp = Math.round(max * 0.6 + min * 0.4);
        state.rain = j.daily.precipitation_probability_max[0];

        const sel = $('#weather');
        $$('option[data-live]', sel).forEach((o) => o.remove());
        const opt = h('option', { value: String(state.temp), 'data-live': '1' }, `Today near you, ${state.temp}°C`);
        sel.prepend(opt);
        sel.value = String(state.temp);
        note.textContent = state.rain >= 50 ? `Rain is likely (${state.rain}%). Take an umbrella.` : 'Weather updated for your location.';
      } catch {
        note.textContent = 'Could not get the weather. Pick it from the list instead.';
      }
    },
    () => { note.textContent = 'Could not get your location. Pick the weather from the list instead.'; },
    { timeout: 10000 }
  );
}

/* ---------- add-clothes dialog ---------- */

function resetForm() {
  $('#form').reset();
  state.draft = null;
  $('#preview').hidden = true;
  $('#preview').removeAttribute('src');
  $('#photo-hint').hidden = false;
  $('#colour').value = '#808080';
}

async function onPhoto(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const img = await loadImage(file);
    const canvas = shrink(img);
    state.draft = { photo: canvas.toDataURL('image/jpeg', 0.8) };
    $('#colour').value = dominantColour(canvas);
    $('#preview').src = state.draft.photo;
    $('#preview').hidden = false;
    $('#photo-hint').hidden = true;
  } catch {
    toast('That photo could not be read. Try another one.');
  }
}

async function saveItem() {
  if (!state.draft) { toast('Add a photo first.'); return false; }
  const item = {
    id: newId(),
    cat: $('#cat').value,
    style: $('#style').value,
    warmth: $('#warmth').value,
    colour: $('#colour').value,
    photo: state.draft.photo,
    added: Date.now(),
  };
  try {
    await put('items', item);
  } catch {
    toast('Could not save. Your browser may be out of storage.');
    return false;
  }
  state.items.push(item);
  renderWardrobe();
  toast('Added to your wardrobe.');
  return true;
}

/* ---------- wiring ---------- */

function bind() {
  $$('.tabs button').forEach((b) =>
    b.addEventListener('click', () => {
      $$('.tabs button').forEach((x) => x.removeAttribute('aria-current'));
      b.setAttribute('aria-current', 'page');
      $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + b.dataset.view));
      window.scrollTo(0, 0);
    })
  );

  $$('#occasion button').forEach((b) =>
    b.addEventListener('click', () => {
      state.occasion = b.dataset.value;
      $$('#occasion button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    })
  );

  $('#weather').addEventListener('change', (e) => { state.temp = Number(e.target.value); });
  $('#locate').addEventListener('click', useLocation);
  $('#suggest').addEventListener('click', () => renderOutfits(suggest()));

  $$('#filters button').forEach((b) =>
    b.addEventListener('click', () => {
      state.filter = b.dataset.value;
      $$('#filters button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      renderWardrobe();
    })
  );

  const dlg = $('#dlg');
  $('#add').addEventListener('click', () => { resetForm(); dlg.showModal(); });
  $('#cancel').addEventListener('click', () => dlg.close());
  $('#photo').addEventListener('change', onPhoto);
  $('#form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await saveItem()) dlg.close();
  });
  $('#save-more').addEventListener('click', async () => {
    if (await saveItem()) resetForm();
  });
}

async function init() {
  bind();
  try {
    db = await openDB();
    state.items = await getAll('items');
    state.worn = await getAll('worn');
  } catch {
    toast('Saving is not available in this browser mode. Try a normal tab.');
  }
  renderWardrobe();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();
