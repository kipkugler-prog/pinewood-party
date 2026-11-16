// Phone / player screen: join with a room code, then answer, draw and vote.
import { connect } from './net.js';
import { $, $$, esc, obj, arr, avatar, PCOLORS, LEVELS, INK, PEN, drawStrokes } from './common.js';
import { GAMES } from './games.js';

const KEY = 'pp-join';
let net, code = '', me = '', S = null, P = {}, mine = null, mineKey = '', shown = '', unsubs = [], pad = null, autoSent = '';
const room = p => `rooms/${code}${p ? '/' + p : ''}`;
const app = $('#app');
const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } })();
const save = o => { try { localStorage.setItem(KEY, JSON.stringify({ ...saved, ...o })); } catch (e) {} };

async function boot() {
  const qc = (new URLSearchParams(location.search).get('c') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  joinForm(qc || saved.code || '', '');
  try { net = await connect(); me = net.uid; } catch (e) { $('#jerr').textContent = 'Couldn’t connect. Check your internet, then reload.'; return; }
  $('#jgo').disabled = false;
  // rejoin automatically after a reload if this phone was already in the room
  if (saved.code && (!qc || qc === saved.code)) {
    const p = await net.get(`rooms/${saved.code}/players/${me}`);
    if (p && p.name && !p.kicked) { code = saved.code; enter(p.name, p.level || 'I'); }
  }
}

function joinForm(c, err) {
  app.innerHTML = `
  <form class="join" id="jf">
    <h1>Pinewood Party</h1>
    <label for="jc">Room code</label>
    <input id="jc" name="c" maxlength="4" autocomplete="off" autocapitalize="characters" value="${esc(c)}" placeholder="ABCD" required>
    <label for="jn">Your name</label>
    <input id="jn" name="n" maxlength="18" autocomplete="nickname" value="${esc(saved.name || '')}" placeholder="What the family calls you" required>
    <label for="jl">Your level</label>
    <select id="jl" name="l">${Object.entries(LEVELS).map(([k, v]) => `<option value="${k}"${(saved.level || 'I') === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
    <p class="hint">Beginner for little grandkids, Expert for Grandma, Grandpa and the original four. It only changes Pinewood Spin questions.</p>
    <p class="err" id="jerr">${esc(err)}</p>
    <button class="go big" id="jgo" ${net ? '' : 'disabled'}>Join the game</button>
  </form>`;
  $('#jf').onsubmit = async e => {
    e.preventDefault();
    const c2 = $('#jc').value.toUpperCase().replace(/[^A-Z]/g, ''), n = $('#jn').value.trim().slice(0, 18), l = $('#jl').value;
    if (c2.length !== 4) return void ($('#jerr').textContent = 'Room codes are 4 letters. Check the TV.');
    if (!n) return void ($('#jerr').textContent = 'Type your name.');
    $('#jgo').disabled = true; $('#jerr').textContent = '';
    const meta = await net.get(`rooms/${c2}/meta`);
    if (!meta) { $('#jgo').disabled = false; return void ($('#jerr').textContent = `No game with code ${c2}. Check the TV.`); }
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
function leave(msg) { unsubs.forEach(u => u()); unsubs = []; S = null; shown = ''; code = ''; save({ code: '' }); joinForm('', msg || ''); }

let mineUnsub = null;
function watchMine() {
  if (!S || mineKey === S.key) return;
  if (mineUnsub) mineUnsub(); mine = null; mineKey = S.key; const k = S.key;
  mineUnsub = net.on(room(`inputs/${k}/${me}`), v => { if (mineKey !== k) return; const was = !!mine; mine = v; if (!!v !== was) render(); });
}

function renderTop() {
  const t = $('#topinfo'); if (!t || !P[me]) return;
  const pts = obj(S && S.cup)[me] || 0;
  t.innerHTML = `${avatar(P[me])}<span class="tn">${esc(P[me].name)}</span><span class="tp">${pts ? pts.toLocaleString() + ' pts' : ''}</span><button class="leave" id="leave">Leave</button>`;
  $('#leave').onclick = e => { const b = e.currentTarget; if (b.dataset.arm) { net.update(room('players/' + me), { online: false }); leave(''); } else { b.dataset.arm = 1; b.textContent = 'Tap again'; setTimeout(() => { if (b.isConnected) { delete b.dataset.arm; b.textContent = 'Leave'; } }, 3000); } };
}

function render() {
  if (!S || !code) return;
  const sig = `${S.key}|${S.phase}|${mine ? 1 : 0}`;
  if (sig === shown) { renderTop(); return; }
  shown = sig; autoSent = ''; pad = null;
  const g = GAMES[S.game];
  let body;
  if (S.game === 'lobby' || !g) body = `<div class="wait"><h2>You're in!</h2><p>Watch the TV. The game starts soon.</p><p class="hint">Room ${esc(code)}</p></div>`;
  else if (S.phase === 'final') {
    const rows = Object.entries(obj(S.view.scores)).sort((a, b) => b[1] - a[1]); const i = rows.findIndex(([u]) => u === me);
    body = `<div class="res ok"><h2>${i === 0 ? 'You won!' : i > 0 ? `You came in #${i + 1}` : 'Game over'}</h2>${i >= 0 ? `<p class="pts">${rows[i][1].toLocaleString()}</p>` : ''}<p>Look at the TV for the Family Cup.</p></div>`;
  }
  else body = g.phone(S, me, mine, P) || '';
  app.innerHTML = `<header class="ptop"><span class="topinfo" id="topinfo"></span><span class="ptimer" id="ptimer" hidden></span></header><main class="pmain" style="--gc:${g ? g.color : '#45c6bf'}">${body}</main>`;
  renderTop(); bind();
}

function submit(v) {
  if (!S || mine) return;
  const k = S.key; mine = v; shown = ''; render();
  net.set(room(`inputs/${k}/${me}`), v);
}
function bind() {
  const g = GAMES[S.game];
  for (const b of $$('[data-choice]')) b.onclick = () => { if (!b.disabled) submit({ a: +b.dataset.choice, t: net.now() }); };
  const f = $('form[data-form]');
  if (f) f.onsubmit = e => {
    e.preventDefault();
    const vals = Object.fromEntries(new FormData(f).entries()); for (const k in vals) vals[k] = String(vals[k]).trim();
    const err = g && g.validate ? g.validate(S, me, vals) : '';
    if (err) { let el = $('.err', f); if (!el) { el = document.createElement('p'); el.className = 'err'; f.appendChild(el); } el.textContent = err; return; }
    submit(vals);
  };
  if ($('#pad')) setupPad();
}
function clock() {
  const t = $('#ptimer'); if (!t || !S) return;
  if (S.deadline && S.dur) {
    const left = S.deadline - net.now(); t.hidden = false; t.textContent = Math.max(0, Math.ceil(left / 1000)); t.classList.toggle('low', left < 5500);
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
  const inks = $('#inks');
  inks.innerHTML = INK.map((c, i) => `<button class="ink${i === 0 ? ' on' : ''}" data-ink="${i}" style="--ic:${c}" aria-label="Color ${i + 1}"></button>`).join('') + PEN.map((w, i) => `<button class="pen${i === 1 ? ' on' : ''}" data-pen="${i}" aria-label="Brush ${['small', 'medium', 'big'][i]}"><i style="width:${6 + i * 6}px;height:${6 + i * 6}px"></i></button>`).join('');
  inks.onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.ink) { pad.ink = +b.dataset.ink; $$('.ink', inks).forEach(x => x.classList.toggle('on', x === b)); } if (b.dataset.pen) { pad.pen = +b.dataset.pen; $$('.pen', inks).forEach(x => x.classList.toggle('on', x === b)); } };
  drawStrokes(cv, []);
  let cur = null, total = 0;
  const pt = e => { const r = cv.getBoundingClientRect(); return [Math.round((e.clientX - r.left) / r.width * 1000), Math.round((e.clientY - r.top) / r.height * 1000)]; };
  cv.onpointerdown = e => { e.preventDefault(); cv.setPointerCapture(e.pointerId); const [x, y] = pt(e); cur = [pad.ink, pad.pen, x, y]; pad.strokes.push(cur); drawStrokes(cv, pad.strokes); };
  cv.onpointermove = e => { if (!cur || total > 9000) return; const [x, y] = pt(e), lx = cur[cur.length - 2], ly = cur[cur.length - 1]; if (Math.abs(x - lx) + Math.abs(y - ly) < 5) return; cur.push(x, y); total++; drawStrokes(cv, pad.strokes); };
  cv.onpointerup = cv.onpointercancel = () => { cur = null; };
  $('#undo').onclick = () => { pad.strokes.pop(); drawStrokes(cv, pad.strokes); };
  $('#clear').onclick = () => { pad.strokes = []; drawStrokes(cv, pad.strokes); };
  $('#done').onclick = () => { if (!pad.strokes.length) return; submit({ s: pad.strokes }); pad = null; };
}

boot();
