// The seven games. Each game has host logic (start/next, run only on the TV) and two views: tv() and phone().
// The TV is the referee: it writes the game state; phones only send their own answers.
import { esc, shuffle, pick, norm, arr, obj, ANS, LEVELS, imgURL, calRing, MONTHS, avatar } from './common.js';

const T = { ask: 20, spinAsk: 30, draw: 90, title: 45, vote: 25, write: 50, quipWrite: 90, quipVote: 15, truths: 30, guess: 20 };
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
function optsTV(opts, { right = -1, counts = null, pickers = null, P = {} } = {}) {
  return `<div class="tvopts n${opts.length}">${opts.map((o, i) => {
    const st = right < 0 ? '' : (i === right ? ' right' : ' wrong');
    const who = pickers ? `<span class="who">${arr(pickers[i]).map(u => avatar(P[u], 'sm')).join('')}</span>` : '';
    return `<div class="tvopt${st}" style="--ac:${ANS[i].c}"><b>${ANS[i].k}</b><span>${esc(o)}</span>${counts ? `<em>${counts[i] || 0}</em>` : ''}${who}</div>`;
  }).join('')}</div>`;
}
function storyBox(story, src, img, cal) {
  let pic = '';
  if (cal && img) pic = `<figure class="cal"><div class="calwrap"><img src="${esc(imgURL(img))}" alt="Grandma's 2027 calendar, ${MONTHS[cal[0] - 1]}"><i class="ring" style="${calRing(cal[0], cal[1])}"></i></div><figcaption>Grandma's calendar: ${MONTHS[cal[0] - 1]} ${cal[1]}</figcaption></figure>`;
  else if (img) pic = `<figure class="pic"><img src="${esc(imgURL(img))}" alt=""></figure>`;
  if (!story && !pic) return '';
  return `<div class="storyrow">${story ? `<div class="story"><b>Story time</b><p>${esc(story)}</p>${src ? `<span class="from">From ${esc(src)}</span>` : ''}</div>` : ''}${pic}</div>`;
}
function gainsList(gains, P, max = 18) {
  const rows = Object.entries(obj(gains)).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, max);
  if (!rows.length) return `<p class="none">Nobody scored this time.</p>`;
  return `<ul class="gains">${rows.map(([u, v]) => `<li>${avatar(P[u], 'sm')}<span>${esc(nameOf(P, u))}</span><b>+${v}</b></li>`).join('')}</ul>`;
}
export function rankTV(scores, P, title = 'Scores', max = 10) {
  const rows = Object.entries(obj(scores)).sort((a, b) => b[1] - a[1]);
  const ps = Object.keys(P).filter(u => !(u in obj(scores))).map(u => [u, 0]);
  const all = rows.concat(ps).slice(0, max);
  return `<div class="rank"><h2>${esc(title)}</h2><ol>${all.map(([u, v], i) => `<li class="${i === 0 && v > 0 ? 'top' : ''}"><span class="pl">${i + 1}</span>${avatar(P[u])}<span class="nm">${esc(nameOf(P, u))}</span><b>${v.toLocaleString()}</b></li>`).join('')}</ol></div>`;
}
// phone pieces
const wait = (t, sub = '') => `<div class="wait"><div class="dots"><i></i><i></i><i></i></div><h2>${esc(t)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div>`;
const lookTV = (t = 'Eyes on the TV!') => `<div class="wait"><h2>${esc(t)}</h2></div>`;
function choicesPhone(opts, { mine = null, off = [], q = '' } = {}) {
  if (mine) return `<div class="wait"><h2>Locked in!</h2><div class="lock" style="--ac:${ANS[mine.a].c}"><b>${ANS[mine.a].k}</b> ${esc(opts[mine.a])}</div><p>Waiting for everyone else…</p></div>`;
  return `${q ? `<p class="pq">${esc(q)}</p>` : ''}<div class="popts n${opts.length}">${opts.map((o, i) => `<button class="popt" data-choice="${i}" style="--ac:${ANS[i].c}"${off.includes(i) ? ' disabled' : ''}><b>${ANS[i].k}</b><span>${esc(o)}</span></button>`).join('')}</div>`;
}
function resultPhone(ok, pts, line) {
  return `<div class="res ${ok ? 'ok' : 'no'}"><h2>${ok ? 'Correct!' : 'Not quite'}</h2>${pts ? `<p class="pts">+${pts}</p>` : ''}${line ? `<p>${esc(line)}</p>` : ''}</div>`;
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
    if (S.phase === 'ask') return `<div class="askwrap">${v.img ? `<img class="qimg" src="${esc(imgURL(v.img))}" alt="">` : ''}${big(v.q)}${optsTV(v.opts)}</div>`;
    if (S.phase === 'reveal') return `${big(v.q, 'small')}${optsTV(v.opts, { right: v.right, pickers: v.pickers, P })}${storyBox(v.story, v.src, v.img, v.cal)}${gainsList(v.gains, P, 18)}`;
    if (S.phase === 'scores') return rankTV(S.g.scores, P, 'Leaderboard');
  },
  phone(S, me, mine) {
    const v = S.view;
    if (S.phase === 'ask') return choicesPhone(v.opts, { mine, q: v.q });
    if (S.phase === 'reveal') { const pts = obj(v.gains)[me]; const picked = arr(v.pickers).findIndex(a => arr(a).includes(me)); return resultPhone(!!pts, pts, picked < 0 ? `No answer. It was ${v.opts[v.right]}.` : pts ? '' : `It was ${v.opts[v.right]}.`); }
    if (S.phase === 'intro') return lookTV(`Question ${v.n} of ${v.of}`);
    return lookTV();
  }
};

// ---------- 2. Pinewood Spin (take turns) ----------
const spin = {
  id: 'spin', name: 'Pinewood Spin', color: '#2bb3b1',
  blurb: 'Take turns. Spin the wheel on your phone and answer a question at your own level while everyone watches.',
  settings: [{ k: 'turns', label: 'Turns each', opts: [[1, '1'], [2, '2'], [3, '3']], def: 1 }],
  check: C => C.trivia.length >= 4 ? '' : 'Add trivia questions to the sheet first.',
  wheelCats(H) { const used = new Set(H.C.trivia.map(t => t.cat)); return H.C.categories.filter(c => used.has(c.id)).slice(0, 10).map(c => ({ id: c.id, short: c.short, color: c.color, t: c.t })); },
  start(H, o) {
    const order = H.online().map(p => p.uid);
    H.S.g = { order, turn: 0, total: order.length * +o.turns, scores: {}, seen: {}, rot: 0, cats: this.wheelCats(H) };
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
    if (S.phase === 'spinning') { const q = g.cur; return H.phase('ask', { dur: T.spinAsk, expect: [cur], view: { cur, q: q.q, opts: q.opts, cat: q.cat, catColor: q.catColor, lvl: q.lvl, img: q.cal ? '' : q.img, turn: S.view.turn, of: S.view.of } }); }
    if (S.phase === 'ask') {
      const q = g.cur, pickd = obj(H.inputs[cur]).a, ok = pickd === q.a; if (ok) add(g, cur, 1000);
      return H.phase('reveal', { auto: q.story ? 11 : 7, view: { ...S.view, right: q.a, picked: pickd ?? -1, ok, story: q.story, src: q.src, img: q.img, cal: q.cal } });
    }
    if (S.phase === 'reveal') { g.turn++; return g.turn >= g.total ? H.finish() : this.spinTurn(H); }
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
    s += '<circle cx="160" cy="160" r="27" fill="#fff"/><circle cx="160" cy="160" r="13" fill="#45c6bf"/>';
    return `<div class="wheel"><i class="ptr"></i><svg viewBox="0 0 320 320" data-to="${to}" style="transform:rotate(${from}deg)">${s}</svg></div>`;
  },
  tv(S, P) {
    const v = S.view, g = S.g, who = esc(nameOf(P, v.cur));
    if (S.phase === 'spin' || S.phase === 'spinning') {
      const w = this.wheelSVG(g.cats, S.phase === 'spinning' ? v.from : v.rot, v.rot);
      return `<div class="spinwrap">${w}<div>${kicker(`Turn ${v.turn} of ${v.of}`)}<h2 class="qbig">${S.phase === 'spin' ? `${who}, tap <u>Spin</u> on your phone!` : `${who} is spinning…`}</h2><p class="lvl">${LEVELS[(P[v.cur] && P[v.cur].level) || 'I']} level</p></div></div>`;
    }
    if (S.phase === 'ask') return `<div class="askwrap"><p class="chipc" style="--cc:${v.catColor}">${esc(v.cat)} · ${esc(who)}'s ${LEVELS[v.lvl]} question</p>${v.img ? `<img class="qimg" src="${esc(imgURL(v.img))}" alt="">` : ''}${big(v.q)}${optsTV(v.opts)}</div>`;
    if (S.phase === 'reveal') return `<p class="verdict ${v.ok ? 'yes' : 'no'}">${v.ok ? `${who} got it! +1,000` : v.picked < 0 ? `Time's up! The answer is ${esc(v.opts[v.right])}.` : `Not quite! The answer is ${esc(v.opts[v.right])}.`}</p>${big(v.q, 'small')}${optsTV(v.opts, { right: v.right })}${storyBox(v.story, v.src, v.img, v.cal)}`;
  },
  phone(S, me, mine) {
    const v = S.view;
    if (v.cur !== me) return S.phase === 'reveal' ? lookTV() : wait(`${S.phase === 'ask' ? 'Watch the TV' : 'Not your turn yet'}`, 'Cheer them on!');
    if (S.phase === 'spin') return mine ? wait('Spinning…') : `<div class="center"><h2 class="pbig">Your turn!</h2><button class="spinbtn" data-choice="0">Spin!</button></div>`;
    if (S.phase === 'spinning') return wait('Spinning…', 'Watch the wheel on the TV');
    if (S.phase === 'ask') return choicesPhone(v.opts, { mine, q: v.q });
    if (S.phase === 'reveal') return resultPhone(v.ok, v.ok ? 1000 : 0, v.ok ? '' : `It was ${v.opts[v.right]}.`);
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
      if (!g.prompts[me]) return wait('Drawings are underway', 'You’ll join the next game');
      if (mine) return wait('Nice work!', 'Waiting for the other artists…');
      return `<div class="drawbox"><p class="prompt">Draw: <b>${esc(g.prompts[me])}</b></p><canvas id="pad" width="1000" height="1000"></canvas><div class="inks" id="inks"></div><div class="row"><button class="ghost" id="undo">Undo</button><button class="ghost" id="clear">Clear</button><button class="go" id="done">I'm done</button></div></div>`;
    }
    if (S.phase === 'title') {
      if (v.artist === me) return wait('That’s your drawing!', 'Keep a straight face while everyone writes titles.');
      if (mine) return wait('Got it!', 'Waiting for the others…');
      return `<form class="pform" data-form="title"><label for="t">Write a believable title for this drawing</label><input id="t" name="t" maxlength="60" autocomplete="off" required placeholder="A title that could fool everyone"><button class="go">Send</button></form>`;
    }
    if (S.phase === 'vote') {
      if (v.artist === me) return wait('Your drawing is up!', 'Everyone is voting on the real title.');
      const off = v.choices.map((c, i) => arr(c.by).includes(me) ? i : -1).filter(i => i >= 0);
      return choicesPhone(v.choices.map(c => c.t), { mine, off, q: 'Which one is the real title?' });
    }
    if (S.phase === 'reveal') { const p = obj(v.gains)[me]; return p ? `<div class="res ok"><h2>Nice!</h2><p class="pts">+${p}</p></div>` : lookTV(); }
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
    if (S.phase === 'vote') return v.subj === me ? wait('This one’s about you!', 'Keep a poker face. You score when people pick a truth.') : choicesPhone(v.items, { mine, q: `Which is ${v.person}'s lie?` });
    if (S.phase === 'reveal') { const p = obj(v.gains)[me]; return v.subj === me ? `<div class="res ok"><h2>You fooled ${Math.round((p || 0) / 300)}</h2>${p ? `<p class="pts">+${p}</p>` : ''}</div>` : resultPhone(!!p, p, p ? '' : `The lie was: ${v.items[v.right]}`); }
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
    if (S.phase === 'reveal') return `${kicker(`It was ${v.opts[v.right]}!`)}<div class="askwrap">${clue}${optsTV(v.opts, { right: v.right, pickers: v.pickers, P })}</div>`;
  },
  phone(S, me, mine) {
    const v = S.view;
    if (S.phase === 'ask') return v.subj === me ? wait('It’s you!', 'Act natural while everyone guesses.') : choicesPhone(v.opts, { mine, q: 'Who is it?' });
    if (S.phase === 'reveal') { const p = obj(v.gains)[me]; return v.subj === me ? lookTV('Busted!') : resultPhone(!!p, p, p ? '' : `It was ${v.opts[v.right]}.`); }
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
      return `<h2 class="qbig small">${p}</h2><ol class="choices wide rev${v.choices.length > 6 ? ' many' : ''}">${v.choices.map((c, i) => `<li class="${c.real ? 'real' : ''}" style="--ac:${ANS[i % 10].c}"><b>${vc(i)}</b><span>${esc(c.t)}<small>${c.real ? 'The truth' : 'Fib by ' + arr(c.by).map(u => esc(nameOf(P, u))).join(' & ')}</small></span></li>`).join('')}</ol>${storyBox(v.story, '', '', null)}`;
    }
  },
  phone(S, me, mine) {
    const v = S.view;
    if (S.phase === 'write') return mine ? wait('Fib locked in!', 'Waiting for everyone else…') : `<form class="pform" data-form="fib"><label for="t">${esc(v.prompt.replace(/_{2,}/g, '___'))}</label><input id="t" name="t" maxlength="50" autocomplete="off" required placeholder="Your believable fib"><button class="go">Send</button></form>`;
    if (S.phase === 'vote') { const off = v.choices.map((c, i) => arr(c.by).includes(me) ? i : -1).filter(i => i >= 0); return choicesPhone(v.choices.map(c => c.t), { mine, off, q: 'Which one is true?' }); }
    if (S.phase === 'reveal') { const p = obj(v.gains)[me]; return p ? `<div class="res ok"><h2>Nice!</h2><p class="pts">+${p}</p></div>` : lookTV(); }
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
    return `${kicker(`Matchup ${v.n} of ${v.of}${S.phase === 'reveal' && tot && (v.cnt[0] === tot || v.cnt[1] === tot) ? ' · Clean sweep!' : ''}`)}${big(v.p)}<div class="quiprow">${card(0)}${card(1)}</div>`;
  },
  phone(S, me, mine) {
    const v = S.view, g = S.g;
    if (S.phase === 'write') {
      const mineK = g.m.map((m, k) => m.by.includes(me) ? k : -1).filter(k => k >= 0);
      if (!mineK.length) return wait('Prompts are underway', 'You’ll vote in a minute');
      if (mine) return wait('Answers in!', 'Waiting for everyone else…');
      return `<form class="pform" data-form="quip">${mineK.map(k => `<label for="q${k}">${esc(g.m[k].p)}</label><input id="q${k}" name="q${k}" maxlength="80" autocomplete="off" required placeholder="Make the family laugh">`).join('')}<button class="go">Send both</button></form>`;
    }
    if (S.phase === 'vote') return v.by.includes(me) ? wait('That’s your matchup!', 'Everyone else is voting.') : choicesPhone(v.ans.map(a => a || '(no answer)'), { mine, q: v.p });
    if (S.phase === 'reveal') { const p = obj(v.gains)[me]; return p ? `<div class="res ok"><h2>Ha!</h2><p class="pts">+${p}</p></div>` : lookTV(); }
    return lookTV();
  }
};

export const GAMES = { trivia, spin, doodle, truths, guess, fibs, quip };
export const ORDER = ['trivia', 'spin', 'doodle', 'truths', 'guess', 'fibs', 'quip'];
