// TV / host screen. The TV runs the game: it owns the room, the timers and the scoring.
import { connect } from './net.js';
import { $, $$, esc, clean, obj, arr, loadContent, avatar, animateStrokes, PCOLORS } from './common.js';
import { GAMES, ORDER, rankTV } from './games.js';

const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const ROOMKEY = 'pp-host-room';
let net, code, S, P = {}, C = null, INPUTS = {}, ART = {}, inUnsub = null, artUnsub = null, artKey = '', advancing = '', armed = '';

const joinURL = () => location.href.replace(/tv\.html.*$/, '').replace(/[?#].*$/, '');
const shortURL = () => joinURL().replace(/^https?:\/\//, '').replace(/\/$/, '');
const room = p => `rooms/${code}${p ? '/' + p : ''}`;

async function boot() {
  $('#stage').innerHTML = `<div class="center"><h2 class="qbig">Setting up the room…</h2></div>`;
  try { net = await connect(); } catch (e) { $('#stage').innerHTML = `<div class="center"><h2 class="qbig">Couldn't connect</h2><p class="sub">Check the internet connection, then reload this page.</p></div>`; return; }
  // resume this TV's room if it still exists
  let saved = ''; try { saved = localStorage.getItem(ROOMKEY) || ''; } catch (e) {}
  if (saved) { const meta = await net.get(`rooms/${saved}/meta`); if (meta && meta.host === net.uid) { code = saved; S = await net.get(`rooms/${saved}/state`); } }
  if (!code || !S) {
    for (let tries = 0; tries < 20; tries++) { const c = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join(''); if (!(await net.get(`rooms/${c}/meta`))) { code = c; break; } }
    await net.set(room(), { meta: { host: net.uid, created: net.now(), v: 1 } });
    S = { v: 1, game: 'lobby', phase: 'lobby', key: 'lobby', n: 0, cup: {}, view: {}, seq: 0 };
    await net.set(room('state'), S);
    try { localStorage.setItem(ROOMKEY, code); } catch (e) {}
  }
  S.cup = obj(S.cup);
  net.on(room('players'), v => { P = obj(v); onPlayers(); });
  loadQuestions();
  watchInputs(); render();
  setInterval(tick, 250);
  try { await navigator.wakeLock?.request('screen'); } catch (e) {}
  document.addEventListener('visibilitychange', async () => { if (document.visibilityState === 'visible') try { await navigator.wakeLock?.request('screen'); } catch (e) {} });
}

async function loadQuestions() {
  C = null; renderLobbyParts();
  try { C = await loadContent(); } catch (e) { C = { error: true, trivia: [], categories: [], people: [], guess: [], truths: [], fibs: [], quips: [], doodles: [] }; }
  renderLobbyParts();
}

// ---------- host API for the games ----------
const online = () => Object.entries(P).filter(([, p]) => p && p.online !== false && p.name).map(([uid, p]) => ({ uid, ...p })).sort((a, b) => (a.joined || 0) - (b.joined || 0));
const H = {
  get S() { return S; }, get C() { return C; }, get P() { return P; }, get inputs() { return INPUTS; },
  online, now: () => net.now(),
  phase(name, { dur = 0, auto = 0, expect = null, view = {} } = {}) {
    S.n = (S.n || 0) + 1; S.phase = name; S.key = `${S.game}-${S.n}`; S.view = clean(view);
    S.expect = expect ? Object.fromEntries(expect.filter(Boolean).map(u => [u, true])) : null;
    S.dur = dur; S.deadline = dur ? net.now() + dur * 1000 : auto ? net.now() + auto * 1000 : null;
  },
  finish() {
    const g = S.g; if (!g.cupAdded) { for (const [u, v] of Object.entries(obj(g.scores))) S.cup[u] = (S.cup[u] || 0) + v; g.cupAdded = true; }
    H.phase('final', { view: { scores: obj(g.scores) } });
  }
};

function commit() { S.seq = (S.seq || 0) + 1; net.set(room('state'), clean(S)); watchInputs(); render(); }
function watchInputs() {
  if (inUnsub && inUnsub.key === S.key) return;
  if (inUnsub) inUnsub(); INPUTS = {};
  const k = S.key; const un = net.on(room('inputs/' + k), v => { if (S.key !== k) return; INPUTS = obj(v); onInputs(); }); inUnsub = un; inUnsub.key = k;
  const dk = S.g && S.g.drawKey;
  if (dk && dk !== artKey) { if (artUnsub) artUnsub(); artKey = dk; artUnsub = net.on(room('inputs/' + dk), v => { ART = Object.fromEntries(Object.entries(obj(v)).map(([u, x]) => [u, obj(x).s])); drawArt(); }); }
}
function startGame(id, opts) {
  const ps = online(); if (!ps.length || !C) return;
  S.game = id; S.g = {}; S.view = {}; GAMES[id].start(H, opts); commit();
}
function toLobby() {
  S.game = 'lobby'; S.phase = 'lobby'; S.n = (S.n || 0) + 1; S.key = 'lobby-' + S.n; S.g = null; S.view = {}; S.expect = null; S.deadline = null;
  net.remove(room('inputs')); ART = {}; artKey = ''; if (artUnsub) { artUnsub(); artUnsub = null; }
  commit();
}
function advance() {
  if (S.game === 'lobby' || S.phase === 'final' || advancing === S.key) return;
  advancing = S.key; GAMES[S.game].next(H); commit();
}

// ---------- timing ----------
function expectedOnline() { return Object.keys(obj(S.expect)).filter(u => P[u] && P[u].online !== false); }
function onInputs() {
  renderProgress();
  if (S.expect) { const ex = expectedOnline(); if (ex.length && ex.every(u => INPUTS[u])) { const k = S.key; setTimeout(() => { if (S.key === k) advance(); }, 800); } }
}
function onPlayers() {
  if (S.game === 'lobby') renderLobbyParts(); else renderProgress();
  if (S.expect) onInputs();
}
function tick() {
  const t = $('#timer');
  if (S.deadline && S.dur) { const s = Math.max(0, Math.ceil((S.deadline - net.now()) / 1000)); t.textContent = s; t.hidden = false; t.classList.toggle('low', s <= 5); }
  else t.hidden = true;
  if (S.deadline && net.now() >= S.deadline) advance();
}

// ---------- rendering ----------
let shownKey = '';
function render() {
  const game = GAMES[S.game];
  $('#gname').textContent = game ? game.name : '';
  $('#joinbar').innerHTML = `Join at <b>${esc(shortURL())}</b> · code <b class="code">${esc(code)}</b>`;
  $('#joinbar').hidden = S.game === 'lobby';
  $('#ctrl').hidden = S.game === 'lobby';
  $('#next').hidden = S.phase === 'final'; $('#end').hidden = S.phase === 'final';
  document.body.dataset.game = S.game;
  if (shownKey === S.key + ':' + S.phase && S.game !== 'lobby') { renderProgress(); return; }
  shownKey = S.key + ':' + S.phase;
  if (S.game === 'lobby') { renderLobby(); return; }
  if (S.phase === 'final') {
    const g = GAMES[S.game];
    $('#stage').innerHTML = `<div class="finalwrap">${rankTV(S.view.scores, P, `${g.name}: final scores`, 12)}<div class="finalside">${rankTV(S.cup, P, 'Family Cup (all games tonight)', 8)}<button class="go big" id="tolobby">Back to the game menu</button></div></div>`;
    $('#tolobby').onclick = toLobby; renderProgress(); return;
  }
  $('#stage').innerHTML = `<div class="anim" data-phase="${esc(S.phase)}" style="--gc:${game.color}">${game.tv(S, P) || ''}</div>`;
  after(); renderProgress();
}
function after() {
  drawArt();
  const w = $('.wheel svg[data-to]');
  if (w) { const to = +w.dataset.to; requestAnimationFrame(() => requestAnimationFrame(() => { w.style.transition = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'none' : 'transform 3s cubic-bezier(.15,.75,.2,1)'; w.style.transform = `rotate(${to}deg)`; })); }
}
function drawArt() { for (const cv of $$('canvas[data-art]')) { const u = cv.dataset.art; if (ART[u] && cv.dataset.drawn !== '1') { cv.dataset.drawn = '1'; animateStrokes(cv, ART[u], S.phase === 'title' ? 2600 : 1); } } }
function renderProgress() {
  const el = $('#progress'); if (!el) return;
  if (!S.expect || S.game === 'lobby') { el.innerHTML = ''; return; }
  const ex = Object.keys(obj(S.expect)).filter(u => P[u]); const done = ex.filter(u => INPUTS[u]).length;
  el.innerHTML = `<span class="pcount">${done} of ${ex.length} in</span>${ex.map(u => `<span class="pdot${INPUTS[u] ? ' on' : ''}${P[u].online === false ? ' gone' : ''}" title="${esc(P[u].name)}">${avatar(P[u], 'sm')}</span>`).join('')}`;
}

// ---------- lobby ----------
function renderLobby() {
  $('#stage').innerHTML = `
  <div class="lobby">
    <section class="joinpanel">
      <h1>Pinewood Party</h1>
      <p class="how">On your phone, go to</p>
      <p class="url">${esc(shortURL())}</p>
      <p class="how">and enter code</p>
      <p class="bigcode">${esc(code)}</p>
      <div id="qr" class="qr" aria-label="QR code to join"></div>
      <div id="lplayers" class="lplayers"></div>
    </section>
    <section class="menu">
      <div id="cstatus" class="cstatus"></div>
      <div id="cards" class="cards"></div>
      <div id="cupbox"></div>
    </section>
  </div>`;
  try { if (window.QRCode) new QRCode($('#qr'), { text: joinURL() + '?c=' + code, width: 220, height: 220, colorDark: '#1d2a24', colorLight: '#ffffff' }); else $('#qr').hidden = true; } catch (e) { $('#qr').hidden = true; }
  $('#cards').innerHTML = ORDER.map(id => {
    const g = GAMES[id];
    return `<article class="gcard" data-g="${id}" style="--gc:${g.color}"><h3>${esc(g.name)}</h3><p>${esc(g.blurb)}</p><div class="sets">${g.settings.map(s => `<label>${esc(s.label)}<select data-k="${s.k}" id="s-${id}-${s.k}">${s.opts.map(([v, t]) => `<option value="${v}"${v === s.def ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`).join('')}</div><p class="why"></p><button class="go" data-play="${id}">Play</button></article>`;
  }).join('');
  $('#cards').onclick = e => {
    const b = e.target.closest('[data-play]'); if (!b || b.disabled) return;
    const id = b.dataset.play, card = b.closest('.gcard'), opts = {};
    $$('select', card).forEach(s => { opts[s.dataset.k] = isNaN(+s.value) ? s.value : +s.value; });
    startGame(id, opts);
  };
  renderLobbyParts();
}
function renderLobbyParts() {
  if (S.game !== 'lobby' || !$('#lplayers')) return;
  const ps = online();
  $('#lplayers').innerHTML = ps.length ? `<h3>${ps.length} player${ps.length === 1 ? '' : 's'} in</h3><div class="ptiles">${ps.map(p => `<button class="ptile${armed === p.uid ? ' armed' : ''}" data-kick="${p.uid}" title="Tap twice to remove">${avatar(p)}<span>${esc(p.name)}</span><small>${armed === p.uid ? 'Tap again to remove' : ''}</small></button>`).join('')}</div>` : `<h3>Waiting for players…</h3>`;
  $('#lplayers').onclick = e => {
    const b = e.target.closest('[data-kick]'); if (!b) return; const u = b.dataset.kick;
    if (armed === u) { armed = ''; net.update(room('players/' + u), { online: false, kicked: true }); } else { armed = u; setTimeout(() => { if (armed === u) { armed = ''; renderLobbyParts(); } }, 3000); }
    renderLobbyParts();
  };
  const cs = $('#cstatus');
  if (!C) cs.innerHTML = `Loading questions…`;
  else if (C.error) cs.innerHTML = `Couldn't load the question sheet. <button class="link" id="reload">Try again</button>`;
  else cs.innerHTML = `Loaded from ${esc(C.note || 'built-in prompts')}: ${C.trivia.length} trivia · ${C.truths.length} two-truths · ${C.guess.length} guess-who · ${C.fibs.length} fibs · ${C.quips.length} quips · ${C.doodles.length} doodles <button class="link" id="reload">Reload questions</button>`;
  const rl = $('#reload'); if (rl) rl.onclick = loadQuestions;
  for (const card of $$('.gcard')) {
    const g = GAMES[card.dataset.g], why = !C ? 'Loading…' : !ps.length ? 'Waiting for players to join' : g.check(C, ps);
    $('.why', card).textContent = why; $('[data-play]', card).disabled = !!why;
  }
  const hasCup = Object.keys(S.cup).length;
  $('#cupbox').innerHTML = hasCup ? `${rankTV(S.cup, P, 'Family Cup', 8)}<button class="link" id="resetcup">${armed === 'cup' ? 'Tap again to reset the Family Cup' : 'Reset the Family Cup'}</button>` : '';
  const rc = $('#resetcup'); if (rc) rc.onclick = () => { if (armed === 'cup') { armed = ''; S.cup = {}; commit(); } else { armed = 'cup'; renderLobbyParts(); setTimeout(() => { if (armed === 'cup') { armed = ''; renderLobbyParts(); } }, 3000); } };
}

// ---------- host controls ----------
$('#next').onclick = () => { if (S.game !== 'lobby') { advancing = ''; advance(); } };
$('#end').onclick = e => {
  const b = e.currentTarget;
  if (b.dataset.arm) { delete b.dataset.arm; b.textContent = 'End game'; if (S.g && S.g.scores) H.finish(); else S.phase = 'final'; commit(); }
  else { b.dataset.arm = '1'; b.textContent = 'Tap again to end'; setTimeout(() => { delete b.dataset.arm; b.textContent = 'End game'; }, 3000); }
};
$('#newroom').onclick = e => {
  const b = e.currentTarget;
  if (b.dataset.arm) { try { localStorage.removeItem(ROOMKEY); } catch (x) {} location.reload(); }
  else { b.dataset.arm = '1'; b.textContent = 'Tap again for a new room code'; setTimeout(() => { delete b.dataset.arm; b.textContent = 'New room'; }, 3000); }
};
boot();
