// TV / host screen. The TV runs the game: it owns the room, the timers and the scoring.
import { connect } from './net.js?v=20261124';
import { $, $$, esc, clean, obj, arr, loadContent, avatar, animateStrokes, PCOLORS } from './common.js?v=20261124';
import { GAMES, ORDER, rankTV, TROPHY, champLine } from './games.js?v=20261124';

const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const ROOMKEY = 'pp-host-room';
let net, code, S, P = {}, C = null, INPUTS = {}, ART = {}, inUnsub = null, artUnsub = null, artKey = '', advancing = '', armed = '';

const joinURL = () => location.href.replace(/tv\.html.*$/, '').replace(/[?#].*$/, '');
const shortURL = () => joinURL().replace(/^https?:\/\//, '').replace(/\/$/, '');
const room = p => `rooms/${code}${p ? '/' + p : ''}`;

// TV-only card copy: a one-line tagline and a "what it needs" chip per game (the long blurb stays as the tooltip)
const ICON = {
  trivia: '<circle cx="12" cy="12" r="9.5"/><path d="M9.2 9.3a2.9 2.9 0 1 1 4.3 2.5c-.9.5-1.5 1.1-1.5 2.1v.6"/><circle cx="12" cy="17.6" r=".6" fill="currentColor"/>',
  spin: '<circle cx="12" cy="12" r="9.5"/><path d="M12 2.5v19M2.5 12h19M5.3 5.3l13.4 13.4M18.7 5.3 5.3 18.7"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/>',
  doodle: '<path d="M4 20l1.2-4.6L16.4 4.2a2.2 2.2 0 0 1 3.1 0l.3.3a2.2 2.2 0 0 1 0 3.1L8.6 18.8z"/><path d="M14.5 6l3.5 3.5"/>',
  truths: '<path d="M4 6.5l1.6 1.6L8.8 5M4 12.5l1.6 1.6 3.2-3.1M4.6 17.4l3.6 3.6M8.2 17.4l-3.6 3.6M12 6.6h8M12 12.6h8M12 19.2h8"/>',
  guess: '<circle cx="12" cy="8.2" r="4.2"/><path d="M4 21c.8-4.4 4-6.6 8-6.6s7.2 2.2 8 6.6"/>',
  memory: '<rect x="2.6" y="4.6" width="9.6" height="13.6" rx="2" transform="rotate(-9 7.4 11.4)"/><rect x="11.6" y="5.4" width="9.6" height="13.6" rx="2"/><circle cx="16.4" cy="10.4" r="1.9"/><path d="M13.9 15.6c.5-1.3 1.3-1.9 2.5-1.9s2 .6 2.5 1.9"/>',
  fibs: '<path d="M5 3.5h10l4 4V20.5H5z"/><path d="M8.5 11h7M8.5 15.5h2.5M13.5 15.5h2"/>',
  quip: '<path d="M3.5 5h11v7.5h-6l-3.5 3v-3H3.5z"/><path d="M17 8.5h3.5v7.5H19v3l-3.5-3h-5v-1.5"/>',
  classic: '<rect x="2.5" y="4.5" width="19" height="13" rx="2"/><path d="M8 21h8M12 17.5V21"/>'
};
const CARD = {
  trivia: { tag: 'Fastest right answer wins', need: 'All play' },
  spin: { tag: 'Your turn at the wheel', need: 'Take turns' },
  doodle: { tag: 'Draw it, then fib about it', need: '3+ players' },
  truths: { tag: 'Spot the lie in three', need: 'All play' },
  guess: { tag: 'Whose answer is this?', need: 'All play' },
  memory: { tag: 'Find the matching babies', need: 'Take turns' },
  fibs: { tag: 'Fool everyone with a fake', need: '2+ players' },
  quip: { tag: 'Funniest answer wins', need: '3+ players' }
};
const SHORTLABEL = { 'Drawings to judge': 'Drawings', 'Turns each': 'Turns each', Difficulty: 'Level' };
const svgIcon = id => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICON[id] || ''}</svg>`;
const PHONE = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg>';
const SCREEN = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="2.5" y="4.5" width="19" height="13" rx="2"/><path d="M9 21h6"/></svg>';

// keep the join address on one line: shrink it until it fits its box (never break mid-word)
function fitURL() {
  const el = $('.joinpanel .url'); if (!el) return;
  el.style.fontSize = ''; el.classList.remove('wrap'); el.querySelectorAll('wbr').forEach(w => w.remove()); // (Chrome breaks at <wbr> even with nowrap)
  const max = parseFloat(getComputedStyle(el).fontSize), min = 13;
  let fs = max;
  for (let i = 0; i < 4 && el.scrollWidth > el.clientWidth + 1; i++) { fs = Math.max(min, Math.floor(fs * el.clientWidth / el.scrollWidth * 10) / 10 - .2); el.style.fontSize = fs + 'px'; }
  if (el.scrollWidth > el.clientWidth + 1) { // a phone-sized window: allow a break only after a slash
    el.classList.add('wrap'); el.querySelectorAll('span').forEach((s, i) => { if (i) s.before(document.createElement('wbr')); });
  }
  const bc = $('.joinpanel .bigcode'); // wide letters (W, M) in the room code: shrink to fit beside the QR
  if (bc) { bc.style.fontSize = ''; if (bc.scrollWidth > bc.clientWidth + 1) bc.style.fontSize = Math.floor(parseFloat(getComputedStyle(bc).fontSize) * bc.clientWidth / bc.scrollWidth) - 1 + 'px'; }
}
// a big family on a small screen: tighten the player tiles only if they would not fit
function fitPlayers() {
  const box = $('#lplayers'), t = $('#lplayers .ptiles'); if (!box || !t) return;
  const over = () => t.offsetTop + t.offsetHeight > box.clientHeight + 1; // layout boxes, so the join "pop" animation doesn't skew it
  t.classList.remove('dense', 'denser');
  if (over()) t.classList.add('dense');
  if (over()) t.classList.add('denser');
}
const seenTiles = new Set();
let fitT = 0;
addEventListener('resize', () => { clearTimeout(fitT); fitT = setTimeout(() => { fitURL(); fitPlayers(); }, 60); });
document.fonts?.ready?.then(() => { fitURL(); fitPlayers(); });

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
  try { C = await loadContent(); } catch (e) { C = { error: true, trivia: [], categories: [], people: [], guess: [], truths: [], fibs: [], quips: [], doodles: [], babies: [] }; }
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
  const gm = GAMES[S.game]; if (gm && gm.onPlayers && S.phase !== 'final' && gm.onPlayers(H)) { commit(); return; }
  if (S.expect) onInputs();
}
function tick() {
  const t = $('#timer');
  if (S.deadline && S.dur) { const ms = Math.max(0, S.deadline - net.now()), s = Math.ceil(ms / 1000); t.textContent = s; t.hidden = false; t.classList.toggle('low', s <= 5); t.style.setProperty('--p', Math.min(1, ms / (S.dur * 1000)).toFixed(3)); }
  else t.hidden = true;
  if (S.deadline && net.now() >= S.deadline) advance();
}

// ---------- rendering ----------
let shownKey = '';
function render() {
  const game = GAMES[S.game];
  $('#gname').textContent = game ? game.name : '';
  $('#joinbar').innerHTML = `<span>Join at</span> <b>${esc(shortURL())}</b> <span>code</span> <b class="code">${esc(code)}</b>`;
  $('#joinbar').hidden = S.game === 'lobby';
  $('#ctrl').hidden = S.game === 'lobby';
  $('#next').hidden = S.phase === 'final'; $('#end').hidden = S.phase === 'final';
  document.body.dataset.game = S.game;
  document.body.dataset.phase = S.phase || '';
  if (game) document.body.style.setProperty('--gc', game.color); else document.body.style.removeProperty('--gc');
  if (shownKey === S.key + ':' + S.phase && S.game !== 'lobby') { renderProgress(); return; }
  shownKey = S.key + ':' + S.phase;
  if (S.game === 'lobby') { renderLobby(); return; }
  if (S.phase === 'final') {
    const g = GAMES[S.game], scores = obj(S.view && S.view.scores), won = Object.values(scores).some(v => v > 0);
    const confetti = won ? `<div class="confetti" aria-hidden="true">${Array.from({ length: 26 }, (_, i) => `<i style="--x:${(i * 37 + 11) % 100}%;--d:${(i % 7) * .22}s;--r:${(i * 53) % 360}deg;--c:${['#ffd23f', '#45c6bf', '#ff7aa8', '#ffffff', '#ffa94d', '#b9a3ff'][i % 6]}"></i>`).join('')}</div>` : '';
    $('#stage').innerHTML = `<div class="finalwrap">${confetti}<div class="champ">${TROPHY}<div><p class="kick">${esc(g.name)}</p><h2>${esc(champLine(scores, P))}</h2></div></div><div class="finalmain">${rankTV(scores, P, 'Final scores', 10)}</div><div class="finalside">${rankTV(S.cup, P, 'Family Cup · all games tonight', 8)}<button class="go big" id="tolobby">Back to the game menu</button></div></div>`;
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
    <section class="joinpanel" aria-label="How to join">
      <h1>Pinewood Party</h1>
      <div class="joinbox">
        <p class="how"><i>1</i>On your phone, go to</p>
        <p class="url">${shortURL().split('/').map(s => `<span>${esc(s)}</span>`).join('/')}</p>
        <div class="codeblock">
          <p class="how"><i>2</i>Enter the room code</p>
          <p class="bigcode">${esc(code)}</p>
        </div>
        <div id="qr" class="qr" aria-label="QR code to join"></div>
      </div>
      <div id="lplayers" class="lplayers"></div>
      <figure class="lsnap" aria-hidden="true"><div class="pol"><img src="img/family-2021.jpg" alt=""><span>The whole gang, July 2021</span></div></figure>
    </section>
    <section class="menu" aria-label="Games">
      <h2 class="menuhead">Pick a game</h2>
      <div id="cards" class="cards"></div>
      <div id="cupbox"></div>
    </section>
    <footer class="lobbyfoot"><div id="cstatus" class="cstatus"></div></footer>
  </div>`;
  try { if (window.QRCode) new QRCode($('#qr'), { text: joinURL() + '?c=' + code, width: 220, height: 220, colorDark: '#1d2a24', colorLight: '#ffffff' }); else $('#qr').hidden = true; } catch (e) { $('#qr').hidden = true; }
  $('#cards').innerHTML = ORDER.map(id => {
    const g = GAMES[id], c = CARD[id] || { tag: '', need: '' };
    return `<article class="gcard" data-g="${id}" style="--gc:${g.color}" title="${esc(g.blurb)}"><header><span class="gico">${svgIcon(id)}</span><h3>${esc(g.name)}</h3></header><p class="tag">${esc(c.tag || g.blurb)}</p><p class="need">${PHONE}${esc(c.need)}</p><div class="sets">${g.settings.map(s => `<label><span>${esc(SHORTLABEL[s.label] || s.label)}</span><select data-k="${s.k}" id="s-${id}-${s.k}">${s.opts.map(([v, t]) => `<option value="${v}"${v === s.def ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`).join('')}</div><p class="why"></p><button class="go" data-play="${id}">Play</button></article>`;
  }).join('') + `<article class="gcard classic" style="--gc:#7a4fc9" title="The original game on this one screen. Take turns spinning the wheel, with the 50/50 helper and story time. No phones needed."><header><span class="gico">${svgIcon('classic')}</span><h3>Pinewood Trivia Classic</h3></header><p class="tag">The original wheel game</p><p class="need">${SCREEN}One screen · no phones</p><div class="sets"></div><a class="go open" href="classic.html">Open<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg></a></article>`;
  $('#cards').onclick = e => {
    const b = e.target.closest('[data-play]'); if (!b || b.disabled) return;
    const id = b.dataset.play, card = b.closest('.gcard'), opts = {};
    $$('select', card).forEach(s => { opts[s.dataset.k] = isNaN(+s.value) ? s.value : +s.value; });
    startGame(id, opts);
  };
  // a link like tv.html?game=memory (from the Game Closet) points at one game
  const want = new URLSearchParams(location.search).get('game');
  if (want && /^[a-z]+$/.test(want)) { const c = $(`.gcard[data-g="${want}"]`); if (c) c.classList.add('want'); }
  renderLobbyParts();
  fitURL();
}
function renderLobbyParts() {
  if (S.game !== 'lobby' || !$('#lplayers')) return;
  const ps = online();
  $('#lplayers').innerHTML = ps.length ? `<h3><b>${ps.length}</b> player${ps.length === 1 ? '' : 's'} in<span class="kickhint">Tap a name twice to remove it</span></h3><div class="ptiles${ps.length > 12 ? ' many' : ''}">${ps.map(p => `<button class="ptile${armed === p.uid ? ' armed' : ''}${seenTiles.has(p.uid) ? '' : ' new'}" data-kick="${p.uid}" title="Tap twice to remove">${avatar(p)}<span>${esc(p.name)}</span><small>${armed === p.uid ? 'Tap again to remove' : ''}</small></button>`).join('')}</div>` : `<h3 class="waiting"><span class="dots"><i></i><i></i><i></i></span>Waiting for players to join</h3><p class="waitsub">The games unlock as soon as someone joins.</p>`;
  ps.forEach(p => seenTiles.add(p.uid));
  $('#lplayers').onclick = e => {
    const b = e.target.closest('[data-kick]'); if (!b) return; const u = b.dataset.kick;
    if (armed === u) { armed = ''; net.update(room('players/' + u), { online: false, kicked: true }); } else { armed = u; setTimeout(() => { if (armed === u) { armed = ''; renderLobbyParts(); } }, 3000); }
    renderLobbyParts();
  };
  const cs = $('#cstatus');
  cs.classList.toggle('err', !!(C && C.error));
  if (!C) cs.innerHTML = `<span class="dots"><i></i><i></i><i></i></span>Loading questions…`;
  else if (C.error) cs.innerHTML = `Couldn't load the question sheet. <button class="link" id="reload">Try again</button>`;
  else cs.innerHTML = `<span class="src">Loaded from ${esc(C.note || 'built-in prompts')}:</span> ${C.trivia.length} trivia · ${C.truths.length} two-truths · ${C.guess.length} guess-who · ${C.fibs.length} fibs · ${C.quips.length} quips · ${C.doodles.length} doodles · ${arr(C.babies).length} baby pictures <button class="link" id="reload">Reload questions</button>`;
  const rl = $('#reload'); if (rl) rl.onclick = loadQuestions;
  // one shared reason (loading / nobody here yet) is shown once by the join panel; the cards only show their own reasons
  $('#cards').dataset.state = !C ? 'loading' : !ps.length ? 'waiting' : 'ready';
  for (const card of $$('.gcard[data-g]')) {
    const g = GAMES[card.dataset.g], own = C && ps.length ? g.check(C, ps) : '', why = !C ? 'Loading…' : !ps.length ? 'Waiting for players to join' : own;
    $('.why', card).textContent = why; $('[data-play]', card).disabled = !!why; card.classList.toggle('blocked', !!own);
  }
  const hasCup = Object.keys(S.cup).length;
  $('#cupbox').innerHTML = hasCup ? `${rankTV(S.cup, P, 'Family Cup', 8)}<button class="link" id="resetcup">${armed === 'cup' ? 'Tap again to reset the Family Cup' : 'Reset the Family Cup'}</button>` : '';
  $('.lobby').classList.toggle('hascup', !!hasCup);
  const rc = $('#resetcup'); if (rc) rc.onclick = () => { if (armed === 'cup') { armed = ''; S.cup = {}; commit(); } else { armed = 'cup'; renderLobbyParts(); setTimeout(() => { if (armed === 'cup') { armed = ''; renderLobbyParts(); } }, 3000); } };
  fitPlayers();
}

// ---------- read the question out loud on the TV ----------
const canSpeak = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
$('#stage').addEventListener('click', e => {
  if (!e.target.closest('[data-say]') || !canSpeak) return;
  const v = S.view || {}, gone = Array.isArray(v.gone) ? v.gone : [];
  const opts = (v.opts || []).map((o, i) => gone.includes(i) ? '' : `${'ABCDEFGHIJ'[i]}: ${o}.`).filter(Boolean).join(' ');
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(`${v.q || ''} ${opts}`); u.rate = .92; speechSynthesis.speak(u); } catch (x) {}
});

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
