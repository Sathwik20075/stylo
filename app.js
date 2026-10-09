'use strict';

const E = window.StyloEngine;
const { TYPES, STYLE_LABEL } = E;

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const state = {
  items: [],
  worn: [],
  profile: { id: 'profile', depth: '', undertone: '' },
  counters: { id: 'counters' },
  occasion: 'casual',
  temp: 20,
  rain: null,
  filter: 'all',
  draftPhoto: null,
  editingId: null,
  expanded: {},
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
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

const newId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2));

const lower = (s) => (s || '').toLowerCase();
const itemLabel = (i) => `${E.colourName(i.colour)} ${lower(i.kind)}`;

/* ---------- storage (IndexedDB, stays on the user's device) ---------- */

let db;
function openDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('stylo', 2);
    r.onupgradeneeded = () => {
      for (const name of ['items', 'worn', 'meta']) {
        if (!r.result.objectStoreNames.contains(name)) r.result.createObjectStore(name, { keyPath: 'id' });
      }
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
const store = (name, mode = 'readonly') => db.transaction(name, mode).objectStore(name);
const wrap = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const getAll = (name) => wrap(store(name).getAll());
const getOne = (name, id) => wrap(store(name).get(id));
const put = (name, v) => wrap(store(name, 'readwrite').put(v));
const remove = (name, id) => wrap(store(name, 'readwrite').delete(id));

// IDs like SH01 are never reused, even after an item is removed.
async function nextCode(type) {
  const prefix = TYPES[type].code;
  state.counters[prefix] = (state.counters[prefix] || 0) + 1;
  await put('meta', state.counters);
  return prefix + String(state.counters[prefix]).padStart(2, '0');
}

// Brings items saved by version 0.1 up to the new format.
async function migrate() {
  const legacy = {
    top: ['tshirt', 'T-shirt'],
    bottom: ['pants', 'Other pants'],
    layer: ['jacket', 'Other layer'],
    shoes: ['shoes', 'Other shoes'],
  };
  const ordered = [...state.items].sort((a, b) => (a.added || 0) - (b.added || 0));
  for (const it of ordered) {
    let changed = false;
    if (!it.type) { const [t, k] = legacy[it.cat] || ['tshirt', 'Other top']; it.type = t; it.kind = k; changed = true; }
    if (!it.kind) { it.kind = Object.keys(TYPES[it.type].kinds)[0]; changed = true; }
    if (!it.pattern) { it.pattern = 'solid'; changed = true; }
    if (!E.FORMALITY[it.style]) { it.style = 'casual'; changed = true; }
    if (!it.code) { it.code = await nextCode(it.type); changed = true; }
    if (changed) await put('items', it);
  }
}

/* ---------- photo and colour ---------- */

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

/* ---------- look cards (used on Today and Lookbook) ---------- */

function lookCard(look, opts = {}) {
  const pieces = h('div', { class: 'pieces' });
  for (const it of look.items) {
    pieces.append(h('figure', {}, h('img', { src: it.photo, alt: it.code }), h('figcaption', {}, `${it.code} · ${E.colourName(it.colour)}`)));
  }
  const names = [...new Set(look.items.map((i) => E.colourName(i.colour)))];
  const card = h('article', { class: 'outfit stitch' },
    h('div', { class: 'look-head' },
      h('h3', {}, look.id),
      h('p', { class: 'rating' }, `${look.r.total.toFixed(1)}/10`, h('span', {}, E.verdict(look.r.total)))),
    h('p', { class: 'colours' }, `Colours: ${names.join(', ')}`));

  if (opts.note) card.append(h('p', { class: 'weather-line' }, opts.note));
  card.append(pieces);
  if (look.r.why.length) card.append(h('ul', { class: 'reasons' }, ...look.r.why.slice(0, 4).map((t) => h('li', {}, t))));
  if (look.r.cautions.length) card.append(h('ul', { class: 'reasons bad' }, ...look.r.cautions.slice(0, 3).map((t) => h('li', {}, t))));
  if (look.alt) card.append(h('p', { class: 'alt' }, look.alt.text));

  const row = h('div', { class: 'button-row' });
  if (opts.wear) {
    const wear = h('button', { class: 'btn primary', type: 'button' }, 'Wear this today');
    wear.addEventListener('click', async () => {
      const d = new Date();
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const entry = { id: newId(), date, ids: look.items.map((x) => x.id) };
      await put('worn', entry);
      state.worn.push(entry);
      wear.textContent = 'Saved for today';
      wear.disabled = true;
      toast("Saved. Stylo will vary tomorrow's picks.");
    });
    row.append(wear);
  }
  const save = h('button', { class: 'btn ghost', type: 'button' }, 'Save as image');
  save.addEventListener('click', () => saveBoard(look));
  row.append(save);
  card.append(row);
  return card;
}

/* ---------- Today ---------- */

function daysSinceWorn() {
  const map = new Map();
  const today = new Date(new Date().toDateString());
  for (const w of state.worn) {
    const days = Math.round((today - new Date(w.date + 'T00:00:00')) / 864e5);
    for (const id of w.ids) if (!map.has(id) || days < map.get(id)) map.set(id, days);
  }
  return map;
}

function weatherNote(look) {
  const t = state.temp;
  const feel = t >= 30 ? 'Light pieces for the heat' : t >= 22 ? 'Easy pieces for a warm day' : t >= 16 ? 'Balanced for mild weather' : 'Warm enough for the cold';
  return feel + (look.jacket ? ', with a layer on top.' : '.');
}

function renderToday() {
  const box = $('#results');
  box.replaceChildren();
  const picks = E.todayPicks(state.items, state.profile, { occasion: state.occasion, temp: state.temp, recent: daysSinceWorn() });
  if (!picks) {
    box.append(h('p', { class: 'empty stitch' }, 'Add at least one top and one bottom in the Wardrobe tab, and Stylo can suggest outfits.'));
    return;
  }
  for (const look of picks) box.append(lookCard(look, { wear: true, note: weatherNote(look) }));
}

/* ---------- Lookbook ---------- */

function optionList(select, list, withNone) {
  select.replaceChildren();
  if (withNone) select.append(h('option', { value: '' }, 'None'));
  for (const i of list) select.append(h('option', { value: i.id }, `${i.code} · ${itemLabel(i)}`));
}

function populateTry() {
  const of = (...types) => state.items.filter((i) => types.includes(i.type));
  optionList($('#try-top'), of('shirt', 'tshirt'), false);
  optionList($('#try-bottom'), of('pants', 'jeans'), false);
  optionList($('#try-shoes'), of('shoes'), true);
  optionList($('#try-jacket'), of('jacket'), true);
}

function rateChosen() {
  const out = $('#try-result');
  out.replaceChildren();
  const find = (id) => state.items.find((i) => i.id === id) || null;
  const top = find($('#try-top').value), bottom = find($('#try-bottom').value);
  if (!top || !bottom) { out.append(h('p', { class: 'note' }, 'Add a top and a bottom first.')); return; }
  const o = { top, bottom, shoes: find($('#try-shoes').value), jacket: find($('#try-jacket').value) };
  const r = E.scoreLook(o, state.profile);
  const look = { ...o, r, acc: [], alt: null, items: [top, bottom, o.shoes, o.jacket].filter(Boolean) };
  look.id = look.items.map((i) => i.code).join(' + ');

  const card = lookCard(look);
  const better = E.betterThan(E.buildLooks(state.items, state.profile), look);
  if (better) card.insertBefore(h('p', { class: 'alt' }, `A stronger option from your wardrobe: ${better.id} (${better.r.total.toFixed(1)}/10).`), card.querySelector('.button-row'));
  else if (r.total >= 7.5) card.insertBefore(h('p', { class: 'alt' }, 'Nothing in your wardrobe clearly beats this with the same top or bottom.'), card.querySelector('.button-row'));
  out.append(card);
}

function renderLookbook() {
  populateTry();
  const box = $('#lookbook');
  box.replaceChildren();
  $('#skip').hidden = true;

  const tops = state.items.filter((i) => E.TOPS.includes(i.type));
  const bottoms = state.items.filter((i) => E.BOTTOMS.includes(i.type));
  if (state.items.length < 4 || !tops.length || !bottoms.length) {
    box.append(h('p', { class: 'empty stitch' },
      'The lookbook opens once you have at least one top, one bottom and four items in total. Add more clothes in the Wardrobe tab.'));
    return;
  }

  const hasProfile = !!(state.profile.depth || (state.profile.undertone && state.profile.undertone !== 'unsure'));
  const looks = E.buildLooks(state.items, state.profile);
  const groups = E.collections(looks, hasProfile);
  if (!groups.length) {
    box.append(h('p', { class: 'empty stitch' }, 'No combination from your current clothes rates well enough to recommend yet. Add more pieces, or check the list of combinations to skip below.'));
  }

  for (const g of groups) {
    const shown = state.expanded[g.key] ? g.looks.length : 6;
    const wrap = h('div', { class: 'looks' }, ...g.looks.slice(0, shown).map((l) => lookCard(l)));
    const sec = h('section', { class: 'collection' },
      h('h2', {}, g.title),
      h('p', { class: 'note' }, g.blurb),
      wrap);
    if (g.looks.length > shown) {
      const more = h('button', { class: 'btn ghost more', type: 'button' }, `Show ${g.looks.length - shown} more`);
      more.addEventListener('click', () => { state.expanded[g.key] = true; renderLookbook(); });
      sec.append(more);
    }
    box.append(sec);
  }

  const weak = E.weakest(looks);
  if (weak.length) {
    $('#skip').hidden = false;
    const list = $('#skip-list');
    list.replaceChildren();
    for (const w of weak) {
      const p = h('p', { class: 'skip-item' },
        h('strong', {}, `${w.look.id} (${w.look.r.total.toFixed(1)}/10)`),
        `: ${w.look.r.cautions[0] || 'It scores low overall.'}`);
      if (w.better) p.append(` Try ${w.better.id} (${w.better.r.total.toFixed(1)}/10) instead.`);
      list.append(p);
    }
  }
}

/* ---------- Wardrobe ---------- */

function renderWardrobe() {
  const list = state.items
    .filter((i) => state.filter === 'all' || i.type === state.filter)
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  const grid = $('#grid');
  grid.replaceChildren();
  for (const it of list) {
    const dot = h('span', { class: 'dot' });
    dot.style.background = it.colour;
    const edit = h('button', { type: 'button', 'aria-label': `Edit ${it.code}` }, 'Edit');
    edit.addEventListener('click', () => openDialog(it));
    const del = h('button', { class: 'remove', type: 'button', 'aria-label': `Remove ${it.code}` }, 'Remove');
    del.addEventListener('click', async () => {
      if (!confirm(`Remove ${it.code} from your wardrobe? Its ID will not be reused.`)) return;
      await remove('items', it.id);
      state.items = state.items.filter((x) => x.id !== it.id);
      renderWardrobe();
    });
    grid.append(
      h('article', { class: 'item' },
        h('img', { src: it.photo, alt: it.note || itemLabel(it), loading: 'lazy' }),
        h('div', { class: 'meta' }, dot, h('span', { class: 'code' }, it.code),
          h('span', { class: 'label' }, it.note || itemLabel(it)),
          h('div', { class: 'tools' }, edit, del)))
    );
  }
  $('#empty').hidden = list.length > 0;
  $('#count').textContent = state.items.length ? `(${state.items.length})` : '';
}

/* ---------- Add and edit dialog ---------- */

function fillKinds(selected) {
  const kind = $('#kind');
  kind.replaceChildren();
  for (const k of Object.keys(TYPES[$('#type').value].kinds)) kind.append(h('option', { value: k }, k));
  if (selected) kind.value = selected;
}

function styleFromKind() {
  $('#style').value = TYPES[$('#type').value].kinds[$('#kind').value];
}

function updateColourName() {
  $('#colour-name').textContent = E.colourName($('#colour').value);
}

function resetForm() {
  $('#form').reset();
  state.draftPhoto = null;
  $('#preview').hidden = true;
  $('#preview').removeAttribute('src');
  $('#photo-hint').hidden = false;
  fillKinds();
  styleFromKind();
  $('#colour').value = '#808080';
  updateColourName();
}

function openDialog(item) {
  state.editingId = item ? item.id : null;
  resetForm();
  $('#dlg-title').textContent = item ? `Edit ${item.code}` : 'Add clothes';
  $('#save-more').hidden = !!item;
  $('#photo').required = !item;
  if (item) {
    state.draftPhoto = item.photo;
    $('#preview').src = item.photo;
    $('#preview').hidden = false;
    $('#photo-hint').hidden = true;
    $('#type').value = item.type;
    fillKinds(item.kind);
    $('#style').value = item.style;
    $('#pattern').value = item.pattern || 'solid';
    $('#warmth').value = item.warmth || 'medium';
    $('#colour').value = item.colour;
    $('#note').value = item.note || '';
    updateColourName();
  }
  $('#dlg').showModal();
}

async function onPhoto(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const img = await loadImage(file);
    const canvas = shrink(img);
    state.draftPhoto = canvas.toDataURL('image/jpeg', 0.8);
    $('#colour').value = dominantColour(canvas);
    updateColourName();
    $('#preview').src = state.draftPhoto;
    $('#preview').hidden = false;
    $('#photo-hint').hidden = true;
  } catch {
    toast('That photo could not be read. Try another one.');
  }
}

async function saveItem() {
  if (!state.draftPhoto) { toast('Add a photo first.'); return false; }
  const data = {
    type: $('#type').value,
    kind: $('#kind').value,
    style: $('#style').value,
    pattern: $('#pattern').value,
    warmth: $('#warmth').value,
    colour: $('#colour').value,
    note: $('#note').value.trim(),
    photo: state.draftPhoto,
  };
  try {
    const editing = state.editingId ? state.items.find((i) => i.id === state.editingId) : null;
    if (editing) {
      const typeChanged = editing.type !== data.type;
      Object.assign(editing, data);
      if (typeChanged) editing.code = await nextCode(data.type);
      await put('items', editing);
      toast(typeChanged ? `Saved. Its new ID is ${editing.code}.` : 'Saved.');
    } else {
      const item = { id: newId(), ...data, code: await nextCode(data.type), added: Date.now() };
      await put('items', item);
      state.items.push(item);
      toast(`Added as ${item.code}.`);
    }
  } catch {
    toast('Could not save. Your browser may be out of storage.');
    return false;
  }
  renderWardrobe();
  return true;
}

/* ---------- Profile, backup and inventory ---------- */

function renderProfile() {
  $('#p-depth').value = state.profile.depth || '';
  $('#p-undertone').value = state.profile.undertone || '';
}

async function saveProfile() {
  state.profile.depth = $('#p-depth').value;
  state.profile.undertone = $('#p-undertone').value;
  await put('meta', state.profile);
  toast('Profile saved.');
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

const today = () => new Date().toISOString().slice(0, 10);

function exportBackup() {
  const data = { app: 'stylo', version: 2, items: state.items, worn: state.worn, profile: state.profile, counters: state.counters };
  download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `stylo-backup-${today()}.json`);
}

async function importBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'stylo' || !Array.isArray(data.items)) throw new Error('not a Stylo backup');
    let count = 0;
    for (const it of data.items) {
      if (!it.id || !it.type || !TYPES[it.type] || !it.colour || !it.photo) continue;
      await put('items', it);
      count++;
    }
    for (const w of data.worn || []) if (w.id && Array.isArray(w.ids)) await put('worn', w);
    if (data.profile) { state.profile = { ...state.profile, depth: data.profile.depth || '', undertone: data.profile.undertone || '' }; await put('meta', state.profile); }
    for (const [k, v] of Object.entries(data.counters || {})) {
      if (k !== 'id' && Number.isFinite(v)) state.counters[k] = Math.max(state.counters[k] || 0, v);
    }
    await put('meta', state.counters);
    state.items = await getAll('items');
    state.worn = await getAll('worn');
    await migrate();
    renderWardrobe();
    renderProfile();
    toast(`Restored ${count} items.`);
  } catch {
    toast('That file is not a Stylo backup.');
  }
}

function exportCsv() {
  const cell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const rows = [['ID', 'Type', 'Kind', 'Colour', 'Hex', 'Pattern', 'Style', 'Warmth', 'Note']];
  for (const i of [...state.items].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))) {
    rows.push([i.code, TYPES[i.type].label, i.kind, E.colourName(i.colour), i.colour, i.pattern, STYLE_LABEL[i.style], i.warmth, i.note]);
  }
  download(new Blob([rows.map((r) => r.map(cell).join(',')).join('\n')], { type: 'text/csv' }), `stylo-inventory-${today()}.csv`);
}

/* ---------- save a look as an image board ---------- */

function roundRect(x, px, py, w, hgt, r) {
  x.beginPath();
  x.moveTo(px + r, py);
  x.arcTo(px + w, py, px + w, py + hgt, r);
  x.arcTo(px + w, py + hgt, px, py + hgt, r);
  x.arcTo(px, py + hgt, px, py, r);
  x.arcTo(px, py, px + w, py, r);
  x.closePath();
}

async function saveBoard(look) {
  const imgs = await Promise.all(look.items.map((it) => new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = it.photo;
  })));
  const n = look.items.length;
  const cols = Math.min(n, 3), rows = Math.ceil(n / cols);
  const cell = 340, gap = 24, headH = 96, cap = 46, foot = 110;
  const W = cols * cell + (cols + 1) * gap;
  const H = headH + gap + rows * (cell + cap) + foot;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');

  x.fillStyle = '#f3f5f8'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#22345a'; x.fillRect(0, 0, W, headH);

  const ratingText = `${look.r.total.toFixed(1)}/10`;
  x.fillStyle = '#f3f5f8';
  x.textBaseline = 'middle';
  let fs = 38;
  x.font = `italic 600 ${fs}px Georgia, serif`;
  while (fs > 18 && x.measureText(look.id).width > W - 3 * gap - 130) { fs -= 2; x.font = `italic 600 ${fs}px Georgia, serif`; }
  x.textAlign = 'left';
  x.fillText(look.id, gap, headH / 2);
  x.font = '700 34px system-ui, sans-serif';
  x.fillStyle = '#e8b02c';
  x.textAlign = 'right';
  x.fillText(ratingText, W - gap, headH / 2);

  look.items.forEach((it, i) => {
    const px = gap + (i % cols) * (cell + gap);
    const py = headH + gap + Math.floor(i / cols) * (cell + cap);
    x.save();
    roundRect(x, px, py, cell, cell, 14);
    x.clip();
    const im = imgs[i];
    if (im) {
      const side = Math.min(im.width, im.height);
      x.drawImage(im, (im.width - side) / 2, (im.height - side) / 2, side, side, px, py, cell, cell);
    } else { x.fillStyle = '#dde1e8'; x.fillRect(px, py, cell, cell); }
    x.restore();
    x.fillStyle = '#1b2236';
    x.font = '600 21px system-ui, sans-serif';
    x.textAlign = 'left';
    x.fillText(`${it.code} · ${itemLabel(it)}`.slice(0, 34), px, py + cell + 24);
  });

  const names = [...new Set(look.items.map((i) => E.colourName(i.colour)))].join(', ');
  const fy = H - foot + 30;
  x.fillStyle = '#5d6679';
  x.textAlign = 'left';
  x.font = '22px system-ui, sans-serif';
  x.fillText(`Colours: ${names}`.slice(0, 70), gap, fy);
  x.fillText(`${E.verdict(look.r.total)} look`, gap, fy + 34);
  x.fillStyle = '#22345a';
  x.textAlign = 'right';
  x.font = 'italic 600 24px Georgia, serif';
  x.fillText('Stylo', W - gap, fy + 34);

  c.toBlob((b) => download(b, `Stylo-${look.id.replace(/ \+ /g, '-')}.png`), 'image/png');
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
        sel.prepend(h('option', { value: String(state.temp), 'data-live': '1' }, `Today near you, ${state.temp}°C`));
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

/* ---------- wiring ---------- */

function bind() {
  // dialog selects are built from the same list the engine uses
  const typeSel = $('#type');
  for (const [key, t] of Object.entries(TYPES)) typeSel.append(h('option', { value: key }, t.label));

  $$('.tabs button').forEach((b) =>
    b.addEventListener('click', () => {
      $$('.tabs button').forEach((x) => x.removeAttribute('aria-current'));
      b.setAttribute('aria-current', 'page');
      $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + b.dataset.view));
      if (b.dataset.view === 'lookbook') renderLookbook();
      if (b.dataset.view === 'profile') renderProfile();
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
  $('#suggest').addEventListener('click', renderToday);
  $('#try-go').addEventListener('click', rateChosen);

  $$('#filters button').forEach((b) =>
    b.addEventListener('click', () => {
      state.filter = b.dataset.value;
      $$('#filters button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      renderWardrobe();
    })
  );

  const dlg = $('#dlg');
  $('#add').addEventListener('click', () => openDialog(null));
  $('#cancel').addEventListener('click', () => dlg.close());
  $('#photo').addEventListener('change', onPhoto);
  $('#type').addEventListener('change', () => { fillKinds(); styleFromKind(); });
  $('#kind').addEventListener('change', styleFromKind);
  $('#colour').addEventListener('input', updateColourName);
  $('#form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await saveItem()) dlg.close();
  });
  $('#save-more').addEventListener('click', async () => {
    if (await saveItem()) resetForm();
  });

  $('#p-depth').addEventListener('change', saveProfile);
  $('#p-undertone').addEventListener('change', saveProfile);
  $('#export').addEventListener('click', exportBackup);
  $('#csv').addEventListener('click', exportCsv);
  $('#import').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) importBackup(f);
    e.target.value = '';
  });
}

async function init() {
  bind();
  try {
    db = await openDB();
    state.items = await getAll('items');
    state.worn = await getAll('worn');
    state.profile = (await getOne('meta', 'profile')) || state.profile;
    state.counters = (await getOne('meta', 'counters')) || state.counters;
    await migrate();
  } catch {
    toast('Saving is not available in this browser mode. Try a normal tab.');
  }
  renderWardrobe();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();
