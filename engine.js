/* Stylo engine: all the styling logic, with no screen code, so it can be tested on its own. */
(function (root) {
  'use strict';

  /* ---------- wardrobe vocabulary ---------- */

  // Each type has an ID prefix (SH01, JN02...) and kinds with a default style.
  const TYPES = {
    shirt: { label: 'Shirt', code: 'SH', kinds: { 'Formal shirt': 'formal', 'Casual shirt': 'casual' } },
    tshirt: { label: 'Top, T-shirt, polo or kurti', code: 'TS', kinds: { 'T-shirt': 'casual', 'Polo': 'smart', 'Top or blouse': 'casual', 'Kurti or kurta': 'smart', 'Other top': 'casual' } },
    pants: { label: 'Pants, trousers, leggings or cargos', code: 'PT', kinds: { 'Trousers': 'smart', 'Chinos': 'smart', 'Cargos': 'street', 'Palazzo': 'casual', 'Leggings': 'casual', 'Shorts': 'street', 'Other pants': 'casual' } },
    skirt: { label: 'Skirt', code: 'SK', kinds: { 'Skirt': 'casual', 'Long skirt': 'smart' } },
    onepiece: { label: 'Dress, saree or full set', code: 'DR', kinds: { 'Dress': 'smart', 'Jumpsuit': 'smart', 'Salwar suit set': 'smart', 'Saree': 'formal', 'Lehenga': 'formal' } },
    jeans: { label: 'Jeans', code: 'JN', kinds: { 'Jeans': 'casual' } },
    shoes: { label: 'Shoes', code: 'SHOE', kinds: { 'Sneakers': 'casual', 'Formal shoes': 'formal', 'Heels': 'smart', 'Flats': 'casual', 'Sandals': 'street', 'Boots': 'casual', 'Other shoes': 'casual' } },
    jacket: { label: 'Jacket, hoodie or layer', code: 'JK', kinds: { 'Jacket': 'casual', 'Blazer': 'smart', 'Hoodie': 'street', 'Cardigan': 'casual', 'Shrug or shawl': 'smart', 'Other layer': 'casual' } },
    accessory: { label: 'Accessory', code: 'AC', kinds: { 'Watch': 'casual', 'Belt': 'casual', 'Bag': 'casual', 'Jewellery': 'casual', 'Scarf or dupatta': 'casual', 'Other accessory': 'casual' } },
  };
  const TOPS = ['shirt', 'tshirt'];
  const BOTTOMS = ['pants', 'jeans', 'skirt'];
  const FULLS = ['onepiece']; // dresses, sarees and sets are a whole outfit base on their own
  const ETHNIC_KINDS = ['Saree', 'Salwar suit set', 'Lehenga', 'Kurti or kurta'];
  const FORMALITY = { street: 1, casual: 2, smart: 3, formal: 4 };
  const STYLE_LABEL = { street: 'Relaxed', casual: 'Casual', smart: 'Smart casual', formal: 'Formal' };
  const WARMTH = { light: 1, medium: 2, warm: 3 };

  /* ---------- colour ---------- */

  const NAMES = [
    ['White', '#f5f5f2'], ['Cream', '#efe6d0'], ['Light grey', '#c8c9cc'], ['Grey', '#808285'],
    ['Charcoal', '#3b3d42'], ['Black', '#16171a'], ['Navy', '#1f2d4d'], ['Blue', '#2f5fb0'],
    ['Light blue', '#9cc3e6'], ['Denim blue', '#4a6a96'], ['Teal', '#1f7a80'], ['Green', '#2f8a4a'],
    ['Olive', '#5c6330'], ['Khaki', '#b9a878'], ['Beige', '#d6c3a3'], ['Tan', '#a9794a'],
    ['Brown', '#5e3b25'], ['Maroon', '#6e1f2f'], ['Red', '#c0392b'], ['Orange', '#e07a2d'],
    ['Mustard', '#d1a521'], ['Yellow', '#f0d54a'], ['Pink', '#e89bb0'], ['Purple', '#6a3f93'],
    ['Lavender', '#b7a4d6'],
  ];

  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

  function distance(a, b) {
    const rm = (a[0] + b[0]) / 2;
    const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
  }

  function colourName(hex) {
    const c = rgb(hex);
    let best = NAMES[0], bd = Infinity;
    for (const n of NAMES) {
      const d = distance(c, rgb(n[1]));
      if (d < bd) { bd = d; best = n; }
    }
    return best[0];
  }

  function hsl(hex) {
    const [r8, g8, b8] = rgb(hex);
    const r = r8 / 255, g = g8 / 255, b = b8 / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    let h = 0, s = 0;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
    }
    return { h, s, l };
  }

  // Colours that go with nearly everything: black, white, greys, navy, and earthy beiges.
  function isNeutral(c) {
    if (c.s < 0.18 || c.l < 0.15 || c.l > 0.88) return true;
    if (c.h >= 195 && c.h <= 250 && c.l < 0.35) return true;
    if (c.h >= 20 && c.h <= 60 && c.s < 0.5 && c.l > 0.4) return true;
    return false;
  }
  const neutralHex = (hex) => isNeutral(hsl(hex));
  const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

  function colourMatch(hexA, hexB) {
    const a = hsl(hexA), b = hsl(hexB);
    if (isNeutral(a) || isNeutral(b)) return 1;
    const gap = hueGap(a.h, b.h);
    if (gap < 35) return 0.8;
    if (gap > 150) return 0.7;
    if (a.s < 0.35 || b.s < 0.35) return 0.2;
    return -0.8;
  }

  // A gentle nudge from the skin tone profile the person chose. It is a guide, never a rule.
  function complexionFit(hex, profile) {
    if (!profile || (!profile.depth && (!profile.undertone || profile.undertone === 'unsure'))) return null;
    const c = hsl(hex);
    const neutral = isNeutral(c);
    let s = 0, note = '';
    const u = profile.undertone;
    const warmHue = c.h <= 75 || c.h >= 340;
    const coolHue = c.h >= 160 && c.h <= 320;

    if (!neutral) {
      if (u === 'warm') {
        if (warmHue || (c.h > 75 && c.h < 160 && c.s < 0.6 && c.l < 0.5)) { s += 0.5; note = 'Warm, earthy shades tend to suit a warm undertone.'; }
        else if (coolHue && c.s > 0.5) s -= 0.2;
      } else if (u === 'cool') {
        if (coolHue || c.h >= 330) { s += 0.5; note = 'Cool shades such as blues and purples tend to suit a cool undertone.'; }
        else if (warmHue && c.s > 0.6 && c.h < 75) s -= 0.2;
      } else if (u === 'neutral') s += 0.2;
    } else s += 0.2;

    if (profile.depth === 'deep' || profile.depth === 'tan') {
      if (c.l > 0.6 || c.s > 0.55) { s += 0.3; if (!note) note = 'A lighter or brighter shade adds contrast against deeper skin.'; }
    } else if (profile.depth === 'fair' || profile.depth === 'light') {
      if (c.l >= 0.2 && c.l <= 0.55) { s += 0.3; if (!note) note = 'A mid to deep shade adds definition against lighter skin.'; }
    } else if (profile.depth === 'medium') s += 0.15;

    return { score: Math.max(-1, Math.min(1, s)), note };
  }

  /* ---------- scoring ---------- */

  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lower = (s) => (s || '').toLowerCase();

  // Rates one outfit out of 10: colour (4) + style consistency (3) + contrast (1) + complexion (2).
  function scoreLook(o, profile) {
    const full = o.full || null;
    const top = full || o.top, bottom = full || o.bottom; // a one-piece fills both roles
    const { shoes, jacket } = o;
    const why = [], cautions = [];
    const nT = colourName(top.colour), nB = colourName(bottom.colour);

    const cm = full ? 1 : colourMatch(top.colour, bottom.colour);
    // Clashing colours are penalised twice as hard as good matches are rewarded.
    let colour = 1.4 + (cm < 0 ? cm * 2 : cm);
    if (full) why.push(`${nT} ${lower(full.kind)}: one statement piece, so the shoes and layer do the pairing.`);
    else if (cm === 1) why.push(`${nT} with ${nB}: a neutral piece keeps the look balanced.`);
    else if (cm === 0.8) why.push(`${nT} with ${nB}: the same colour family, so it looks tonal and intentional.`);
    else if (cm === 0.7) why.push(`${nT} with ${nB}: opposite colours give a bold, high-contrast look.`);
    else if (cm === 0.2) why.push(`${nT} with ${nB}: muted shades that sit quietly together.`);
    else cautions.push(`${nT} with ${nB}: these two colours compete for attention.`);

    if (shoes) {
      const cs = colourMatch(shoes.colour, bottom.colour);
      colour += 0.5 * cs;
      if (cs < 0) cautions.push(`${shoes.code} (${colourName(shoes.colour)}) clashes with the ${lower(nB)} bottoms.`);
    } else colour += 0.35;

    if (jacket) {
      const cj = (colourMatch(jacket.colour, top.colour) + colourMatch(jacket.colour, bottom.colour)) / 2;
      colour += 0.4 * (cj - 0.3);
      if (cj < 0) cautions.push(`${jacket.code} (${colourName(jacket.colour)}) fights with the rest of the colours.`);
      else if (cj >= 0.7) why.push(`${jacket.code} layers over this without fighting the colours.`);
    }

    const patterned = [...new Set([top, bottom, jacket])].filter((i) => i && (i.pattern || 'solid') !== 'solid');
    if (patterned.length >= 2) {
      colour -= Math.min(2, 1.2 * (patterned.length - 1));
      cautions.push(`${patterned.map((i) => i.code).join(' and ')} are both patterned, which can look busy.`);
    }
    colour = clamp(colour, 0, 4);

    // style consistency
    const parts = [...new Set([top, bottom, shoes, jacket])].filter(Boolean);
    const levels = parts.map((p) => FORMALITY[p.style] || 2);
    const mean = avg(levels);
    const spread = Math.max(...levels) - Math.min(...levels);
    const style = clamp(3 - (spread >= 3 ? 2.2 : spread >= 2 ? 0.6 : 0), 0, 3);
    if (spread >= 2) {
      const hi = parts[levels.indexOf(Math.max(...levels))];
      const lo = parts[levels.indexOf(Math.min(...levels))];
      cautions.push(`${hi.code} (${lower(STYLE_LABEL[hi.style])}) and ${lo.code} (${lower(STYLE_LABEL[lo.style])}) pull in different directions.`);
    } else if (parts.length >= 3) why.push('Every piece sits at a similar level of dressiness.');

    // light and dark balance between top and bottom
    const d = full ? 0.15 : Math.abs(hsl(top.colour).l - hsl(bottom.colour).l);
    let contrast;
    if (d < 0.1) { contrast = 0.55; why.push('Similar shades throughout give a smooth, monochrome feel.'); }
    else if (d < 0.2) contrast = 0.8;
    else if (d <= 0.6) { contrast = 1; if (d >= 0.25) why.push('The light and dark contrast between top and bottom adds definition.'); }
    else contrast = 0.75;

    // complexion
    let complexion = 1;
    const ft = complexionFit(top.colour, profile);
    if (ft) {
      const fj = jacket ? complexionFit(jacket.colour, profile) : null;
      const combined = fj ? 0.7 * ft.score + 0.3 * fj.score : ft.score;
      complexion = clamp(1 + combined * 1.5, 0, 2);
      if (ft.note) why.push(ft.note);
    }

    const total = Math.round((colour + style + contrast + complexion) * 10) / 10;
    return {
      total,
      mean,
      parts: { colour, style, contrast, complexion },
      why,
      cautions,
    };
  }

  function verdict(total) {
    if (total >= 8.5) return 'Strong';
    if (total >= 7.5) return 'Good';
    if (total >= 6.5) return 'Okay';
    return 'Skip';
  }

  /* ---------- building looks ---------- */

  const desc = (i) => (i ? `${i.code} (${lower(colourName(i.colour))} ${lower(i.kind)})` : 'nothing');

  const topOf = (l) => l.full || l.top;
  const bottomOf = (l) => l.full || l.bottom;

  function pickAccessories(look, items) {
    const acc = items.filter((i) => i.type === 'accessory');
    if (!acc.length) return [];
    const best = (list, fn) => list.map((a) => [a, fn(a)]).sort((x, y) => y[1] - x[1])[0];
    const fit = (a) => (colourMatch(a.colour, topOf(look).colour) + colourMatch(a.colour, bottomOf(look).colour)) / 2;
    const out = [];

    const belts = acc.filter((a) => a.kind === 'Belt');
    if (belts.length && look.shoes && look.r.mean >= 2.2) {
      const [b, s] = best(belts, (a) => colourMatch(a.colour, look.shoes.colour));
      if (s >= 0.7) out.push(b);
    }
    for (const kind of ['Watch', 'Bag', 'Jewellery', 'Scarf or dupatta']) {
      const list = acc.filter((a) => a.kind === kind);
      if (!list.length || out.length >= 3) continue;
      const [a, s] = best(list, fit);
      if (kind === 'Watch' || s >= 0.5) out.push(a);
    }
    if (!out.length) {
      const others = acc.filter((a) => a.kind === 'Other accessory');
      if (others.length) out.push(best(others, fit)[0]);
    }
    return out.slice(0, 3);
  }

  function altNote(best, alt) {
    const changes = [];
    if ((alt.shoes && alt.shoes.id) !== (best.shoes && best.shoes.id)) changes.push(`swap ${desc(best.shoes)} for ${desc(alt.shoes)}`);
    if ((alt.jacket && alt.jacket.id) !== (best.jacket && best.jacket.id)) {
      if (best.jacket && !alt.jacket) changes.push(`drop ${best.jacket.code}`);
      else if (!best.jacket && alt.jacket) changes.push(`add ${alt.jacket.code}`);
      else changes.push(`swap ${best.jacket.code} for ${alt.jacket.code}`);
    }
    const diff = best.r.total - alt.r.total;
    let tail;
    if (diff < 0.3) tail = 'Both work, so pick by mood.';
    else {
      const styleGap = best.r.parts.style - alt.r.parts.style;
      const colourGap = best.r.parts.colour - alt.r.parts.colour;
      tail = `The main version is better by ${diff.toFixed(1)}: ${styleGap > colourGap ? 'it keeps the dressiness consistent' : 'its colours work better together'}.`;
    }
    return `If you ${changes.join(' and ')}: ${alt.r.total.toFixed(1)} instead of ${best.r.total.toFixed(1)}. ${tail}`;
  }

  function finishLook(best, alt, items) {
    const look = { full: best.full || null, top: best.top || null, bottom: best.bottom || null, shoes: best.shoes || null, jacket: best.jacket || null, r: best.r };
    look.acc = pickAccessories(look, items);
    look.items = [look.full, look.top, look.bottom, look.shoes, look.jacket, ...look.acc].filter(Boolean);
    look.id = look.items.map((i) => i.code).join(' + ');
    look.alt = alt ? { text: altNote(best, alt), total: alt.r.total } : null;
    return look;
  }

  // One best look for every top and bottom pairing, and for every one-piece. Shoe and layer swaps become the "alternative".
  function buildLooks(items, profile) {
    const tops = items.filter((i) => TOPS.includes(i.type));
    const bottoms = items.filter((i) => BOTTOMS.includes(i.type));
    const fulls = items.filter((i) => FULLS.includes(i.type));
    const shoes = items.filter((i) => i.type === 'shoes');
    const jackets = items.filter((i) => i.type === 'jacket');
    const shoeOpts = shoes.length ? shoes : [null];
    const jacketOpts = [null, ...jackets];
    const out = [];

    const addBest = (base) => {
      const variants = [];
      for (const s of shoeOpts) {
        for (const j of jacketOpts) {
          const o = { ...base, shoes: s, jacket: j };
          variants.push({ ...o, r: scoreLook(o, profile) });
        }
      }
      variants.sort((a, b) => b.r.total - a.r.total);
      const best = variants[0];
      const alt =
        variants.find((v) => (v.shoes && v.shoes.id) !== (best.shoes && best.shoes.id)) ||
        variants.find((v) => (v.jacket && v.jacket.id) !== (best.jacket && best.jacket.id)) ||
        null;
      out.push(finishLook(best, alt, items));
    };

    for (const top of tops) for (const bottom of bottoms) addBest({ top, bottom });
    for (const full of fulls) addBest({ full });
    return out;
  }

  /* ---------- lookbook collections ---------- */

  function collections(looks, hasProfile) {
    const ok = looks.filter((l) => l.r.total >= 6.8).sort((a, b) => b.r.total - a.r.total);
    const core = (l) => [...new Set([l.full, l.top, l.bottom, l.shoes, l.jacket])].filter(Boolean);
    const nonNeutral = (l) => core(l).filter((i) => !neutralHex(i.colour));
    const patternCount = (l) => core(l).filter((i) => (i.pattern || 'solid') !== 'solid').length;

    const A = [], B = [], C = [], D = [], F = [], I = [];
    for (const l of ok) {
      const streetCount = core(l).filter((i) => i.style === 'street').length;
      if (core(l).some((i) => ETHNIC_KINDS.includes(i.kind))) I.push(l);
      else if (l.r.mean >= 3.4) D.push(l);
      else if (streetCount >= 2) F.push(l);
      else if (l.r.mean >= 2.5) C.push(l);
      else if (l.r.mean < 2.5 && l.r.total >= 7.8 && patternCount(l) <= 1 && !neutralHex(l.top.colour)) B.push(l);
      else A.push(l);
    }
    const Em = ok.filter((l) => patternCount(l) === 0 && nonNeutral(l).length <= 1 && l.r.mean >= 1.8 && l.r.mean <= 3.4 && l.r.total >= 7.2);
    const G = ok
      .filter((l) => l.r.total >= 7.5)
      .sort((a, b) => (b.r.parts.colour + b.r.parts.complexion + b.r.parts.contrast) - (a.r.parts.colour + a.r.parts.complexion + a.r.parts.contrast));
    const H = ok.filter((l) => l.top && l.bottom && !neutralHex(l.top.colour) && !neutralHex(l.bottom.colour) && colourMatch(l.top.colour, l.bottom.colour) >= 0.2 && l.r.total >= 7.2);

    const all = [
      { key: 'A', title: 'Everyday casual', blurb: 'Comfortable, easy outfits for ordinary days.', looks: A },
      { key: 'B', title: 'College and outings', blurb: 'Clean, modern combinations with a younger feel.', looks: B },
      { key: 'C', title: 'Smart casual', blurb: 'Polished without being formal.', looks: C },
      { key: 'D', title: 'Formal wear', blurb: 'Shirts, trousers and shoes for professional occasions.', looks: D },
      { key: 'I', title: 'Ethnic and festive', blurb: 'Sarees, salwar suits, lehengas and kurtis for celebrations and festivals.', looks: I },
      { key: 'E', title: 'Minimalist', blurb: 'Solid colours and a calm, limited palette.', looks: Em },
      { key: 'F', title: 'Streetwear', blurb: 'Relaxed pieces, layers and sneakers.', looks: F },
      {
        key: 'G',
        title: 'Best colour combinations',
        blurb: hasProfile
          ? 'The strongest colour pairings, with your skin tone profile taken into account.'
          : 'The strongest colour pairings. Add your skin tone in Profile to include complexion.',
        looks: G,
      },
      { key: 'H', title: 'Underrated combinations', blurb: 'Colour-on-colour pairings you might not try, and they work.', looks: H },
    ];
    return all.filter((c) => c.looks.length);
  }

  const baseIds = (l) => [l.full, l.top, l.bottom].filter(Boolean).map((i) => i.id);
  const shareBase = (a, b) => baseIds(a).some((id) => baseIds(b).includes(id));

  // Honest list of pairings that do not work, with a better option from the same wardrobe.
  function weakest(looks, limit = 5) {
    const weak = looks.filter((l) => l.r.total < 6.5).sort((a, b) => a.r.total - b.r.total).slice(0, limit);
    return weak.map((w) => {
      const partners = looks
        .filter((l) => l !== w && shareBase(l, w) && l.r.total >= w.r.total + 1.5)
        .sort((a, b) => b.r.total - a.r.total);
      return { look: w, better: partners[0] || null };
    });
  }

  function betterThan(looks, chosen) {
    if (chosen.full) return null;
    const options = looks
      .filter((l) => !l.full && (l.top.id === chosen.top.id && l.bottom.id !== chosen.bottom.id) || (l.bottom.id === chosen.bottom.id && l.top.id !== chosen.top.id))
      .sort((a, b) => b.r.total - a.r.total);
    return options[0] && options[0].r.total >= chosen.r.total + 0.5 ? options[0] : null;
  }

  /* ---------- today's outfit ---------- */

  const OCCASION_TARGET = { casual: 1.9, college: 2.2, smart: 3, formal: 4 };

  function todayPicks(items, profile, ctx) {
    const tops = items.filter((i) => TOPS.includes(i.type));
    const bottoms = items.filter((i) => BOTTOMS.includes(i.type));
    const fulls = items.filter((i) => FULLS.includes(i.type));
    const shoes = items.filter((i) => i.type === 'shoes');
    const jackets = items.filter((i) => i.type === 'jacket');
    if ((!tops.length || !bottoms.length) && !fulls.length) return null;

    const t = ctx.temp;
    const target = OCCASION_TARGET[ctx.occasion] || 2;
    const warmTarget = t >= 30 ? 1 : t >= 24 ? 1.5 : t >= 18 ? 2 : t >= 12 ? 2.5 : 3;
    const jacketOpts = !jackets.length || t >= 22 ? [null] : t < 16 ? jackets : [null, ...jackets];
    const shoeOpts = shoes.length ? shoes : [null];
    const recent = ctx.recent || new Map();

    const bases = [];
    for (const top of tops) for (const bottom of bottoms) bases.push({ top, bottom });
    for (const full of fulls) bases.push({ full });

    const all = [];
    for (const base of bases) for (const s of shoeOpts) for (const j of jacketOpts) {
      const o = { ...base, shoes: s, jacket: j };
      const r = scoreLook(o, profile);
      const baseWarmth = base.full ? WARMTH[base.full.warmth] : (WARMTH[base.top.warmth] + WARMTH[base.bottom.warmth]) / 2;
      const warmth = baseWarmth + (j ? WARMTH[j.warmth] * 0.5 : 0);
      let adj = r.total - Math.abs(r.mean - target) * 1.3 - Math.abs(warmth - warmTarget);
      for (const p of [base.full, base.top, base.bottom, s, j]) {
        if (!p) continue;
        const d = recent.get(p.id);
        if (d !== undefined && d <= 1) adj -= 2;
        else if (d !== undefined && d <= 3) adj -= 0.8;
      }
      all.push({ ...o, r, adj: adj + Math.random() * 0.5 });
    }
    all.sort((a, b) => b.adj - a.adj);

    const picked = [];
    for (const o of all) {
      if (picked.length === 3) break;
      if (picked.every((p) => !shareBase(p, o))) picked.push(o);
    }
    const key = (x) => [x.full && x.full.id, x.top && x.top.id, x.bottom && x.bottom.id, x.shoes && x.shoes.id, x.jacket && x.jacket.id].join('|');
    for (const o of all) {
      if (picked.length === 3) break;
      if (!picked.some((p) => key(p) === key(o))) picked.push(o);
    }
    return picked.map((p) => finishLook(p, null, items));
  }

  const api = {
    TYPES, TOPS, BOTTOMS, FULLS, ETHNIC_KINDS, FORMALITY, STYLE_LABEL, WARMTH,
    colourName, hsl, isNeutral, neutralHex, colourMatch, complexionFit,
    scoreLook, verdict, buildLooks, collections, weakest, betterThan, todayPicks, finishLook,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StyloEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
