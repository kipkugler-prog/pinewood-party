// Phone / player screen: join with a room code, then answer, draw and vote.
import { connect } from './net.js?v=20261116';
import { $, $$, esc, obj, arr, avatar, PCOLORS, LEVELS, INK, PEN, drawStrokes } from './common.js?v=20261116';
import { GAMES, TROPHY } from './games.js?v=20261116';

const KEY = 'pp-join';
let net, code = '', me = '', S = null, P = {}, mine = null, mineKey = '', shown = '', unsubs = [], pad = null, autoSent = '', lastPts = -1;
const room = p => `rooms/${code}${p ? '/' + p : ''}`;
const app = $('#app');
const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } })();
const save = o => { try { localStorage.setItem(KEY, JSON.stringify({ ...saved, ...o })); } catch (e) {} };

// little pine trees: one for Beginner, two for Intermediate, three for Expert
const TREE = 'M10 1 3.6 9.5h3L1.8 16h3.4L1 21.5h18L14.8 16h3.4l-4.8-6.5h3z';
const pines = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 ${20 + (n - 1) * 15} 25" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<g transform="translate(${i * 15} ${i === 1 ? 0 : 1.5})"><path d="${TREE}"/><rect x="8.6" y="21" width="2.8" height="3.4" rx=".6"/></g>`).join('')}</svg>`;
const LVL_HINT = {
  B: 'Easier questions, great for the little grandkids.',
  I: 'Middle-of-the-road questions for most of the family.',
  X: 'The toughest ones, for Grandma, Grandpa and the original four.'
};
const INK_NAMES = ['Black', 'Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Brown', 'White (eraser)'];
const ord = n => n + ((n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));

async function boot() {
  const qc = (new URLSearchParams(location.search).get('c') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  joinForm(qc || saved.code || '', '');
  try { net = await connect(); me = net.uid; } catch (e) { $('#jerr').textContent = 'Couldn’t connect. Check your internet, then reload.'; $('#jgo').textContent = 'Not connected'; return; }
  const go = $('#jgo'); if (go) { go.disabled = false; go.textContent = 'Join the game'; }
  // rejoin automatically after a reload if this phone was already in the room
  if (saved.code && (!qc || qc === saved.code)) {
    const p = await net.get(`rooms/${saved.code}/players/${me}`);
    if (p && p.name && !p.kicked) { code = saved.code; enter(p.name, p.level || 'I'); }
  }
}

function joinForm(c, err) {
  const lv = LEVELS[saved.level] ? saved.level : 'I';
  app.innerHTML = `
  <form class="join" id="jf" novalidate>
    <header class="jhead">${pines(3, 'jlogo')}<h1>Pinewood Party</h1><p class="jsub">Family game night, on your phone</p></header>
    <div class="jcard">
      <label for="jc" class="jlab">Room code <small>4 letters on the TV</small></label>
      <input id="jc" name="c" maxlength="4" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" enterkeyhint="next" value="${esc(c)}" placeholder="ABCD" required>
      <label for="jn" class="jlab">Your name</label>
      <input id="jn" name="n" maxlength="18" autocomplete="nickname" autocapitalize="words" enterkeyhint="go" value="${esc(saved.name || '')}" placeholder="What the family calls you" required>
      <span class="jlab" id="jll">Your level <small>for Pinewood Spin</small></span>
      <div class="seg" role="radiogroup" aria-labelledby="jll" aria-describedby="jhint">${Object.entries(LEVELS).map(([k, v], i) => `<button type="button" role="radio" data-lvl="${k}" aria-checked="${k === lv}" tabindex="${k === lv ? 0 : -1}">${pines(i + 1)}<span>${esc(v)}</span></button>`).join('')}</div>
      <select id="jl" name="l" class="vh" tabindex="-1" aria-hidden="true">${Object.entries(LEVELS).map(([k, v]) => `<option value="${k}"${lv === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
      <p class="hint" id="jhint">${LVL_HINT[lv]}</p>
      <p class="err" id="jerr" role="alert">${esc(err)}</p>
      <button class="go big" id="jgo" ${net ? '' : 'disabled'}>${net ? 'Join the game' : 'Connecting…'}</button>
    </div>
  </form>`;
  // room code: capital letters only, then hop to the name box
  const jc = $('#jc'), jn = $('#jn'), sel = $('#jl'), segs = $$('[data-lvl]');
  jc.oninput = () => { const v = jc.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); if (v !== jc.value) jc.value = v; $('#jerr').textContent = ''; if (v.length === 4 && !jn.value.trim() && document.activeElement === jc) jn.focus(); };
  jc.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); jn.focus(); } };
  jn.oninput = () => { $('#jerr').textContent = ''; };
  // level: segmented buttons that drive the (hidden) #jl select
  const paint = () => { for (const b of segs) { const on = b.dataset.lvl === sel.value; b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; } $('#jhint').textContent = LVL_HINT[sel.value] || ''; };
  segs.forEach((b, i) => {
    b.onclick = () => { sel.value = b.dataset.lvl; paint(); };
    b.onkeydown = e => { const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!d) return; e.preventDefault(); const n = segs[(i + d + segs.length) % segs.length]; sel.value = n.dataset.lvl; paint(); n.focus(); };
  });
  sel.onchange = sel.oninput = paint;
  $('#jf').onsubmit = async e => {
    e.preventDefault();
    const c2 = jc.value.toUpperCase().replace(/[^A-Z]/g, ''), n = jn.value.trim().slice(0, 18), l = sel.value;
    if (c2.length !== 4) { jc.focus(); return void ($('#jerr').textContent = 'Room codes are 4 letters. Check the TV.'); }
    if (!n) { jn.focus(); return void ($('#jerr').textContent = 'Type your name so the family knows who you are.'); }
    const go = $('#jgo'); go.disabled = true; go.textContent = 'Joining…'; $('#jerr').textContent = '';
    const meta = await net.get(`rooms/${c2}/meta`);
    if (!meta) { go.disabled = false; go.textContent = 'Join the game'; return void ($('#jerr').textContent = `No game with code ${c2}. Check the TV.`); }
    code = c2; enter(n, l);
  };
}

async function enter(name, level) {
  const ps = obj(await net.get(room('players')));
  if (Object.values(ps).filter(p => p && p.online !== false && p.name).length >= 18 && !ps[me]) { joinForm(code, 'This game is full (18 players).'); return; }
  const used = new Set(Object.entries(ps).filter(([u]) => u !== me).map(([, p]) => p && p.color));
  const color = (ps[me] && ps[me].color) || PCOLORS.find(c => !used.has(c)) || PCOLORS[Object.keys(ps).length % PCOLORS.length];
  const p = { name, level, color, joined: (ps[me] && ps[me].joined) || net.now(), online: true, kicked: null };
  await net.update(room('players/' + me), p);
  net.onDisconnectUpdate(room('players/' + me), { online: false });
  net.onConnected(ok => { if (ok && code) net.update(room('players/' + me), { online: true }); });
  save({ code, name, level });
  unsubs.forEach(u => u()); unsubs = [];
  unsubs.push(net.on(room('players'), v => {
    P = obj(v); const mp = P[me];
    if (mp && mp.kicked) { leave('You were removed from the game. You can join again.'); return; }
    renderTop();
  }));
  unsubs.push(net.on(room('state'), v => { S = v; watchMine(); render(); }));
  if (!window.__clock) window.__clock = setInterval(clock, 300);
  try { await navigator.wakeLock?.request('screen'); } catch (e) {}
}
function leave(msg) { unsubs.forEach(u => u()); unsubs = []; S = null; shown = ''; code = ''; lastPts = -1; save({ code: '' }); joinForm('', msg || ''); }

let mineUnsub = null;
function watchMine() {
  if (!S || mineKey === S.key) return;
  if (mineUnsub) mineUnsub(); mine = null; mineKey = S.key; const k = S.key;
  mineUnsub = net.on(room(`inputs/${k}/${me}`), v => { if (mineKey !== k) return; const was = !!mine; mine = v; if (!!v !== was) render(); });
}

// points in the header: this game's score while a game is on, the Family Cup in the lobby
function myPoints() {
  if (!S) return 0;
  if (S.game === 'lobby' || !GAMES[S.game]) return obj(S.cup)[me] || 0;
  return obj(S.phase === 'final' ? obj(S.view).scores : obj(S.g).scores)[me] || 0;
}
const here = () => Object.values(P).filter(p => p && p.name && p.online !== false && !p.kicked);
function playersRow() {
  const ps = here();
  return `<span class="avs">${ps.slice(0, 18).map(p => avatar(p, 'sm')).join('')}</span><span>${ps.length} player${ps.length === 1 ? '' : 's'} here</span>`;
}

function renderTop() {
  const t = $('#topinfo'); if (!t || !P[me]) return;
  const p = P[me], pts = myPoints(), bump = lastPts >= 0 && pts > lastPts;
  t.innerHTML = `${avatar(p)}<span class="who"><span class="tn">${esc(p.name)}</span>${pts ? `<span class="tp${bump ? ' bump' : ''}">${pts.toLocaleString()} pts</span>` : `<span class="tl">${esc(LEVELS[p.level] || '')}</span>`}</span><button class="leave" id="leave" type="button">Leave</button>`;
  lastPts = pts;
  $('#leave').onclick = e => { const b = e.currentTarget; if (b.dataset.arm) { net.update(room('players/' + me), { online: false }); leave(''); } else { b.dataset.arm = 1; b.textContent = 'Tap again'; setTimeout(() => { if (b.isConnected) { delete b.dataset.arm; b.textContent = 'Leave'; } }, 3000); } };
  const pl = $('#ppl'); if (pl) pl.innerHTML = playersRow();
}

function lobbyView() {
  const p = P[me] || {};
  return `<div class="wait lobbyw"><div class="meav" style="--pc:${esc(p.color || '#45c6bf')}">${avatar(p, 'lg')}</div><h2>You're in!</h2><p>Watch the TV. The game starts soon.</p><div class="chips"><span class="chip">Room <b>${esc(code)}</b></span>${LEVELS[p.level] ? `<span class="chip">${pines({ B: 1, I: 2, X: 3 }[p.level])}${esc(LEVELS[p.level])}</span>` : ''}</div><div class="ppl" id="ppl">${playersRow()}</div></div>`;
}
function finalView() {
  const sc = obj(S.view && S.view.scores), rows = Object.entries(sc).sort((a, b) => b[1] - a[1]);
  if (!(me in sc)) return `<div class="res ok final"><div class="place">${pines(3)}</div><h2>Game over</h2><p class="rline">Look at the TV for the Family Cup.</p></div>`;
  const my = sc[me] || 0, rank = 1 + rows.filter(([, v]) => v > my).length, tied = rows.filter(([, v]) => v === my).length > 1;
  const win = rank === 1 && my > 0;
  const title = win ? (tied ? 'You tied for first!' : 'You won!') : `You came in ${ord(rank)}${tied ? ' (tie)' : ''}`;
  return `<div class="res ok final${win ? ' win' : ''}">${win ? TROPHY : `<div class="place r${Math.min(rank, 4)}">#${rank}</div>`}<h2>${title}</h2><p class="pts">${my.toLocaleString()}<small> pts</small></p><p class="rline">Look at the TV for the Family Cup.</p></div>`;
}

function render() {
  if (!S || !code) return;
  const sig = `${S.key}|${S.phase}|${mine ? 1 : 0}`;
  if (sig === shown) { renderTop(); return; }
  shown = sig; autoSent = ''; pad = null;
  const g = GAMES[S.game], inGame = g && S.game !== 'lobby';
  let body;
  if (!inGame) body = lobbyView();
  else if (S.phase === 'final') body = finalView();
  else body = g.phone(S, me, mine, P) || '';
  const v = obj(S.view), n = v.n || v.turn, of = v.of;
  const tag = inGame ? `<p class="pgame"><i></i><span>${esc(g.name)}</span>${n && of && S.phase !== 'final' ? `<span class="pstep">${n} of ${of}</span>` : ''}</p>` : '';
  app.innerHTML = `<header class="ptop"><span class="topinfo" id="topinfo"></span><span class="ptimer" id="ptimer" hidden></span></header><main class="pmain" data-game="${esc(S.game)}" data-phase="${esc(S.phase)}" style="--gc:${g ? g.color : '#45c6bf'}">${tag}<div class="pbody">${body}</div></main>`;
  renderTop(); bind(); clock();
}

function submit(v) {
  if (!S || mine) return;
  const k = S.key; mine = v; shown = ''; render();
  net.set(room(`inputs/${k}/${me}`), v);
}
function bind() {
  const g = GAMES[S.game];
  for (const b of $$('[data-choice]')) b.onclick = () => { if (!b.disabled) submit({ a: +b.dataset.choice, t: net.now() }); };
  // Pinewood Spin helpers: ask the TV for a 50/50, or read the question aloud on this phone
  const fb = $('[data-fifty]');
  if (fb) fb.onclick = () => { fb.disabled = true; fb.textContent = 'One moment…'; net.update(room('players/' + me), { fifty: S.key }); };
  const sb = $('[data-say]');
  if (sb) {
    if (!('speechSynthesis' in window)) sb.hidden = true;
    sb.onclick = () => {
      if (!('speechSynthesis' in window)) return;
      const v = S.view || {}, gone = arr(v.gone);
      const opts = arr(v.opts).map((o, i) => gone.includes(i) ? '' : `${'ABCDEFGHIJ'[i]}: ${o}.`).filter(Boolean).join(' ');
      try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(`${v.q || ''} ${opts}`); u.rate = .92; speechSynthesis.speak(u); } catch (e) {}
    };
  }
  const f = $('form[data-form]');
  if (f) {
    const ins = $$('input', f);
    // Enter in the first of two boxes moves on to the next box instead of sending
    ins.forEach((inp, k) => { if (k < ins.length - 1) inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); ins[k + 1].focus(); } }; });
    f.oninput = () => { const el = $('.err', f); if (el) el.textContent = ''; };
    f.onsubmit = e => {
      e.preventDefault();
      const vals = Object.fromEntries(new FormData(f).entries()); for (const k in vals) vals[k] = String(vals[k]).trim();
      const err = g && g.validate ? g.validate(S, me, vals) : '';
      if (err) { let el = $('.err', f); if (!el) { el = document.createElement('p'); el.className = 'err'; f.appendChild(el); } el.textContent = err; return; }
      submit(vals);
    };
  }
  if ($('#pad')) setupPad();
}
function clock() {
  const t = $('#ptimer'); if (!t || !S) return;
  if (S.deadline && S.dur) {
    const left = S.deadline - net.now(); t.hidden = false; t.textContent = Math.max(0, Math.ceil(left / 1000)); t.classList.toggle('low', left < 5500);
    t.style.setProperty('--p', Math.max(0, Math.min(1, left / (S.dur * 1000))).toFixed(3));
    // send what's there just before time runs out
    if (left < 1500 && !mine && autoSent !== S.key) {
      if (pad && pad.strokes.length) { autoSent = S.key; submit({ s: pad.strokes }); }
      const f = $('form[data-form]');
      if (f && $$('input', f).some(i => i.value.trim())) { autoSent = S.key; const vals = Object.fromEntries([...new FormData(f).entries()].map(([k, v]) => [k, String(v).trim()])); const g = GAMES[S.game]; if (!(g.validate && g.validate(S, me, vals))) submit(vals); }
    }
  } else t.hidden = true;
}

// ---------- drawing pad ----------
function setupPad() {
  const cv = $('#pad'); pad = { strokes: [], ink: 0, pen: 1 };
  const inks = $('#inks'), pens = $('#pens') || inks, done = $('#done'), undo = $('#undo'), clear = $('#clear');
  const penHTML = PEN.map((w, i) => `<button type="button" class="pen${i === 1 ? ' on' : ''}" data-pen="${i}" aria-label="${['Thin', 'Medium', 'Thick'][i]} brush" aria-pressed="${i === 1}"><i style="--d:${[6, 11, 18][i]}px"></i></button>`).join('');
  inks.innerHTML = INK.map((c, i) => `<button type="button" class="ink${i === 0 ? ' on' : ''}" data-ink="${i}" style="--ic:${c}" aria-label="${INK_NAMES[i] || 'Color ' + (i + 1)}" aria-pressed="${i === 0}"></button>`).join('') + (pens === inks ? penHTML : '');
  if (pens !== inks) pens.innerHTML = penHTML;
  const tint = () => { for (const p of $$('.pen', pens)) p.style.setProperty('--ic', INK[pad.ink]); };
  const choose = e => {
    const b = e.target.closest('button'); if (!b || !pad) return;
    if (b.dataset.ink) { pad.ink = +b.dataset.ink; $$('.ink', inks).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); tint(); }
    if (b.dataset.pen) { pad.pen = +b.dataset.pen; $$('.pen', pens).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); }
  };
  inks.onclick = choose; if (pens !== inks) pens.onclick = choose;
  tint();
  const sync = () => { const none = !pad || !pad.strokes.length; done.disabled = none; undo.disabled = none; clear.disabled = none; };
  drawStrokes(cv, []); sync();
  // the pad is square and as wide as the screen; on short screens shrink it so "I'm done" stays in view
  const fit = () => {
    if (!cv.isConnected) { removeEventListener('resize', fit); return; }
    cv.style.width = '';
    const over = document.scrollingElement.scrollHeight - innerHeight;
    if (over > 0) cv.style.width = Math.max(220, Math.floor(cv.getBoundingClientRect().width - over)) + 'px';
  };
  fit(); requestAnimationFrame(fit); setTimeout(fit, 400); addEventListener('resize', fit);
  let cur = null, total = 0;
  const pt = e => { const r = cv.getBoundingClientRect(); return [Math.round((e.clientX - r.left) / r.width * 1000), Math.round((e.clientY - r.top) / r.height * 1000)]; };
  cv.onpointerdown = e => { if (!pad) return; e.preventDefault(); cv.setPointerCapture(e.pointerId); const [x, y] = pt(e); cur = [pad.ink, pad.pen, x, y]; pad.strokes.push(cur); drawStrokes(cv, pad.strokes); sync(); };
  cv.onpointermove = e => { if (!cur || !pad || total > 9000) return; const [x, y] = pt(e), lx = cur[cur.length - 2], ly = cur[cur.length - 1]; if (Math.abs(x - lx) + Math.abs(y - ly) < 5) return; cur.push(x, y); total++; drawStrokes(cv, pad.strokes); };
  cv.onpointerup = cv.onpointercancel = () => { cur = null; };
  undo.onclick = () => { if (!pad) return; pad.strokes.pop(); drawStrokes(cv, pad.strokes); sync(); };
  clear.onclick = () => { if (!pad) return; pad.strokes = []; drawStrokes(cv, pad.strokes); sync(); };
  done.onclick = () => { if (!pad || !pad.strokes.length) return; submit({ s: pad.strokes }); pad = null; };
}

boot();
