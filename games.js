// The eight games. Each game has host logic (start/next, run only on the TV) and two views: tv() and phone().
// The TV is the referee: it writes the game state; phones only send their own answers.
import { esc, shuffle, pick, norm, arr, obj, ANS, LEVELS, imgURL, calRing, MONTHS, avatar } from './common.js?v=20261124';

const T = { ask: 20, spinAsk: 30, draw: 90, title: 45, vote: 25, write: 50, quipWrite: 90, quipVote: 15, truths: 30, guess: 20, flip: 25, who: 15 };
const speedPts = (t, t0, dur) => 500 + Math.round(500 * Math.max(0, Math.min(1, 1 - ((t || 0) - t0) / (dur * 1000))));
const add = (g, uid, pts) => { if (!uid || !pts) return; g.scores[uid] = (g.scores[uid] || 0) + pts; };
const nameOf = (P, uid) => (P[uid] && P[uid].name) || 'Someone';
const others = (H, ...not) => H.online().map(p => p.uid).filter(u => !not.includes(u));
function matchPlayer(H, person) {
  const n = norm(person); if (!n) return null;
  const ps = H.online();
  const hit = ps.find(p => norm(p.name) === n) || ps.find(p => n.split(' ').includes(norm(p.name))) || ps.find(p => norm(p.name).split(' ').includes(n));
  return hit ? hit.uid : null;
}

// ---------- shared view pieces ----------
const big = (t, cls = '') => `<h2 class="qbig ${cls}">${esc(t)}</h2>`;
const kicker = t => `<p class="kick">${esc(t)}</p>`;
const SAY = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.3 6.5a8 8 0 0 1 0 11"/></svg>';
const sayBtn = () => `<button class="ghost say" data-say>${SAY}Read it out loud</button>`;
function optsTV(opts, { right = -1, counts = null, pickers = null, P = {}, gone = [] } = {}) {
  return `<div class="tvopts n${opts.length}${right >= 0 ? ' revealed' : ''}">${opts.map((o, i) => {
    const st = right < 0 ? (arr(gone).includes(i) ? ' gone' : '') : (i === right ? ' right' : ' wrong');
    const ps = pickers ? arr(pickers[i]) : [];
    const who = ps.length ? `<span class="who">${ps.slice(0, 6).map(u => avatar(P[u], 'sm')).join('')}${ps.length > 6 ? `<span class="more">+${ps.length - 6}</span>` : ''}</span>` : '';
    return `<div class="tvopt${st}" style="--ac:${ANS[i].c}"><b>${ANS[i].k}</b><span class="t">${esc(o)}</span>${counts ? `<em>${counts[i] || 0}</em>` : ''}${who}</div>`;
  }).join('')}</div>`;
}
// story note + taped snapshot; `extra` (e.g. who scored) sits under the note so the photo can take the right side
function storyBox(story, src, img, cal, extra = '') {
  let pic = '';
  if (cal && img) pic = `<figure class="cal snap"><div class="calwrap"><img src="${esc(imgURL(img))}" alt="Grandma's 2027 calendar, ${MONTHS[cal[0] - 1]}"><i class="ring" style="${calRing(cal[0], cal[1])}"></i></div><figcaption>Grandma's calendar: ${MONTHS[cal[0] - 1]} ${cal[1]}</figcaption></figure>`;
  else if (img) pic = `<figure class="pic snap"><img src="${esc(imgURL(img))}" alt=""></figure>`;
  if (!story && !pic) return extra;
  const note = story ? `<div class="story"><b>Story time</b><p>${esc(story)}</p>${src ? `<span class="from">From ${esc(src)}</span>` : ''}</div>` : '';
  return `<div class="storyrow${pic ? ' haspic' : ''}"><div class="storycol">${note}${extra}</div>${pic}</div>`;
}
function gainsList(gains, P, max = 18) {
  const rows = Object.entries(obj(gains)).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, max);
  if (!rows.length) return `<p class="none">Nobody scored this time.</p>`;
  return `<ul class="gains">${rows.map(([u, v]) => `<li>${avatar(P[u], 'sm')}<span class="nm">${esc(nameOf(P, u))}</span><b>+${v}</b></li>`).join('')}</ul>`;
}
export const TROPHY = '<svg class="trophy" viewBox="0 0 120 112" aria-hidden="true"><path d="M30 26H15c0 18 8 28 19 30M90 26h15c0 18-8 28-19 30" fill="none" stroke="#1f9e97" stroke-width="7" stroke-linecap="round"/><path d="M28 14h64v26c0 21-14 37-32 37S28 61 28 40z" fill="#45c6bf"/><path d="M60 14h32v26c0 21-14 37-32 37z" fill="#2fb0a9"/><path d="M42 24v20" stroke="#fff" stroke-opacity=".7" stroke-width="6" stroke-linecap="round"/><rect x="52" y="76" width="16" height="14" fill="#1f9e97"/><rect x="34" y="90" width="52" height="14" rx="5" fill="#8a5a2b"/></svg>';
export function champLine(scores, P) {
  const rows = Object.entries(obj(scores)).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return 'Game over!';
  const win = rows.filter(([, v]) => v === rows[0][1]).map(([u]) => nameOf(P, u));
  return win.length === 1 ? `${win[0]} wins!` : `It's a tie: ${win.join(' & ')}!`;
}
export function rankTV(scores, P, title = 'Scores', max = 10) {
  const rows = Object.entries(obj(scores)).sort((a, b) => b[1] - a[1]);
  const ps = Object.keys(P).filter(u => !(u in obj(scores))).map(u => [u, 0]);
  const all = rows.concat(ps).slice(0, max);
  return `<div class="rank n${all.length}"><h2>${esc(title)}</h2><ol>${all.map(([u, v], i) => `<li class="${i === 0 && v > 0 ? 'top' : i < 3 && v > 0 ? 'p' + (i + 1) : ''}"><span class="pl">${i + 1}</span>${avatar(P[u])}<span class="nm">${esc(nameOf(P, u))}</span><b>${v.toLocaleString()}</b></li>`).join('')}</ol></div>`;
}
// ---------- phone pieces (styled by phone.css) ----------
const PSVG = (d, o = '') => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"${o}>${d}</svg>`;
const PI = {
  check: PSVG('<path d="M5 12.5l4.6 4.6L19 7.6"/>', ' stroke-width="3.2"'),
  x: PSVG('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>', ' stroke-width="3.2"'),
  tv: PSVG('<rect x="2.6" y="6" width="18.8" height="12.4" rx="2.6"/><path d="M8.5 2.6 12 6l3.5-3.4M8 21.4h8"/>', ' stroke-width="2.2"'),
  star: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z"/></svg>',
  pencil: PSVG('<path d="M4 20l1-4.2L16.3 4.5a2.1 2.1 0 0 1 3 0l.2.2a2.1 2.1 0 0 1 0 3L8.2 19z"/><path d="M14 7l3 3"/>', ' stroke-width="2.2"'),
  say: PSVG('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.3 6.5a8 8 0 0 1 0 11"/>', ' stroke-width="2.2"'),
  half: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>',
  laugh: PSVG('<circle cx="12" cy="12" r="9.2"/><path d="M7.6 13.2a4.6 4.6 0 0 0 8.8 0z" fill="currentColor"/><path d="M8.6 9.6h.01M15.4 9.6h.01"/>', ' stroke-width="2.4"')
};
const pord = n => n + ((n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));
const dotsP = (c = '') => `<div class="dots${c}"><i></i><i></i><i></i></div>`;
// a waiting screen: icon (or bouncing dots), title, and a line under it
const wait = (t, sub = '', icon = '') => `<div class="wait${icon ? ' w-' + icon : ''}">${icon ? `<div class="wicon">${PI[icon]}</div>` : dotsP()}<h2>${esc(t)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}${icon === 'check' ? dotsP(' sm') : ''}</div>`;
// waiting on another player: show their avatar
const waitWho = (p, t, sub = '') => `<div class="wait w-who"><div class="wav">${avatar(p, 'lg')}</div><h2>${esc(t)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div>`;
const lookTV = (t = 'Eyes on the TV!', sub = '') => `<div class="wait w-tv"><div class="wicon">${PI.tv}</div><h2>${esc(t)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div>`;
// the question / prompt on a white card; long text gets a smaller size so the answers still fit
const blanksP = s => esc(s).replace(/_{2,}/g, '<span class="blank" aria-label="blank"></span>');
function qcard(q, { kick = '', html = '' } = {}) {
  const n = String(q || '').length;
  return `<div class="qcard${n > 95 ? ' long' : n > 58 ? ' mid' : ''}">${kick ? `<p class="qk">${esc(kick)}</p>` : ''}<p class="pq">${html || esc(q)}</p></div>`;
}
// answer buttons. 2-4 answers: big colored buttons that share the screen. 5+: a compact list (two columns when answers are short).
// off = removed by the 50/50 helper; own = your own fib/title (can't vote for it)
function choicesPhone(opts, { mine = null, off = [], own = [], q = '', qhtml = '', kick = '', tools = '' } = {}) {
  if (mine) {
    const k = ANS[mine.a] || ANS[0];
    return `<div class="wait w-check locked"><div class="wicon">${PI.check}</div><h2>Locked in!</h2><div class="lock${mine.a === 2 ? ' lt' : ''}" style="--ac:${k.c}"><b>${k.k}</b><span>${esc(opts[mine.a])}</span></div><p>Waiting for everyone else…</p>${dotsP(' sm')}</div>`;
  }
  const n = opts.length, many = n > 4, two = many && opts.every(o => String(o).length <= 15);
  const btn = (o, i) => {
    const gone = arr(off).includes(i), yours = arr(own).includes(i), L = String(o).length;
    return `<button class="popt${gone ? ' gone' : ''}${yours ? ' own' : ''}${i === 2 ? ' lt' : ''}${L > 44 ? ' xl' : L > 24 ? ' l' : ''}" data-choice="${i}" style="--ac:${ANS[i].c}"${gone || yours ? ' disabled' : ''}><b>${ANS[i].k}</b><span>${esc(o)}</span>${yours ? '<em>Yours</em>' : gone ? '<em>Gone</em>' : ''}</button>`;
  };
  return `<div class="ask${many ? ' many' : ''}">${q || qhtml ? qcard(q, { kick, html: qhtml }) : ''}${tools}<div class="popts n${n}${many ? ' many' : ''}${two ? ' two' : ''}">${opts.map(btn).join('')}</div></div>`;
}
function resultPhone(ok, pts, line, title = '') {
  return `<div class="res ${ok ? 'ok' : 'no'}"><div class="ricon">${ok ? PI.check : PI.x}</div><h2>${esc(title || (ok ? 'Correct!' : 'Not quite'))}</h2>${pts ? `<p class="pts">+${Number(pts).toLocaleString()}<small> pts</small></p>` : ''}${line ? `<p class="rline">${esc(line)}</p>` : ''}</div>`;
}
// text boxes for fibs, titles and quips. Only one button in the form: it sends.
function formPhone(kind, fields, send) {
  return `<form class="pform" data-form="${kind}">${fields.map((f, k) => `<div class="fcard">${f.kick ? `<p class="qk">${esc(f.kick)}</p>` : ''}<label for="${f.id}">${f.label}</label><input id="${f.id}" name="${f.name}" maxlength="${f.max}" autocomplete="off" autocapitalize="sentences" autocorrect="on" spellcheck="true" enterkeyhint="${k < fields.length - 1 ? 'next' : 'send'}" required placeholder="${esc(f.ph)}"></div>`).join('')}<p class="err" role="alert"></p><button class="go big">${esc(send)}</button></form>`;
}
// your place so far, for in-between screens
function standingP(scores, me) {
  const sc = obj(scores), my = sc[me] || 0;
  if (!my) return 'The leaderboard is on the TV.';
  return `You're in ${pord(1 + Object.values(sc).filter(v => v > my).length)} place with ${my.toLocaleString()} points.`;
}

// ---------- 1. Trivia Showdown ----------
const trivia = {
  id: 'trivia', name: 'Trivia Showdown', color: '#e2465d',
  blurb: 'Everyone answers at once on their phone. Faster right answers score more.',
  settings: [{ k: 'n', label: 'Questions', opts: [[10, '10'], [15, '15'], [20, '20']], def: 10 }, { k: 'lvl', label: 'Difficulty', opts: [['M', 'Mixed'], ['B', 'Beginner'], ['I', 'Intermediate'], ['X', 'Expert']], def: 'M' }],
  check: C => C.trivia.length >= 4 ? '' : 'Add trivia questions to the sheet first.',
  start(H, o) {
    let pool = H.C.trivia.filter(t => o.lvl === 'M' || t.level === o.lvl);
    if (pool.length < 4) pool = H.C.trivia;
    const qs = shuffle(pool).slice(0, +o.n).map(t => {
      const opts = shuffle([t.a, ...t.w].slice(0, 4));
      const cat = H.C.categories.find(c => c.id === t.cat);
      return { q: t.q, opts, a: opts.indexOf(t.a), story: t.story, src: t.src, img: t.img, cal: t.cal, cat: cat ? cat.name : '', lvl: t.level };
    });
    H.S.g = { qs, i: 0, scores: {} };
    this.intro(H);
  },
  intro(H) { const g = H.S.g, q = g.qs[g.i]; H.phase('intro', { auto: 3, view: { n: g.i + 1, of: g.qs.length, cat: q.cat, lvl: q.lvl } }); },
  next(H) {
    const S = H.S, g = S.g, q = g.qs[g.i];
    if (S.phase === 'intro') return H.phase('ask', { dur: T.ask, expect: others(H), view: { n: g.i + 1, of: g.qs.length, q: q.q, opts: q.opts, img: q.cal ? '' : q.img, t0: H.now() } });
    if (S.phase === 'ask') {
      const t0 = S.view.t0, pickers = q.opts.map(() => []), gains = {};
      for (const [u, v] of Object.entries(H.inputs)) {
        if (!v || v.a == null || !pickers[v.a]) continue; pickers[v.a].push(u);
        if (v.a === q.a) { const p = speedPts(v.t, t0, T.ask); gains[u] = p; add(g, u, p); }
      }
      return H.phase('reveal', { auto: q.story ? 11 : 7, view: { ...S.view, right: q.a, pickers, gains, story: q.story, src: q.src, img: q.img, cal: q.cal } });
    }
    if (S.phase === 'reveal') {
      if (g.i + 1 >= g.qs.length) return H.finish();
      if ((g.i + 1) % 5 === 0) return H.phase('scores', { auto: 6, view: {} });
      g.i++; return this.intro(H);
    }
    if (S.phase === 'scores') { g.i++; return this.intro(H); }
  },
  tv(S, P) {
    const v = S.view;
    if (S.phase === 'intro') return `<div class="center">${kicker(`Question ${v.n} of ${v.of}`)}${big(v.cat || 'Family trivia', 'huge')}${v.lvl ? `<p class="lvl">${LEVELS[v.lvl]}</p>` : ''}</div>`;
    if (S.phase === 'ask') return `<div class="askwrap"><div class="asktop">${kicker(`Question ${v.n} of ${v.of}`)}${sayBtn()}</div>${v.img ? `<img class="qimg" src="${esc(imgURL(v.img))}" alt="">` : ''}${big(v.q)}${optsTV(v.opts)}</div>`;
    if (S.phase === 'reveal') return `${kicker(`Question ${v.n} of ${v.of} · the answer`)}${big(v.q, 'small')}${optsTV(v.opts, { right: v.right, pickers: v.pickers, P })}${storyBox(v.story, v.src, v.img, v.cal, gainsList(v.gains, P, 18))}`;
    if (S.phase === 'scores') return rankTV(S.g.scores, P, 'Leaderboard');
  },
  phone(S, me, mine) {
    const v = S.view;
    if (S.phase === 'ask') return choicesPhone(v.opts, { mine, q: v.q });
    if (S.phase === 'reveal') { const pts = obj(v.gains)[me]; const picked = arr(v.pickers).findIndex(a => arr(a).includes(me)); return resultPhone(!!pts, pts, picked < 0 ? `No answer. It was ${v.opts[v.right]}.` : pts ? 'Faster right answers score more.' : `It was ${v.opts[v.right]}.`, picked < 0 ? 'Time’s up!' : ''); }
    if (S.phase === 'intro') return lookTV(`Question ${v.n} of ${v.of}`, v.cat ? `Category: ${v.cat}. Get ready!` : 'Get ready!');
    if (S.phase === 'scores') return lookTV('Leaderboard!', standingP(S.g && S.g.scores, me));
    return lookTV();
  }
};

// ---------- 2. Pinewood Spin (take turns) ----------
const spin = {
  id: 'spin', name: 'Pinewood Spin', color: '#2bb3b1',
  blurb: 'Take turns. Spin the wheel on your phone and answer a question at your own level while everyone watches. Everyone gets one 50/50 helper.',
  settings: [{ k: 'turns', label: 'Turns each', opts: [[1, '1'], [2, '2'], [3, '3']], def: 1 }],
  check: C => C.trivia.length >= 4 ? '' : 'Add trivia questions to the sheet first.',
  wheelCats(H) { const used = new Set(H.C.trivia.map(t => t.cat)); return H.C.categories.filter(c => used.has(c.id)).slice(0, 10).map(c => ({ id: c.id, short: c.short, color: c.color, t: c.t })); },
  start(H, o) {
    const order = H.online().map(p => p.uid);
    H.S.g = { order, turn: 0, total: order.length * +o.turns, scores: {}, seen: {}, rot: 0, cats: this.wheelCats(H), fifty: {} };
    this.spinTurn(H);
  },
  spinTurn(H) {
    const g = H.S.g, here = u => H.P[u] && H.P[u].online !== false;
    for (let k = 0; k < g.order.length && g.turn < g.total && !here(g.order[g.turn % g.order.length]); k++) g.turn++; // skip people who left
    if (g.turn >= g.total) return H.finish();
    const cur = g.order[g.turn % g.order.length]; H.phase('spin', { expect: [cur], view: { cur, turn: g.turn + 1, of: g.total, rot: g.rot } });
  },
  next(H) {
    const S = H.S, g = S.g, cur = S.view.cur;
    if (S.phase === 'spin') {
      const lvl = (H.P[cur] && H.P[cur].level) || 'I';
      const has = c => H.C.trivia.some(t => t.cat === c.id && t.level === lvl);
      const idxs = g.cats.map((c, i) => i).filter(i => has(g.cats[i]));
      const i = idxs.length ? pick(idxs) : Math.floor(Math.random() * g.cats.length), n = g.cats.length, a = 360 / n;
      const target = ((360 - (i * a + a / 2 + (Math.random() - .5) * a * .6)) % 360 + 360) % 360, curRot = ((g.rot % 360) + 360) % 360;
      const from = g.rot; g.rot = g.rot + 1800 + ((target - curRot + 360) % 360);
      let pool = H.C.trivia.filter(t => t.cat === g.cats[i].id && t.level === lvl);
      if (!pool.length) pool = H.C.trivia.filter(t => t.cat === g.cats[i].id);
      const k = lvl + ':' + g.cats[i].id, seen = arr(g.seen[k]);
      let fresh = pool.filter(t => !seen.includes(t.q)); if (!fresh.length) { fresh = pool; g.seen[k] = []; }
      const t = pick(fresh); g.seen[k] = arr(g.seen[k]).concat(t.q);
      const opts = shuffle([t.a, ...t.w].slice(0, 4));
      g.cur = { q: t.q, opts, a: opts.indexOf(t.a), story: t.story, src: t.src, img: t.img, cal: t.cal, cat: g.cats[i].short, catColor: g.cats[i].color, lvl };
      return H.phase('spinning', { auto: 3.4, view: { cur, from, rot: g.rot, turn: S.view.turn, of: S.view.of } });
    }
    if (S.phase === 'spinning') { const q = g.cur; return H.phase('ask', { dur: T.spinAsk, expect: [cur], view: { cur, q: q.q, opts: q.opts, cat: q.cat, catColor: q.catColor, lvl: q.lvl, img: q.cal ? '' : q.img, turn: S.view.turn, of: S.view.of, gone: [] } }); }
    if (S.phase === 'ask') {
      const q = g.cur, pickd = obj(H.inputs[cur]).a, ok = pickd === q.a; if (ok) add(g, cur, 1000);
      return H.phase('reveal', { auto: q.story ? 11 : 7, view: { ...S.view, right: q.a, picked: pickd ?? -1, ok, story: q.story, src: q.src, img: q.img, cal: q.cal } });
    }
    if (S.phase === 'reveal') { g.turn++; return g.turn >= g.total ? H.finish() : this.spinTurn(H); }
  },
  onPlayers(H) {
    const S = H.S, g = S.g, cur = S.view && S.view.cur;
    if (S.phase !== 'ask' || !g || !cur) return false;
    const p = H.P[cur]; g.fifty = obj(g.fifty);
    if (!p || p.fifty !== S.key || g.fifty[cur] || H.inputs[cur]) return false;
    g.fifty[cur] = true;
    const q = g.cur, wrong = q.opts.map((o, j) => j).filter(j => j !== q.a);
    const gone = shuffle(wrong).slice(0, Math.max(0, q.opts.length - 2));
    const left = Math.max(8, Math.ceil(((S.deadline || 0) - H.now()) / 1000));
    H.phase('ask', { dur: left, expect: [cur], view: { ...S.view, gone } });
    return true;
  },
  wheelSVG(cats, from, to) {
    const n = cats.length, a = 360 / n, R = 150;
    const pt = (deg, r) => { const t = deg * Math.PI / 180; return [(160 + r * Math.sin(t)).toFixed(1), (160 - r * Math.cos(t)).toFixed(1)]; };
    let s = '<circle cx="160" cy="160" r="159" fill="#fff"/>';
    cats.forEach((c, i) => {
      if (n === 1) s += `<circle cx="160" cy="160" r="${R}" fill="${c.color}"/>`;
      else { const [x1, y1] = pt(i * a, R), [x2, y2] = pt((i + 1) * a, R); s += `<path d="M160 160L${x1} ${y1}A${R} ${R} 0 ${a > 180 ? 1 : 0} 1 ${x2} ${y2}Z" fill="${c.color}" stroke="#fff" stroke-width="3"/>`; }
      const m = n === 1 ? 0 : i * a + a / 2, [tx, ty] = pt(m, R * .6), r2 = n === 1 ? 0 : (m <= 180 ? m - 90 : m + 90);
      s += `<text x="${tx}" y="${ty}" transform="rotate(${r2.toFixed(1)} ${tx} ${ty})" text-anchor="middle" dominant-baseline="central" fill="${c.t || '#fff'}" font-family="Fredoka,sans-serif" font-weight="600" font-size="${String(c.short).length > 8 ? 15 : 19}">${esc(c.short)}</text>`;
    });
    if (n > 1) for (let i = 0; i < n; i++) { const [px, py] = pt(i * a, 154.5); s += `<circle cx="${px}" cy="${py}" r="3.2" fill="#ffd23f" stroke="#c99a12" stroke-width="1"/>`; }
    s += '<circle cx="160" cy="160" r="29" fill="#fff" stroke="rgba(0,0,0,.08)" stroke-width="2"/><circle cx="160" cy="160" r="15" fill="#45c6bf"/><circle cx="155" cy="155" r="4.5" fill="#fff" fill-opacity=".55"/>';
    return `<div class="wheel"><i class="ptr"></i><svg viewBox="0 0 320 320" data-to="${to}" style="transform:rotate(${from}deg)">${s}</svg></div>`;
  },
  tv(S, P) {
    const v = S.view, g = S.g, who = esc(nameOf(P, v.cur));
    if (S.phase === 'spin' || S.phase === 'spinning') {
      const w = this.wheelSVG(g.cats, S.phase === 'spinning' ? v.from : v.rot, v.rot);
      return `<div class="spinwrap">${w}<div>${kicker(`Turn ${v.turn} of ${v.of}`)}<h2 class="qbig">${S.phase === 'spin' ? `${who}, tap <u>Spin</u> on your phone!` : `${who} is spinning…`}</h2><p class="lvl">${LEVELS[(P[v.cur] && P[v.cur].level) || 'I']} level</p></div></div>`;
    }
    if (S.phase === 'ask') return `<div class="askwrap"><div class="asktop"><p class="chipc" style="--cc:${v.catColor}">${esc(v.cat)} · ${esc(who)}'s ${LEVELS[v.lvl]} question</p>${arr(v.gone).length ? '<p class="helper">50/50 helper used</p>' : ''}${sayBtn()}</div>${v.img ? `<img class="qimg" src="${esc(imgURL(v.img))}" alt="">` : ''}${big(v.q)}${optsTV(v.opts, { gone: v.gone })}</div>`;
    if (S.phase === 'reveal') return `<p class="verdict ${v.ok ? 'yes' : 'no'}">${v.ok ? `${who} got it! +1,000` : v.picked < 0 ? `Time's up! The answer is ${esc(v.opts[v.right])}.` : `Not quite! The answer is ${esc(v.opts[v.right])}.`}</p>${big(v.q, 'small')}${optsTV(v.opts, { right: v.right })}${storyBox(v.story, v.src, v.img, v.cal)}`;
  },
  phone(S, me, mine, P = {}) {
    const v = S.view, who = nameOf(P, v.cur);
    if (v.cur !== me) {
      if (S.phase === 'reveal') return lookTV(v.ok ? `${who} got it!` : 'Eyes on the TV!', v.ok ? 'Give them a cheer.' : `The answer was ${v.opts[v.right]}.`);
      return waitWho(P[v.cur], S.phase === 'ask' ? `${who} is answering` : S.phase === 'spinning' ? `${who} is spinning…` : `${who}'s turn`, S.phase === 'ask' ? 'Watch the TV and cheer them on!' : 'Cheer them on! Your turn is coming.');
    }
    if (S.phase === 'spin') return mine ? wait('Spinning…', 'Watch the wheel on the TV') : `<div class="spinme"><h2>Your turn!</h2><button class="spinbtn" data-choice="0" aria-label="Spin the wheel"><span>Spin!</span></button><p>Tap the wheel. It spins on the TV.</p></div>`;
    if (S.phase === 'spinning') return wait('Spinning…', 'Watch the wheel on the TV');
    if (S.phase === 'ask') {
      const used = !!obj(S.g && S.g.fifty)[me] || arr(v.gone).length > 0, canFifty = !used && v.opts.length > 2;
      const tools = mine ? '' : `<div class="ptools">${canFifty ? `<button class="ghost tool fifty" data-fifty>${PI.half}50/50 helper</button>` : `<span class="tool used">${PI.half}50/50 used</span>`}<button class="ghost tool" data-say>${PI.say}Read it to me</button></div>`;
      return choicesPhone(v.opts, { mine, q: v.q, kick: `${v.cat} · ${LEVELS[v.lvl] || ''}`, off: arr(v.gone), tools });
    }
    if (S.phase === 'reveal') return resultPhone(v.ok, v.ok ? 1000 : 0, v.ok ? 'Nice spin!' : `It was ${v.opts[v.right]}.`, v.ok ? '' : v.picked < 0 ? 'Time’s up!' : '');
    return lookTV();
  }
};

// ---------- 3. Doodle Dash (drawing game) ----------
const doodle = {
  id: 'doodle', name: 'Doodle Dash', color: '#7a4fc9',
  blurb: 'Everyone draws a secret family prompt. Then write fake titles for each drawing and try to spot the real one.',
  settings: [{ k: 'show', label: 'Drawings to judge', opts: [[4, '4'], [6, '6'], [8, '8'], [99, 'All']], def: 6 }],
  check: (C, ps) => ps.length >= 3 ? '' : 'Needs at least 3 players.',
  start(H, o) {
    const ps = H.online().map(p => p.uid); let pr = shuffle(H.C.doodles);
    while (pr.length < ps.length) pr = pr.concat(shuffle(H.C.doodles));
    const prompts = Object.fromEntries(ps.map((u, i) => [u, pr[i]]));
    H.S.g = { prompts, show: +o.show, order: [], i: 0, scores: {}, drawKey: '' };
    H.phase('draw', { dur: T.draw, expect: ps, view: {} });
    H.S.g.drawKey = H.S.key;
  },
  titlePhase(H) { const g = H.S.g, artist = g.order[g.i]; H.phase('title', { dur: T.title, expect: others(H, artist), view: { artist, n: g.i + 1, of: g.order.length } }); },
  next(H) {
    const S = H.S, g = S.g;
    if (S.phase === 'draw') {
      const done = Object.entries(H.inputs).filter(([, v]) => v && arr(v.s).length).map(([u]) => u);
      g.order = shuffle(done).slice(0, g.show); g.i = 0;
      if (!g.order.length) return H.finish();
      return this.titlePhase(H);
    }
    if (S.phase === 'title') {
      const artist = S.view.artist, real = g.prompts[artist], groups = {};
      for (const [u, v] of Object.entries(H.inputs)) {
        const t = String(obj(v).t || '').trim().slice(0, 60); if (!t || u === artist || norm(t) === norm(real)) continue;
        (groups[norm(t)] = groups[norm(t)] || { t, by: [] }).by.push(u);
      }
      const choices = shuffle([{ t: real, real: 1, by: [artist] }, ...shuffle(Object.values(groups)).slice(0, 8)]);
      return H.phase('vote', { dur: T.vote, expect: others(H, artist), view: { ...S.view, choices } });
    }
    if (S.phase === 'vote') {
      const artist = S.view.artist, ch = S.view.choices, gains = {}, votes = {};
      for (const [u, v] of Object.entries(H.inputs)) {
        const c = ch[obj(v).a]; if (!c) continue; votes[u] = obj(v).a;
        if (c.real) { add(g, u, 1000); gains[u] = (gains[u] || 0) + 1000; add(g, artist, 500); gains[artist] = (gains[artist] || 0) + 500; }
        else for (const b of arr(c.by)) if (b !== u) { add(g, b, 500); gains[b] = (gains[b] || 0) + 500; }
      }
      return H.phase('reveal', { auto: 11, view: { ...S.view, votes, gains } });
    }
    if (S.phase === 'reveal') { g.i++; return g.i >= g.order.length ? H.finish() : this.titlePhase(H); }
  },
  tv(S, P) {
    const v = S.view;
    if (S.phase === 'draw') return `<div class="center">${kicker('Doodle Dash')}${big('Everyone is drawing!', 'huge')}<p class="sub">Look at your phone for your secret prompt. Don't say it out loud.</p></div>`;
    const art = `<canvas class="art" width="900" height="900" data-art="${esc(v.artist)}"></canvas>`;
    if (S.phase === 'title') return `<div class="artrow">${art}<div>${kicker(`Drawing ${v.n} of ${v.of}`)}${big('What is this a drawing of?')}<p class="sub">Write a title on your phone that could fool everyone. ${esc(nameOf(P, v.artist))}, keep a straight face.</p></div></div>`;
    if (S.phase === 'vote') return `<div class="artrow">${art}<div>${kicker('Which is the real title?')}<ol class="choices${v.choices.length > 6 ? ' many' : ''}">${v.choices.map((c, i) => `<li style="--ac:${ANS[i % 10].c}"><b>${ANS[i % 10].k}</b>${esc(c.t)}</li>`).join('')}</ol></div></div>`;
    if (S.phase === 'reveal') {
      const vc = i => Object.values(obj(v.votes)).filter(x => x === i).length;
      return `<div class="artrow">${art}<div>${kicker(`${nameOf(P, v.artist)} drew…`)}<ol class="choices rev${v.choices.length > 6 ? ' many' : ''}">${v.choices.map((c, i) => `<li class="${c.real ? 'real' : ''}" style="--ac:${ANS[i % 10].c}"><b>${vc(i)}</b><span>${esc(c.t)}<small>${c.real ? 'The real prompt' : 'Fib by ' + arr(c.by).map(u => esc(nameOf(P, u))).join(' & ')}</small></span></li>`).join('')}</ol>${gainsList(v.gains, P, 8)}</div></div>`;
    }
  },
  phone(S, me, mine, P) {
    const v = S.view, g = S.g;
    if (S.phase === 'draw') {
      if (!g.prompts[me]) return wait('Drawings are underway', 'You’ll join the next game', 'pencil');
      if (mine) return wait('Nice work!', 'Waiting for the other artists…', 'check');
      return `<div class="drawbox"><p class="prompt"><small>Your secret prompt · shh!</small><b>${esc(g.prompts[me])}</b></p><canvas id="pad" width="1000" height="1000" aria-label="Drawing pad"></canvas><div class="dtools"><div class="inks" id="inks"></div><div class="dline"><div class="pens" id="pens"></div><button type="button" class="ghost dbtn" id="undo">Undo</button><button type="button" class="ghost dbtn" id="clear">Clear</button></div></div><button type="button" class="go big" id="done">I'm done</button></div>`;
    }
    if (S.phase === 'title') {
      if (v.artist === me) return wait('That’s your drawing!', 'Keep a straight face while everyone writes titles.', 'star');
      if (mine) return wait('Got it!', 'Waiting for the others…', 'check');
      return formPhone('title', [{ id: 't', name: 't', max: 60, kick: 'Look at the drawing on the TV', label: 'What is this a drawing of?', ph: 'A title that could fool everyone' }], 'Send my title');
    }
    if (S.phase === 'vote') {
      if (v.artist === me) return wait('Your drawing is up!', 'Everyone is voting on the real title.', 'star');
      const own = v.choices.map((c, i) => arr(c.by).includes(me) ? i : -1).filter(i => i >= 0);
      return choicesPhone(v.choices.map(c => c.t), { mine, own, q: 'Which one is the real title?', kick: 'Find the truth' });
    }
    if (S.phase === 'reveal') {
      const p = obj(v.gains)[me], ch = arr(v.choices), real = ch.findIndex(c => c.real), my = obj(v.votes)[me];
      if (v.artist === me) return p ? resultPhone(true, p, 'People spotted your real prompt.', 'Nice drawing!') : lookTV('Nobody guessed it!', 'See the votes on the TV.');
      if (p) return resultPhone(true, p, my === real ? (p > 1000 ? 'You found the real title, and your fib fooled people!' : 'You found the real title!') : 'Your title fooled people!', my === real ? 'Nice!' : 'Gotcha!');
      if (my != null && ch[real]) return resultPhone(false, 0, `The real title was “${ch[real].t}”.`, 'Fooled you!');
      return lookTV();
    }
    return lookTV();
  },
  validate(S, me, f) { if (S.phase === 'title' && norm(f.t) === norm(S.g.prompts[S.view.artist])) return 'Too close to the real title! Write a fib.'; return ''; }
};

// ---------- 4. Two Truths & a Lie ----------
const truths = {
  id: 'truths', name: 'Two Truths & a Lie', color: '#e07b1a',
  blurb: 'Three statements about a family member. Everyone votes for the lie.',
  settings: [{ k: 'n', label: 'Rounds', opts: [[5, '5'], [8, '8'], [12, '12'], [99, 'All']], def: 8 }],
  check: C => C.truths.length ? '' : 'Add rows to the TwoTruths tab (they come from the survey).',
  start(H, o) { H.S.g = { rounds: shuffle(H.C.truths).slice(0, +o.n).map(r => ({ person: r.person, items: shuffle([{ t: r.t[0] }, { t: r.t[1] }, { t: r.lie, lie: 1 }]) })), i: 0, scores: {} }; this.ask(H); },
  ask(H) { const g = H.S.g, r = g.rounds[g.i], subj = matchPlayer(H, r.person); H.phase('vote', { dur: T.truths, expect: others(H, subj), view: { person: r.person, subj, items: r.items.map(x => x.t), n: g.i + 1, of: g.rounds.length } }); },
  next(H) {
    const S = H.S, g = S.g, r = g.rounds[g.i];
    if (S.phase === 'vote') {
      const lie = r.items.findIndex(x => x.lie), pickers = r.items.map(() => []), gains = {};
      for (const [u, v] of Object.entries(H.inputs)) { const a = obj(v).a; if (pickers[a]) pickers[a].push(u); if (a === lie) { add(g, u, 1000); gains[u] = 1000; } else if (S.view.subj && a != null) { add(g, S.view.subj, 300); gains[S.view.subj] = (gains[S.view.subj] || 0) + 300; } }
      return H.phase('reveal', { auto: 9, view: { ...S.view, right: lie, pickers, gains } });
    }
    if (S.phase === 'reveal') { g.i++; return g.i >= g.rounds.length ? H.finish() : this.ask(H); }
  },
  tv(S, P) {
    const v = S.view;
    if (S.phase === 'vote') return `${kicker(`Round ${v.n} of ${v.of}`)}${big(`${v.person}: which one is the lie?`)}${optsTV(v.items)}`;
    if (S.phase === 'reveal') return `${kicker(`${v.person}'s lie was…`)}${big(v.items[v.right])}${optsTV(v.items, { right: v.right, pickers: v.pickers, P })}${gainsList(v.gains, P, 8)}`;
  },
  phone(S, me, mine) {
    const v = S.view;
    if (S.phase === 'vote') return v.subj === me ? wait('This one’s about you!', 'Keep a poker face. You score when people pick a truth.', 'star') : choicesPhone(v.items, { mine, q: `Which is ${v.person}'s lie?`, kick: 'Spot the lie' });
    if (S.phase === 'reveal') {
      const p = obj(v.gains)[me];
      if (v.subj === me) { const n = Math.round((p || 0) / 300); return resultPhone(n > 0, p, n ? 'Your poker face paid off.' : 'Everyone saw right through you!', n ? `You fooled ${n} ${n === 1 ? 'person' : 'people'}!` : 'Nobody was fooled'); }
      return resultPhone(!!p, p, p ? 'You spotted the lie!' : `The lie was: ${v.items[v.right]}`);
    }
    return lookTV();
  }
};

// ---------- 5. Guess Who ----------
const guess = {
  id: 'guess', name: 'Guess Who', color: '#c94f97',
  blurb: 'A survey answer or a baby picture appears. Everyone guesses which family member it is.',
  settings: [{ k: 'n', label: 'Rounds', opts: [[8, '8'], [12, '12'], [16, '16']], def: 12 }],
  check: C => C.guess.length ? '' : 'Add rows to the GuessWho tab first.',
  start(H, o) {
    const names = [...new Set([...H.C.people.map(p => p.name), ...H.C.guess.map(g => g.person), ...H.C.truths.map(t => t.person)])];
    const rounds = shuffle(H.C.guess).slice(0, +o.n).map(r => {
      const wrong = shuffle(names.filter(x => norm(x) !== norm(r.person))).slice(0, 3);
      return { person: r.person, clue: r.clue, img: r.img, opts: shuffle([r.person, ...wrong]) };
    });
    H.S.g = { rounds, i: 0, scores: {} }; this.ask(H);
  },
  ask(H) { const g = H.S.g, r = g.rounds[g.i], subj = matchPlayer(H, r.person); H.phase('ask', { dur: T.guess, expect: others(H, subj), view: { clue: r.clue, img: r.img, opts: r.opts, subj, n: g.i + 1, of: g.rounds.length, t0: H.now() } }); },
  next(H) {
    const S = H.S, g = S.g, r = g.rounds[g.i];
    if (S.phase === 'ask') {
      const right = r.opts.indexOf(r.person), pickers = r.opts.map(() => []), gains = {};
      for (const [u, v] of Object.entries(H.inputs)) { const a = obj(v).a; if (pickers[a]) pickers[a].push(u); if (a === right) { const p = speedPts(v.t, S.view.t0, T.guess); gains[u] = p; add(g, u, p); } }
      return H.phase('reveal', { auto: 8, view: { ...S.view, right, pickers, gains } });
    }
    if (S.phase === 'reveal') { g.i++; return g.i >= g.rounds.length ? H.finish() : this.ask(H); }
  },
  tv(S, P) {
    const v = S.view;
    const clue = `${v.img ? `<img class="qimg tall" src="${esc(imgURL(v.img))}" alt="Who is this?">` : ''}${v.clue ? big(`“${v.clue}”`) : ''}`;
    if (S.phase === 'ask') return `${kicker(`Guess Who · ${v.n} of ${v.of}`)}<div class="askwrap">${clue}${optsTV(v.opts)}</div>`;
    if (S.phase === 'reveal') return `${kicker(`Guess Who · ${v.n} of ${v.of}`)}<p class="verdict yes">It was ${esc(v.opts[v.right])}!</p><div class="askwrap">${clue}${optsTV(v.opts, { right: v.right, pickers: v.pickers, P })}</div>`;
  },
  phone(S, me, mine) {
    const v = S.view;
    if (S.phase === 'ask') return v.subj === me ? wait('It’s you!', 'Act natural while everyone guesses.', 'star') : choicesPhone(v.opts, { mine, q: v.clue ? (/^[“"]/.test(v.clue) ? v.clue : `“${v.clue}”`) : 'Look at the picture on the TV.', kick: 'Who is it?' });
    if (S.phase === 'reveal') { const p = obj(v.gains)[me]; return v.subj === me ? lookTV('Busted!', 'Everyone knows it’s you now.') : resultPhone(!!p, p, p ? 'Faster right answers score more.' : `It was ${v.opts[v.right]}.`); }
    return lookTV();
  }
};

// ---------- 6. Family Fibs ----------
const fibs = {
  id: 'fibs', name: 'Family Fibs', color: '#3a6fc4',
  blurb: 'A real family fact with a blank. Write a fake answer to fool everyone, then find the truth.',
  settings: [{ k: 'n', label: 'Rounds', opts: [[4, '4'], [6, '6'], [8, '8']], def: 6 }],
  check: (C, ps) => !C.fibs.length ? 'Add rows to the Fibs tab first.' : ps.length < 2 ? 'Needs at least 2 players.' : '',
  start(H, o) { H.S.g = { rounds: shuffle(H.C.fibs).slice(0, +o.n), i: 0, scores: {} }; this.write(H); },
  write(H) { const g = H.S.g, r = g.rounds[g.i]; H.phase('write', { dur: T.write, expect: others(H), view: { prompt: r.prompt, n: g.i + 1, of: g.rounds.length } }); },
  next(H) {
    const S = H.S, g = S.g, r = g.rounds[g.i];
    if (S.phase === 'write') {
      const groups = {};
      for (const [u, v] of Object.entries(H.inputs)) { const t = String(obj(v).t || '').trim().slice(0, 50); if (!t || norm(t) === norm(r.a)) continue; (groups[norm(t)] = groups[norm(t)] || { t, by: [] }).by.push(u); }
      const choices = shuffle([{ t: r.a, real: 1, by: [] }, ...shuffle(Object.values(groups)).slice(0, 8)]);
      return H.phase('vote', { dur: T.vote, expect: others(H), view: { ...S.view, choices } });
    }
    if (S.phase === 'vote') {
      const ch = S.view.choices, gains = {}, votes = {};
      for (const [u, v] of Object.entries(H.inputs)) {
        const c = ch[obj(v).a]; if (!c) continue; votes[u] = obj(v).a;
        if (c.real) { add(g, u, 1000); gains[u] = (gains[u] || 0) + 1000; } else for (const b of arr(c.by)) if (b !== u) { add(g, b, 500); gains[b] = (gains[b] || 0) + 500; }
      }
      return H.phase('reveal', { auto: r.story ? 12 : 9, view: { ...S.view, votes, gains, story: r.story } });
    }
    if (S.phase === 'reveal') { g.i++; return g.i >= g.rounds.length ? H.finish() : this.write(H); }
  },
  tv(S, P) {
    const v = S.view, p = esc(v.prompt).replace(/_{2,}/g, '<span class="blank">______</span>');
    if (S.phase === 'write') return `${kicker(`Family Fibs · ${v.n} of ${v.of}`)}<h2 class="qbig">${p}</h2><p class="sub">Type a fake answer on your phone that sounds true.</p>`;
    if (S.phase === 'vote') return `${kicker('Find the truth!')}<h2 class="qbig small">${p}</h2><ol class="choices wide${v.choices.length > 6 ? ' many' : ''}">${v.choices.map((c, i) => `<li style="--ac:${ANS[i % 10].c}"><b>${ANS[i % 10].k}</b>${esc(c.t)}</li>`).join('')}</ol>`;
    if (S.phase === 'reveal') {
      const vc = i => Object.values(obj(v.votes)).filter(x => x === i).length;
      return `${kicker(`Family Fibs · ${v.n} of ${v.of} · the truth`)}<h2 class="qbig small">${p}</h2><ol class="choices wide rev${v.choices.length > 6 ? ' many' : ''}">${v.choices.map((c, i) => `<li class="${c.real ? 'real' : ''}" style="--ac:${ANS[i % 10].c}"><b>${vc(i)}</b><span>${esc(c.t)}<small>${c.real ? 'The truth' : 'Fib by ' + arr(c.by).map(u => esc(nameOf(P, u))).join(' & ')}</small></span></li>`).join('')}</ol>${storyBox(v.story, '', '', null)}`;
    }
  },
  phone(S, me, mine) {
    const v = S.view;
    if (S.phase === 'write') return mine ? wait('Fib locked in!', 'Waiting for everyone else…', 'check') : formPhone('fib', [{ id: 't', name: 't', max: 50, kick: 'Fill in the blank with a fib', label: blanksP(v.prompt), ph: 'Something believable' }], 'Send my fib');
    if (S.phase === 'vote') { const own = v.choices.map((c, i) => arr(c.by).includes(me) ? i : -1).filter(i => i >= 0); return choicesPhone(v.choices.map(c => c.t), { mine, own, q: v.prompt, qhtml: blanksP(v.prompt), kick: 'Which one is true?' }); }
    if (S.phase === 'reveal') {
      const p = obj(v.gains)[me], ch = arr(v.choices), real = ch.findIndex(c => c.real), my = obj(v.votes)[me];
      if (p) return resultPhone(true, p, my === real ? (p > 1000 ? 'You found the truth, and your fib fooled people!' : 'You found the truth!') : 'Your fib fooled people!', my === real ? 'Nice!' : 'Gotcha!');
      if (my != null && ch[real]) return resultPhone(false, 0, `The truth was “${ch[real].t}”.`, 'Fooled you!');
      return lookTV();
    }
    return lookTV();
  },
  validate(S, me, f) { const r = S.g.rounds[S.g.i]; if (S.phase === 'write' && norm(f.t) === norm(r.a)) return 'That’s the real answer! Write a fib instead.'; return ''; }
};

// ---------- 7. Quip Off ----------
const quip = {
  id: 'quip', name: 'Quip Off', color: '#e5a50a',
  blurb: 'Two players answer the same funny prompt. Everyone else votes for the better answer.',
  settings: [],
  check: (C, ps) => ps.length >= 3 ? '' : 'Needs at least 3 players.',
  start(H) {
    const ps = shuffle(H.online().map(p => p.uid)), n = ps.length; let pr = shuffle(H.C.quips);
    while (pr.length < n) pr = pr.concat(shuffle(H.C.quips));
    H.S.g = { m: ps.map((u, k) => ({ p: pr[k], by: [ps[k], ps[(k + 1) % n]], ans: ['', ''] })), i: 0, scores: {} };
    H.phase('write', { dur: T.quipWrite, expect: ps, view: {} });
  },
  vote(H) { const g = H.S.g, m = g.m[g.i]; H.phase('vote', { dur: T.quipVote, expect: others(H, ...m.by), view: { n: g.i + 1, of: g.m.length, p: m.p, ans: m.ans, by: m.by } }); },
  next(H) {
    const S = H.S, g = S.g;
    if (S.phase === 'write') {
      g.m.forEach((m, k) => { m.ans = m.by.map(u => String(obj(H.inputs[u])['q' + k] || '').trim().slice(0, 80)); });
      g.i = 0; return this.vote(H);
    }
    if (S.phase === 'vote') {
      const m = g.m[g.i], cnt = [0, 0], gains = {};
      for (const v of Object.values(H.inputs)) { const a = obj(v).a; if (a === 0 || a === 1) cnt[a]++; }
      const tot = cnt[0] + cnt[1];
      m.by.forEach((u, j) => { if (!tot || !m.ans[j]) return; let p = Math.round(1000 * cnt[j] / tot); if (cnt[j] === tot) p += 500; if (p) { add(g, u, p); gains[u] = p; } });
      return H.phase('reveal', { auto: 7, view: { ...S.view, cnt, gains } });
    }
    if (S.phase === 'reveal') { g.i++; return g.i >= g.m.length ? H.finish() : this.vote(H); }
  },
  tv(S, P) {
    const v = S.view;
    if (S.phase === 'write') return `<div class="center">${kicker('Quip Off')}${big('Answer your two prompts!', 'huge')}<p class="sub">Funny beats correct. Everyone else will vote.</p></div>`;
    const tot = v.cnt ? v.cnt[0] + v.cnt[1] : 0;
    const card = j => {
      const rev = S.phase === 'reveal', pct = rev && tot ? Math.round(100 * v.cnt[j] / tot) : 0;
      return `<div class="quipcard${rev && tot && v.cnt[j] === tot ? ' sweep' : ''}" style="--ac:${ANS[j].c}"><b>${ANS[j].k}</b><p>${esc(v.ans[j] || '(no answer)')}</p>${rev ? `<footer>${avatar(P[v.by[j]], 'sm')}${esc(nameOf(P, v.by[j]))}<em>${pct}%</em>${obj(v.gains)[v.by[j]] ? `<strong>+${v.gains[v.by[j]]}</strong>` : ''}</footer>` : ''}</div>`;
    };
    return `${kicker(`Matchup ${v.n} of ${v.of}${S.phase === 'reveal' && tot && (v.cnt[0] === tot || v.cnt[1] === tot) ? ' · Clean sweep!' : ''}`)}${big(v.p)}<div class="quiprow">${card(0)}<span class="vs" aria-hidden="true">vs</span>${card(1)}</div>`;
  },
  phone(S, me, mine) {
    const v = S.view, g = S.g;
    if (S.phase === 'write') {
      const mineK = g.m.map((m, k) => m.by.includes(me) ? k : -1).filter(k => k >= 0);
      if (!mineK.length) return wait('Prompts are underway', 'You’ll vote in a minute', 'pencil');
      if (mine) return wait('Answers in!', 'Waiting for everyone else…', 'check');
      return formPhone('quip', mineK.map((k, j) => ({ id: 'q' + k, name: 'q' + k, max: 80, kick: mineK.length > 1 ? `Prompt ${j + 1} of ${mineK.length}` : 'Your prompt', label: esc(g.m[k].p), ph: 'Make the family laugh' })), mineK.length > 1 ? 'Send both' : 'Send');
    }
    if (S.phase === 'vote') return v.by.includes(me) ? wait('That’s your matchup!', 'Everyone else is voting.', 'laugh') : choicesPhone(v.ans.map(a => a || '(no answer)'), { mine, q: v.p, kick: 'Which answer is funnier?' });
    if (S.phase === 'reveal') {
      const p = obj(v.gains)[me], j = arr(v.by).indexOf(me), cnt = arr(v.cnt), tot = (cnt[0] || 0) + (cnt[1] || 0);
      if (j >= 0) { const pct = tot ? Math.round(100 * (cnt[j] || 0) / tot) : 0; return resultPhone(!!p, p, tot ? `${pct}% of the votes${cnt[j] === tot ? '. Clean sweep!' : '.'}` : 'Nobody voted this time.', p ? 'Ha!' : 'Tough crowd'); }
      return p ? resultPhone(true, p, '', 'Ha!') : lookTV('Who won the laugh?', 'The votes are on the TV.');
    }
    return lookTV();
  }
};

// ---------- 8. Memory Match with baby pictures (take turns) ----------
// A face-down board of baby pictures on the TV. On your turn, flip two cards from your phone.
// A match scores 1,000 and you go again. "Photos": find both copies of a picture, then everyone
// guesses whose baby picture it was for bonus points. "Names": match each baby picture to the grown-up's name card.
const memory = {
  id: 'memory', name: 'Memory Match', color: '#25a06a',
  blurb: 'Take turns flipping two cards on the TV to find matching baby pictures. A match scores and you go again.',
  settings: [{ k: 'n', label: 'Pairs', opts: [[6, '6'], [8, '8'], [10, '10'], [12, '12']], def: 8 }, { k: 'mode', label: 'Match', opts: [['pic', 'Photos'], ['name', 'Names']], def: 'pic' }],
  check: C => arr(C.babies).length >= 3 ? '' : 'Add baby pictures to the Babies tab first.',
  cols: n => n <= 16 ? 4 : n <= 20 ? 5 : 6,
  start(H, o) {
    const one = {}; for (const b of shuffle(H.C.babies)) { const k = norm(b.person); if (!one[k]) one[k] = b; }
    const babies = shuffle(Object.values(one)).slice(0, +o.n || 8).map(b => ({ person: b.person, img: b.img }));
    const deck = shuffle(babies.flatMap((b, p) => [{ p, k: 0 }, { p, k: 1 }]));
    H.S.g = { order: [], turn: 0, mode: o.mode === 'name' ? 'name' : 'pic', babies, deck, found: deck.map(() => 0), pairs: {}, scores: {} };
    this.turn(H);
  },
  // whose turn: skip anyone who left, and fold in anyone who joined since the last turn
  turn(H, again = false) {
    const g = H.S.g, here = u => H.P[u] && H.P[u].online !== false;
    for (const p of H.online()) if (!g.order.includes(p.uid)) g.order.push(p.uid);
    for (let k = 0; k < g.order.length && !here(g.order[g.turn % g.order.length]); k++) { g.turn++; again = false; }
    const cur = g.order[g.turn % g.order.length];
    if (!cur || !here(cur)) return H.finish();
    H.phase('pick1', { dur: T.flip, expect: [cur], view: { cur, open: [], again } });
  },
  next(H) {
    const S = H.S, g = S.g, v = S.view, cur = v.cur, open = arr(v.open);
    const ok = i => Number.isInteger(i) && i >= 0 && i < g.deck.length && !g.found[i] && !open.includes(i);
    if (S.phase === 'pick1') {
      const a = obj(H.inputs[cur]).a;
      if (!ok(a)) return H.phase('show', { auto: 3, view: { cur, open: [], miss: 1 } });
      return H.phase('pick2', { dur: T.flip, expect: [cur], view: { cur, open: [a], flip: a } });
    }
    if (S.phase === 'pick2') {
      const a = open[0], b = obj(H.inputs[cur]).a;
      if (!ok(b)) return H.phase('show', { auto: 3.5, view: { cur, open: [a], miss: 1 } });
      const p = g.deck[a].p;
      if (p !== g.deck[b].p) return H.phase('show', { auto: 4, view: { cur, open: [a, b], flip: b } });
      g.found[a] = g.found[b] = cur; g.pairs[cur] = (g.pairs[cur] || 0) + 1; add(g, cur, 1000);
      const gains = { [cur]: 1000 }, person = g.babies[p].person;
      if (g.mode === 'pic') { // everyone guesses whose baby picture it is
        const names = [...new Set([...H.C.people.map(x => x.name), ...H.C.babies.map(x => x.person)])].filter(x => norm(x) !== norm(person));
        const opts = shuffle([person, ...shuffle(names).slice(0, 3)]), subj = matchPlayer(H, person);
        return H.phase('who', { dur: T.who, expect: others(H, subj), view: { cur, open: [a, b], flip: b, p, opts, subj, gains, t0: H.now() } });
      }
      return H.phase('show', { auto: 4.5, view: { cur, open: [a, b], flip: b, p, match: 1, gains } });
    }
    if (S.phase === 'who') {
      const right = v.opts.indexOf(g.babies[v.p].person), pickers = v.opts.map(() => []), gains = { ...obj(v.gains) };
      for (const [u, x] of Object.entries(H.inputs)) {
        const a = obj(x).a; if (!pickers[a]) continue; pickers[a].push(u);
        if (a === right) { const pts = Math.round(speedPts(x.t, v.t0, T.who) / 2); add(g, u, pts); gains[u] = (gains[u] || 0) + pts; }
      }
      return H.phase('show', { auto: 6, view: { ...v, flip: -1, match: 1, right, pickers, gains } });
    }
    if (S.phase === 'show') {
      if (g.found.every(Boolean)) return H.finish();
      if (v.match) return this.turn(H, true);
      g.turn++; return this.turn(H);
    }
  },
  // one card face: the baby picture, or (Baby + name) the grown-up's name
  face(g, c) {
    const b = g.babies[c.p] || {};
    return g.mode === 'name' && c.k === 1 ? `<span class="mmname"><small>Baby</small>${esc(b.person)}</span>` : `<img src="${esc(imgURL(b.img))}" alt="">`;
  },
  board(S, P) {
    const g = S.g, v = S.view, open = arr(v.open), found = arr(g.found), n = g.deck.length, cols = this.cols(n);
    return `<div class="mmboard" style="--cols:${cols};--rows:${Math.ceil(n / cols)}">${g.deck.map((c, i) => {
      const f = found[i], up = open.includes(i);
      const cls = (up || f ? ' up' : '') + (f && !up ? ' done' : '') + (f && up ? ' got' : '') + (i === v.flip ? ' flip' : '') + (g.mode === 'name' && c.k === 1 ? ' nm' : '');
      return `<div class="mmcard${cls}"${f ? ` style="--pc:${esc((P[f] && P[f].color) || '#ffd23f')}"` : ''}><div class="mmback"><span>${i + 1}</span></div><div class="mmface">${this.face(g, c)}${f && !up ? `<i class="mmby">${avatar(P[f], 'sm')}</i>` : ''}</div></div>`;
    }).join('')}</div>`;
  },
  tv(S, P) {
    const g = S.g, v = S.view, who = esc(nameOf(P, v.cur)), done = arr(g.found).filter(Boolean).length / 2, tot = g.deck.length / 2;
    const b = v.p != null ? g.babies[v.p] : null;
    if (S.phase === 'who' || (S.phase === 'show' && v.opts)) {
      const rev = S.phase === 'show';
      return `<div class="mmwho"><figure class="pic snap mmbig"><img src="${esc(imgURL(b.img))}" alt="The baby picture ${who} just matched"></figure><div class="mmask">${kicker(`${who} found a pair! · ${done} of ${tot}`)}${rev ? `<p class="verdict yes">That’s baby ${esc(b.person)}!</p>` : big('Whose baby picture is this?')}${optsTV(v.opts, rev ? { right: v.right, pickers: v.pickers, P } : {})}${rev ? gainsList(v.gains, P, 10) : '<p class="sub">Guess on your phone. Faster right answers score more.</p>'}</div></div>`;
    }
    let line;
    if (S.phase === 'pick1') line = v.again ? 'Go again! Pick a card on your phone.' : 'Pick a card on your phone.';
    else if (S.phase === 'pick2') line = 'Now find its match!';
    else if (v.miss) line = 'Time’s up! On to the next player.';
    else if (v.match) line = `It’s a match! That’s baby ${esc(b.person)}. +1,000`;
    else line = 'No match. Remember where those two are!';
    const rows = Object.entries(obj(g.pairs)).filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1]).slice(0, 6);
    const side = `<aside class="mmside">${kicker(`${done} of ${tot} pairs found`)}<div class="mmturn">${avatar(P[v.cur], 'lg')}<h2>${S.phase === 'show' ? who : `${who}’s turn`}</h2></div><p class="mmline${S.phase === 'show' ? (v.match ? ' yes' : ' no') : ''}">${line}</p>${rows.length ? `<ul class="mmpairs">${rows.map(([u, n]) => `<li>${avatar(P[u], 'sm')}<span class="nm">${esc(nameOf(P, u))}</span><b>${n} ${n === 1 ? 'pair' : 'pairs'}</b></li>`).join('')}</ul>` : `<p class="mmtip">${g.mode === 'name' ? 'Match each baby picture to a name card.' : 'Find the two matching baby pictures.'}</p>`}</aside>`;
    return `<div class="mmwrap">${side}<div class="mmbox">${this.board(S, P)}</div></div>`;
  },
  // the phone's copy of the board: numbered buttons in the same layout as the TV
  pgrid(S) {
    const g = S.g, v = S.view, open = arr(v.open), found = arr(g.found);
    return `<div class="mmgrid" style="--cols:${this.cols(g.deck.length)}">${g.deck.map((c, i) => {
      if (found[i] || open.includes(i)) return `<button class="mmt ${found[i] ? 'done' : 'up'}${g.mode === 'name' && c.k === 1 ? ' nm' : ''}" disabled aria-label="Card ${i + 1}, ${found[i] ? 'already matched' : 'flipped'}">${this.face(g, c)}</button>`;
      return `<button class="mmt" data-choice="${i}" aria-label="Card ${i + 1}"><span>${i + 1}</span></button>`;
    }).join('')}</div>`;
  },
  phone(S, me, mine, P = {}) {
    const v = S.view, g = S.g, who = nameOf(P, v.cur), myTurn = v.cur === me;
    if (S.phase === 'pick1' || S.phase === 'pick2') {
      if (!myTurn) return waitWho(P[v.cur], `${who}’s turn`, S.phase === 'pick1' ? 'Watch the TV and remember where each baby is!' : 'Will they find the match?');
      if (mine) return wait('Flipping…', 'Watch the card on the TV');
      return `<div class="mmphone"><h2>${S.phase === 'pick2' ? 'Now find its match' : v.again ? 'Go again! Pick a card' : 'Your turn! Pick a card'}</h2>${this.pgrid(S)}<p class="mmhint">${S.phase === 'pick2' ? 'Your first card is face up. Tap the card you think matches it.' : 'Tap any face-down card. It flips on the TV.'}</p></div>`;
    }
    const b = v.p != null && g ? g.babies[v.p] : null;
    if (S.phase === 'who') {
      if (v.subj === me) return wait('That’s your baby picture!', 'Shh! Let everyone guess.', 'star');
      return choicesPhone(v.opts, { mine, q: 'Whose baby picture is this?', kick: 'Name the baby', tools: b ? `<img class="mmq" src="${esc(imgURL(b.img))}" alt="">` : '' });
    }
    if (S.phase === 'show') {
      const pts = obj(v.gains)[me];
      if (v.miss) return myTurn ? resultPhone(false, 0, 'Your turn passed to the next player.', 'Time’s up!') : lookTV();
      if (v.opts) {
        const named = arr(arr(v.pickers)[v.right]).includes(me);
        if (v.subj === me) { const n = arr(arr(v.pickers)[v.right]).length; return resultPhone(true, pts, `${n} ${n === 1 ? 'person' : 'people'} knew it was you.`, 'That’s you!'); }
        if (myTurn) return resultPhone(true, pts, named ? 'Pair found, and you named the baby!' : `Pair found! That was baby ${b ? b.person : ''}.`, 'It’s a match!');
        return resultPhone(named, pts, named ? 'You named the baby!' : `That was baby ${b ? b.person : ''}.`);
      }
      if (myTurn) return v.match ? resultPhone(true, pts, 'You get to go again!', 'It’s a match!') : resultPhone(false, 0, 'Remember where those two are.', 'No match');
      return lookTV(v.match ? 'It’s a match!' : 'No match', v.match ? `${who} goes again.` : 'Remember where those two are!');
    }
    return lookTV();
  }
};

export const GAMES = { trivia, spin, doodle, truths, guess, memory, fibs, quip };
export const ORDER = ['trivia', 'spin', 'doodle', 'truths', 'guess', 'memory', 'fibs', 'quip'];
