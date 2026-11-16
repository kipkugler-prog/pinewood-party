// Pinewood Trivia Classic: the original one-screen game. Players take turns on one device, spin the topic wheel,
// and answer a question at their own level. Questions come from the same Google Sheet as the party games.
import { loadContent, imgURL, calRing, MONTHS, LEVELS, PCOLORS, esc, shuffle, pick, rid } from './common.js?v=20261116';

const $ = id => document.getElementById(id);
const NEXT = { B: 'I', I: 'X', X: 'B' }, okL = l => LEVELS[l] ? l : 'I';
const MAXP = 18, ROUNDS = [3, 5, 8, 10], KEYS = 'ABCD';
const PRAISE = ['Correct!', 'You got it!', 'Nailed it!', 'Family historian!', 'Mom would be proud!', 'Way to go!'];
const OOPS = ['Not quite!', 'Good try!', 'So close!', 'Nice guess!'];
const SETKEY = 'pinewood-classic', SEENKEY = 'pinewood-classic-seen', GAMEKEY = 'pinewood-classic-game';
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canSpeak = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
const clone = o => JSON.parse(JSON.stringify(o));
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (e) { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

let C = null, CATS = [];
const catOf = id => CATS.find(c => c.id === id) || { id, name: id, short: id, color: '#3a6fc4', t: '#fff' };

/* ---------- setup (kept on this device) ---------- */
let setupP = [{ name: 'Grandma', level: 'X' }, { name: 'Grandpa', level: 'X' }, { name: 'Player 3', level: 'B' }], rounds = 5, sel = null;
{
  const s = load(SETKEY, {});
  if (Array.isArray(s.players) && s.players.length) setupP = s.players.slice(0, MAXP).map(p => ({ name: String(p.name || '').slice(0, 18), level: okL(p.level) }));
  if (ROUNDS.includes(s.rounds)) rounds = s.rounds;
  if (Array.isArray(s.sel)) sel = s.sel;
}
const saveSetup = () => store(SETKEY, { players: setupP, rounds, sel });
let seenAll = load(SEENKEY, {});

/* ---------- game state ---------- */
let G = null, view = 'setup';
let seenSpin = -1, revealFor = -1, revealT = null, shownRot = null, drawnCats = '', quitT = null;
function commit(next) {
  G = next; seenAll = G.seen; store(SEENKEY, seenAll); store(GAMEKEY, G.phase === 'over' ? null : G);
  render(false);
}

/* ---------- wheel ---------- */
function drawWheel(svg, ids) {
  const cs = ids.map(catOf), n = cs.length, a = 360 / n, R = 150;
  const pt = (deg, r) => { const t = deg * Math.PI / 180; return [(160 + r * Math.sin(t)).toFixed(1), (160 - r * Math.cos(t)).toFixed(1)]; };
  let s = '<circle cx="160" cy="160" r="159" fill="#fff"/>';
  cs.forEach((c, i) => {
    if (n === 1) s += `<circle cx="160" cy="160" r="${R}" fill="${c.color}"/>`;
    else { const [x1, y1] = pt(i * a, R), [x2, y2] = pt((i + 1) * a, R); s += `<path d="M160 160L${x1} ${y1}A${R} ${R} 0 ${a > 180 ? 1 : 0} 1 ${x2} ${y2}Z" fill="${c.color}" stroke="#fff" stroke-width="3"/>`; }
    const m = n === 1 ? 0 : i * a + a / 2, [tx, ty] = pt(m, R * .6), rot = n === 1 ? 0 : (m <= 180 ? m - 90 : m + 90);
    const fs = String(c.short).length > 8 ? 15 : (n > 6 ? 19 : 22);
    s += `<text x="${tx}" y="${ty}" transform="rotate(${rot.toFixed(1)} ${tx} ${ty})" text-anchor="middle" dominant-baseline="central" fill="${c.t || '#fff'}" font-family="Fredoka,sans-serif" font-weight="600" font-size="${fs}">${esc(c.short)}</text>`;
  });
  s += '<circle cx="160" cy="160" r="27" fill="#fff"/><circle cx="160" cy="160" r="13" fill="#45c6bf"/>';
  svg.innerHTML = s;
}
function setWheel(rot, anim) {
  const w = $('wheel'); if (shownRot === rot && !anim) return;
  w.style.transition = anim && !reduce ? 'transform 2.8s cubic-bezier(.15,.75,.2,1)' : 'none';
  w.style.transform = `rotate(${rot}deg)`; shownRot = rot;
}

/* ---------- Grandma's calendar ---------- */
function showCal(img, m, d) {
  $('calimg').src = imgURL(img); $('calimg').alt = `Grandma's 2027 calendar, ${MONTHS[m - 1]}`;
  $('calring').style.cssText = calRing(m, d);
  $('calcap').textContent = `Grandma's 2027 calendar: ${MONTHS[m - 1]} ${d}`;
  $('calbox').hidden = false;
}

/* ---------- views ---------- */
function show(id) { for (const s of ['setup', 'play', 'end']) $(s).hidden = s !== id; }
function renderSetup() {
  $('plist').innerHTML = setupP.map((p, i) => `<div class="pr"><i class="d" style="background:${PCOLORS[i]}"></i><input id="pn${i}" data-i="${i}" value="${esc(p.name)}" maxlength="18" aria-label="Player ${i + 1} name" autocomplete="off"><button class="lv ${p.level}" data-i="${i}" aria-label="Level for player ${i + 1}: ${LEVELS[p.level]}">${LEVELS[p.level]}</button><button class="x" data-i="${i}" aria-label="Remove player ${i + 1}"${setupP.length < 2 ? ' disabled' : ''}>×</button></div>`).join('');
  $('add').hidden = setupP.length >= MAXP;
  for (const b of $('rounds').children) b.setAttribute('aria-pressed', +b.dataset.v === rounds);
  if (!C) return;
  $('cats').innerHTML = CATS.map(c => `<button class="cat" data-id="${esc(c.id)}" style="--c:${c.color};--t:${c.t || '#fff'}" aria-pressed="${sel.includes(c.id)}"><i class="d" style="background:${c.color}"></i>${esc(c.name)}</button>`).join('');
  drawWheel($('wheel0'), sel);
  $('start').disabled = !sel.length;
  const live = G && G.phase !== 'over';
  $('resume').hidden = !live;
  $('start').textContent = live ? 'Start a new game' : "Let's play!";
}
const cp = () => G.players[G.turn % G.players.length];
function renderBoard() {
  $('board').classList.toggle('many', G.players.length > 8);
  $('board').innerHTML = G.players.map((p, i) => `<div class="pc${G.phase !== 'over' && i === G.turn % G.players.length ? ' on' : ''}"><i class="d" style="background:${p.col}"></i>${esc(p.name)}<span class="st">★ ${p.score}</span></div>`).join('');
}
function syncSpin(instant) {
  if (!G.spin) return;
  if (G.spin.n === seenSpin || G.phase === 'spin' || instant) { seenSpin = G.spin.n; setWheel(G.spin.rot, false); return; }
  if (revealFor === G.spin.n) return;
  revealFor = G.spin.n; setWheel(G.spin.rot, true); clearTimeout(revealT);
  const n = G.spin.n; revealT = setTimeout(() => { seenSpin = n; render(false); }, reduce ? 350 : 3000);
}
function render(instant) {
  if (view === 'setup' || !G) { show('setup'); renderSetup(); return; }
  if (G.phase === 'over') { renderEnd(); show('end'); return; }
  show('play'); renderBoard();
  const key = G.cats.join(','); if (key !== drawnCats) { drawWheel($('wheel'), G.cats); drawnCats = key; shownRot = null; }
  syncSpin(instant);
  const revealed = G.phase !== 'spin' && G.spin.n === seenSpin, p = cp();
  if (!revealed) {
    stopSpeak();
    $('spinView').hidden = false; $('qView').hidden = true;
    $('round').textContent = `Round ${Math.floor(G.turn / G.players.length) + 1} of ${G.rounds}`;
    const spinning = G.phase !== 'spin';
    $('who').textContent = spinning ? `${p.name} is spinning…` : `${p.name}, spin the wheel!`;
    $('spin').disabled = spinning; $('spin').textContent = spinning ? 'Spinning…' : 'Spin!';
    return;
  }
  const q = G.q, c = catOf(q.cat);
  $('spinView').hidden = true; $('qView').hidden = false;
  const qc = $('qcat'); qc.textContent = c.name; qc.style.background = c.color; qc.style.color = c.t || '#fff';
  $('qwho').textContent = `${p.name}'s ${LEVELS[q.lvl]} question`;
  // a calendar question's picture would give the answer away, so it only shows after answering
  const photo = q.img && !q.cal ? imgURL(q.img) : '';
  if (photo) { $('qimg').src = photo; $('qimg').alt = 'Photo for this question'; $('qphoto').hidden = false; } else $('qphoto').hidden = true;
  $('qtext').textContent = q.q;
  const done = G.phase === 'answered';
  $('opts').className = `opts n${q.opts.length}`;
  $('opts').innerHTML = q.opts.map((o, k) => {
    let cl = 'opt'; if (done && k === q.right) cl += ' good'; else if (done && k === G.pick) cl += ' bad'; else if (q.gone.includes(k)) cl += ' gone';
    return `<button class="${cl}" data-i="${k}"${done || q.gone.includes(k) ? ' disabled' : ''}><span class="k">${KEYS[k]}</span><span>${esc(o)}</span></button>`;
  }).join('');
  $('fifty').disabled = done || !p.fifty || q.opts.length < 3; $('fifty').textContent = p.fifty ? '50/50 helper' : '50/50 used';
  $('read').hidden = !canSpeak;
  $('result').hidden = !done;
  if (done) {
    const v = $('verdict'); v.className = 'verdict ' + (G.ok ? 'yes' : 'no');
    v.textContent = G.ok ? `${PRAISE[G.turn % PRAISE.length]} +1 star for ${p.name}` : `${OOPS[G.turn % OOPS.length]} The answer is: ${q.opts[q.right]}`;
    $('fact').textContent = q.story || '';
    $('ref').textContent = q.src ? 'From ' + q.src : '';
    $('fact').closest('.story').hidden = !q.story && !q.src;
    if (q.cal && q.img) showCal(q.img, q.cal[0], q.cal[1]); else $('calbox').hidden = true;
    const last = G.turn + 1 >= G.total;
    $('next').textContent = last ? 'See who won!' : (G.players.length > 1 ? `Next up: ${G.players[(G.turn + 1) % G.players.length].name}` : 'Next question');
  }
}
function renderEnd() {
  stopSpeak();
  const ranked = G.players.slice().sort((a, b) => b.score - a.score), top = ranked[0].score, win = ranked.filter(p => p.score === top);
  $('champ').textContent = G.players.length === 1 ? `You got ${top} star${top === 1 ? '' : 's'}!` : win.length === 1 ? `${win[0].name} wins!` : `It's a tie: ${win.map(p => p.name).join(' & ')}!`;
  const asked = G.asked || 0; $('endsub').textContent = `${asked} question${asked === 1 ? '' : 's'} played`;
  let place = 0, prev = null;
  $('rank').innerHTML = ranked.map((p, i) => { if (p.score !== prev) { place = i + 1; prev = p.score; } return `<li class="${p.score === top ? 'top' : ''}"><span class="pl">${place}</span><i class="d" style="background:${p.col}"></i><span class="nm">${esc(p.name)}</span><span class="st">★ ${p.score}</span></li>`; }).join('');
}

/* ---------- actions ---------- */
function newGame(players, rds, cats) {
  commit({
    v: 1, id: rid(), players: players.map((p, i) => ({ name: (p.name || '').trim() || `Player ${i + 1}`, level: okL(p.level), col: PCOLORS[i % PCOLORS.length], score: 0, fifty: true })),
    rounds: rds, cats: cats.slice(), turn: 0, total: rds * players.length, asked: 0, phase: 'spin', spin: { n: 0, rot: G && G.spin ? G.spin.rot : 0 }, q: null, pick: -1, ok: false, seen: clone(seenAll || {})
  });
  seenSpin = -1; revealFor = -1;
  view = 'game'; render(false);
}
function poolFor(cat, lvl) {
  let pool = C.trivia.filter(t => t.cat === cat && t.level === lvl);
  if (!pool.length) pool = C.trivia.filter(t => t.cat === cat);
  return pool;
}
function doSpin() {
  if (!G || G.phase !== 'spin') return;
  const st = clone(G), n = st.cats.length, a = 360 / n, p = st.players[st.turn % st.players.length], lvl = p.level;
  // land only on topics that have a question at this player's level (or any level, if none do)
  const hasLvl = st.cats.map((c, i) => i).filter(i => C.trivia.some(t => t.cat === st.cats[i] && t.level === lvl));
  const hasAny = st.cats.map((c, i) => i).filter(i => C.trivia.some(t => t.cat === st.cats[i]));
  const i = pick(hasLvl.length ? hasLvl : hasAny.length ? hasAny : [0]), jit = (Math.random() - .5) * a * .6;
  const target = ((360 - (i * a + a / 2 + jit)) % 360 + 360) % 360, cur = ((st.spin.rot % 360) + 360) % 360;
  st.spin = { n: st.spin.n + 1, rot: st.spin.rot + 1800 + ((target - cur + 360) % 360) };
  const cat = st.cats[i], pool = poolFor(cat, lvl), k = lvl + ':' + cat;
  let seen = (st.seen[k] || []).filter(q => pool.some(t => t.q === q)), fresh = pool.filter(t => !seen.includes(t.q));
  if (!fresh.length) { seen = []; fresh = pool; }
  const t = pick(fresh); st.seen[k] = seen.concat(t.q);
  const opts = shuffle([t.a, ...t.w].slice(0, 4));
  st.q = { cat, lvl: t.level, q: t.q, opts, right: opts.indexOf(t.a), story: t.story, src: t.src, img: t.img, cal: t.cal, gone: [] };
  st.phase = 'question'; st.pick = -1; st.ok = false;
  commit(st);
}
function answer(k) {
  if (!G || G.phase !== 'question' || G.q.gone.includes(k)) return;
  const st = clone(G); st.pick = k; st.ok = k === st.q.right; st.phase = 'answered'; st.asked = (st.asked || 0) + 1;
  if (st.ok) st.players[st.turn % st.players.length].score++;
  stopSpeak(); commit(st);
  setTimeout(() => { try { $('result').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' }); } catch (e) {} }, 60);
}
function useFifty() {
  if (!G || G.phase !== 'question') return;
  const st = clone(G), p = st.players[st.turn % st.players.length]; if (!p.fifty) return;
  const wrong = st.q.opts.map((o, j) => j).filter(j => j !== st.q.right);
  p.fifty = false; st.q.gone = shuffle(wrong).slice(0, Math.max(0, st.q.opts.length - 2)); commit(st);
}
function next() {
  if (!G || G.phase !== 'answered') return;
  const st = clone(G); st.turn++; st.q = null; st.pick = -1; st.ok = false; st.phase = st.turn >= st.total ? 'over' : 'spin'; stopSpeak(); commit(st);
}
function endGame() { if (!G) return; const st = clone(G); st.phase = 'over'; commit(st); }
function stopSpeak() { if (canSpeak) try { speechSynthesis.cancel(); } catch (e) {} }
function readAloud() {
  if (!G || !G.q || !canSpeak) return;
  try {
    stopSpeak();
    const opts = G.q.opts.map((o, j) => G.q.gone.includes(j) ? '' : `${KEYS[j]}: ${o}.`).filter(Boolean).join(' ');
    const u = new SpeechSynthesisUtterance(`${G.q.q} ${opts}`); u.rate = .92; speechSynthesis.speak(u);
  } catch (e) { $('read').hidden = true; }
}

/* ---------- events ---------- */
$('plist').addEventListener('input', e => { if (e.target.tagName === 'INPUT') { setupP[+e.target.dataset.i].name = e.target.value; saveSetup(); } });
$('plist').addEventListener('click', e => {
  const lv = e.target.closest('.lv'); if (lv) { const p = setupP[+lv.dataset.i]; p.level = NEXT[okL(p.level)]; saveSetup(); renderSetup(); return; }
  const b = e.target.closest('.x'); if (!b || setupP.length < 2) return; setupP.splice(+b.dataset.i, 1); saveSetup(); renderSetup();
});
$('add').addEventListener('click', () => {
  if (setupP.length >= MAXP) return; setupP.push({ name: `Player ${setupP.length + 1}`, level: 'I' }); saveSetup(); renderSetup();
  const ins = $('plist').querySelectorAll('input'), inp = ins[ins.length - 1]; if (inp) { inp.focus(); inp.select(); }
});
$('rounds').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; rounds = +b.dataset.v; saveSetup(); renderSetup(); });
$('cats').addEventListener('click', e => {
  const b = e.target.closest('.cat'); if (!b) return; const id = b.dataset.id;
  if (sel.includes(id)) { if (sel.length === 1) return; sel = sel.filter(x => x !== id); } else sel = CATS.map(c => c.id).filter(x => x === id || sel.includes(x));
  saveSetup(); renderSetup();
});
$('start').addEventListener('click', () => { if (C && sel.length) newGame(setupP, rounds, sel); });
$('resume').addEventListener('click', () => { view = 'game'; render(true); });
$('spin').addEventListener('click', doSpin);
$('wheelBox').addEventListener('click', doSpin);
$('opts').addEventListener('click', e => { const b = e.target.closest('.opt'); if (b && !b.disabled) answer(+b.dataset.i); });
$('fifty').addEventListener('click', useFifty);
$('read').addEventListener('click', readAloud);
$('next').addEventListener('click', next);
$('quit').addEventListener('click', e => {
  const b = e.currentTarget;
  if (b.dataset.arm) { clearTimeout(quitT); delete b.dataset.arm; b.textContent = 'End game'; endGame(); }
  else { b.dataset.arm = '1'; b.textContent = 'Tap again to end the game'; quitT = setTimeout(() => { delete b.dataset.arm; b.textContent = 'End game'; }, 3000); }
});
$('again').addEventListener('click', () => { if (G) newGame(G.players, G.rounds, G.cats); });
$('toSetup').addEventListener('click', () => {
  if (G) { setupP = G.players.map(p => ({ name: p.name, level: p.level })); rounds = ROUNDS.includes(G.rounds) ? G.rounds : rounds; sel = G.cats.filter(id => CATS.some(c => c.id === id)); if (!sel.length) sel = CATS.map(c => c.id); saveSetup(); }
  view = 'setup'; render(false);
});

/* ---------- start ---------- */
renderSetup();
(async () => {
  const st = $('qstatus');
  try { C = await loadContent(); } catch (e) { C = null; }
  if (!C || !C.trivia.length) { st.querySelector('span').textContent = "Couldn't load the questions. Check your internet, then reload."; return; }
  const used = new Set(C.trivia.map(t => t.cat));
  CATS = C.categories.filter(c => used.has(c.id)).slice(0, 12);
  sel = (Array.isArray(sel) ? CATS.map(c => c.id).filter(id => sel.includes(id)) : []);
  if (!sel.length) sel = CATS.map(c => c.id);
  st.className = 'live on'; st.querySelector('span').textContent = `${C.trivia.length} questions from ${C.note || 'the question sheet'}`;
  // pick up a game that was going when the page was closed or reloaded
  const saved = load(GAMEKEY, null);
  if (saved && saved.v === 1 && saved.phase !== 'over' && Array.isArray(saved.players) && saved.players.length) { G = saved; if (G.phase === 'question' && G.q) seenSpin = G.spin.n; }
  renderSetup();
})();
