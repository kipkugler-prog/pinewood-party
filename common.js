// Shared helpers for the TV and phone pages.
import { SHEET_ID } from './config.js';

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const pick = a => a[Math.floor(Math.random() * a.length)];
export const rid = () => Math.random().toString(36).slice(2, 9);
export const clean = o => JSON.parse(JSON.stringify(o ?? null));
export const norm = s => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
export const arr = x => Array.isArray(x) ? x.filter(v => v !== undefined && v !== null) : (x && typeof x === 'object' ? Object.keys(x).sort((a, b) => a - b).map(k => x[k]) : []);
export const obj = x => (x && typeof x === 'object') ? x : {};

// 18 player colors, readable on the dark green ground
export const PCOLORS = ['#ffd23f', '#ff7aa8', '#5fe0b5', '#ffa94d', '#b9a3ff', '#7fd1ff', '#f6efe2', '#ff8a6b', '#c6f36b', '#ff5fd2', '#4fd3ff', '#ffb3c7', '#9be7a1', '#ffc56b', '#d0a8ff', '#7ee0d6', '#f9e46c', '#ff9e9e'];
export const ANS = [
  { c: '#e2465d', k: 'A' }, { c: '#2f7fd8', k: 'B' }, { c: '#e3a008', k: 'C' }, { c: '#25a06a', k: 'D' }, { c: '#8d5bd6', k: 'E' }, { c: '#e0702a', k: 'F' },
  { c: '#c94f97', k: 'G' }, { c: '#1f9e97', k: 'H' }, { c: '#5a6b7a', k: 'I' }, { c: '#8a5a2b', k: 'J' }
];
export const LEVELS = { B: 'Beginner', I: 'Intermediate', X: 'Expert' };
export const initials = n => String(n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';

export function avatar(p, size = '') {
  const col = p && p.color ? p.color : '#ccc';
  return `<span class="av ${size}" style="--pc:${col}">${esc(initials(p && p.name))}</span>`;
}

// ---------- CSV + Google Sheet ----------
export function parseCSV(t) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim() !== ''));
}
function toObjects(rows) {
  if (!rows.length) return [];
  const h = rows[0].map(x => norm(x).replace(/ /g, '_'));
  return rows.slice(1).map(r => Object.fromEntries(h.map((k, i) => [k, String(r[i] ?? '').trim()])));
}
const TABS = {
  Trivia: ['question', 'answer', 'wrong1'],
  Categories: ['id', 'name'],
  People: ['name'],
  GuessWho: ['person', 'clue'],
  TwoTruths: ['person', 'truth1', 'lie'],
  Fibs: ['prompt', 'answer'],
  Quips: ['prompt'],
  Doodles: ['prompt']
};
const isOn = r => !/^(no|n|off|false|0|x)$/i.test(String(r.on || '').trim());

export async function loadContent() {
  const dev = new URLSearchParams(location.search).has('dev');
  let raw = {}, note = '';
  if (dev) {
    raw = await (await fetch('dev-content.json')).json();
    note = 'test questions';
  } else if (SHEET_ID) {
    await Promise.all(Object.keys(TABS).map(async tab => {
      try {
        const u = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(tab)}&_=${Date.now()}`;
        const rows = toObjects(parseCSV(await (await fetch(u)).text()));
        // gviz quietly returns the first tab when a tab is missing, so check the headers
        raw[tab] = rows.length && TABS[tab].every(k => k in rows[0]) ? rows : [];
      } catch (e) { raw[tab] = []; }
    }));
    note = 'the question sheet';
  }
  return buildContent(raw, note);
}

export function buildContent(raw, note = '') {
  const R = t => (raw[t] || []).filter(isOn);
  const cats = R('Categories').filter(c => c.id && c.name);
  const C = {
    note,
    categories: cats.length ? cats.map(c => ({ id: c.id, name: c.name, short: c.short || c.name, color: c.color || '#3a6fc4', t: c.text_color || '#fff' })) : [],
    trivia: R('Trivia').filter(r => r.question && r.answer && r.wrong1).map(r => ({
      level: /^x|exp/i.test(r.level) ? 'X' : /^b|beg/i.test(r.level) ? 'B' : 'I',
      cat: r.category || 'misc', q: r.question, a: r.answer,
      w: [r.wrong1, r.wrong2, r.wrong3].filter(Boolean), story: r.story || '', src: r.source || '',
      img: r.image || '', cal: (+r.cal_month && +r.cal_day) ? [+r.cal_month, +r.cal_day] : null
    })),
    people: R('People').map(p => ({ name: p.name, family: p.family || '', kid: /^y/i.test(p.kid || '') })).filter(p => p.name),
    guess: R('GuessWho').filter(r => r.person && (r.clue || r.image)).map(r => ({ person: r.person, clue: r.clue, img: r.image || '' })),
    truths: R('TwoTruths').filter(r => r.person && r.truth1 && r.truth2 && r.lie).map(r => ({ person: r.person, t: [r.truth1, r.truth2], lie: r.lie })),
    fibs: R('Fibs').filter(r => r.prompt && r.answer).map(r => ({ prompt: r.prompt, a: r.answer, story: r.story || '' })),
    quips: R('Quips').map(r => r.prompt).filter(Boolean),
    doodles: R('Doodles').map(r => r.prompt).filter(Boolean)
  };
  // categories present in trivia but missing from the Categories tab get a default look
  const known = new Set(C.categories.map(c => c.id));
  const spare = ['#d9485f', '#e07b1a', '#2bb3b1', '#3a6fc4', '#7a4fc9', '#e5a50a', '#c94f97', '#8a5a2b', '#25a06a', '#5a6b7a'];
  [...new Set(C.trivia.map(t => t.cat))].forEach((id, i) => { if (!known.has(id)) { C.categories.push({ id, name: id, short: id, color: spare[i % spare.length], t: '#fff' }); known.add(id); } });
  if (!C.quips.length) C.quips = DEFAULT_QUIPS.slice();
  if (!C.doodles.length) C.doodles = DEFAULT_DOODLES.slice();
  return C;
}

export function imgURL(v) {
  v = String(v || '').trim();
  if (!v) return '';
  // a pasted Google Drive share link: pull out the file id
  const m = v.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]{20,})/);
  if (m) v = m[1];
  else if (/^(https?:|data:)/.test(v) || /\.(jpe?g|png|webp|gif)$/i.test(v)) return v;
  return `https://lh3.googleusercontent.com/d/${encodeURIComponent(v)}=w1600`; // a Google Drive file id shared as "anyone with the link"
}

export const DEFAULT_QUIPS = [
  'A terrible name for a family minivan', 'The worst thing to find in a stocking', 'A rejected Thanksgiving side dish',
  'What the turkey is really thinking right now', 'A new rule for the kids’ table', 'The least helpful thing to say while carving the turkey',
  'A terrible flavor of pie', 'The real reason Grandpa disappears after dinner', 'A family vacation that should never happen again',
  'The worst gift to give your sister', 'What the dog would say about this family', 'A bad slogan for Idaho potatoes'
];
export const DEFAULT_DOODLES = [
  'A turkey in a Halloween costume', 'Grandpa asleep in a recliner', 'A pie that went wrong', 'A minivan full of kids',
  'Santa stuck in a chimney', 'A snowman at the beach', 'A dog stealing the turkey', 'A family road trip', 'A gingerbread house',
  'A potato with a mustache', 'An Easter egg hunt', 'A giant bowl of candy'
];

// ---------- drawing ----------
export const INK = ['#1d2a24', '#e2465d', '#2f7fd8', '#25a06a', '#e3a008', '#8d5bd6', '#8a5a2b', '#ffffff'];
export const PEN = [6, 14, 30];
// a drawing is a list of strokes; each stroke is a flat array: [inkIndex, penIndex, x1, y1, x2, y2, ...] in a 1000 x 1000 box
export function drawStrokes(cv, strokes, upto = Infinity) {
  const ctx = cv.getContext('2d'), s = cv.width / 1000;
  ctx.fillStyle = '#fffdf6'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  let left = upto;
  for (const st of arr(strokes)) {
    const a = arr(st); if (a.length < 4) continue;
    ctx.strokeStyle = INK[a[0]] || '#1d2a24'; ctx.lineWidth = (PEN[a[1]] || 10) * s;
    ctx.beginPath(); ctx.moveTo(a[2] * s, a[3] * s);
    if (a.length === 4) ctx.lineTo(a[2] * s + 0.1, a[3] * s);
    for (let i = 4; i < a.length; i += 2) { if (left-- <= 0) break; ctx.lineTo(a[i] * s, a[i + 1] * s); }
    ctx.stroke(); if (left <= 0) break;
  }
}
export function animateStrokes(cv, strokes, ms = 2600) {
  const total = arr(strokes).reduce((n, s) => n + Math.max(1, (arr(s).length - 2) / 2), 0);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !total) { drawStrokes(cv, strokes); return; }
  const t0 = performance.now();
  const step = t => { const k = Math.min(1, (t - t0) / ms); drawStrokes(cv, strokes, Math.ceil(total * k)); if (k < 1 && cv.isConnected) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

// ---------- calendar ring for Grandma's 2027 calendar pages ----------
export function calRing(m, d) {
  const off = new Date(2027, m - 1, 1).getDay(), idx = d - 1 + off, col = idx % 7, row = Math.floor(idx / 7);
  return `left:${1.24 + 13.31 * col}%;top:${17.41 + 13.34 * row}%;width:13.31%;height:13.34%`;
}
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
