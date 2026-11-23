// Memory Match for the Game Closet games.
// Any game calls MemoryMatch.open({...}) with its own pairs; phones can join with a room code (room.js).
(function () {
  const $ = (r, s) => r.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const rid = () => Math.random().toString(36).slice(2, 10);
  const clone = o => JSON.parse(JSON.stringify(o));
  const PCOL = ['#ffd23f', '#ff7aa8', '#5fe0b5', '#ffa94d', '#b9a3ff', '#7fd1ff', '#ff5c5c', '#ffffff', '#e0c097', '#9be15d'], MAXP = 10;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const BACK = '<svg viewBox="0 0 60 80" aria-hidden="true"><circle cx="30" cy="40" r="19" fill="none" stroke="currentColor" stroke-width="5" opacity=".9"/><path d="M30 26v28M16 40h28" stroke="currentColor" stroke-width="5" stroke-linecap="round" opacity=".55"/></svg>';

  let AC = null, soundOn = true;
  try { soundOn = localStorage.getItem('closet-sound') !== 'off'; } catch (e) {}
  function tone(f, t0, d, type, v) { if (!soundOn) return; try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); const o = AC.createOscillator(), g = AC.createGain(), s = AC.currentTime + t0; o.type = type || 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(.0001, s); g.gain.linearRampToValueAtTime(v || .12, s + .012); g.gain.exponentialRampToValueAtTime(.0001, s + d); o.connect(g); g.connect(AC.destination); o.start(s); o.stop(s + d + .05); } catch (e) {} }
  const SFX = {
    flip: () => { tone(740, 0, .05, 'triangle', .07); tone(1110, .035, .07, 'triangle', .06); },
    good: () => { tone(660, 0, .13); tone(880, .1, .14); tone(1320, .21, .3); },
    miss: () => { tone(392, 0, .16, 'triangle', .09); tone(311, .13, .26, 'triangle', .09); },
    win: () => { [523, 659, 784, 1047, 0, 784, 1047].forEach((f, i) => f && tone(f, i * .14, .3, 'triangle', .13)); }
  };

  const CSS = `
:host([hidden]){display:none!important}
:host{--bg:#1f2a44;--ink:#fff;--card:#fff;--cink:#1d2230;--soft:#5b6478;--line:#e2e6ee;--tint:#f1f3f8;--acc:#f2c14e;--accInk:#2a1d00;--accEdge:#b98a22;--good:#2f8a3a;--bad:#c8323c;--factbg:#fbf2d6;--back:#3d4f7a;--backEdge:#2a3858;--font:'Baloo 2','Fredoka',system-ui,sans-serif;
  position:fixed;inset:0;z-index:2147483100;overflow:auto;background:var(--bg);color:var(--ink);font:17px/1.45 Nunito,system-ui,sans-serif;-webkit-text-size-adjust:100%}
*{box-sizing:border-box;min-width:0}[hidden]{display:none!important}
.mw{max-width:1120px;margin:0 auto;padding:14px max(4vw,14px) 40px}
.mtop{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
.mt{font:800 clamp(24px,4vw,34px)/1.05 var(--font);margin:0}
.mt small{display:block;font:700 15px Nunito,system-ui,sans-serif;opacity:.85;margin-top:2px}
.pill{min-height:40px;padding:6px 14px;border-radius:999px;border:0;background:rgba(255,255,255,.16);color:var(--ink);font:800 15px Nunito,system-ui,sans-serif;cursor:pointer}
.card{background:var(--card);color:var(--cink);border-radius:20px;padding:clamp(16px,3vw,26px);box-shadow:0 18px 40px -20px rgba(0,0,0,.5);max-width:760px;margin:0 auto 14px}
h3{font:800 21px/1.2 var(--font);margin:20px 0 8px}h3:first-child{margin-top:0}
.pr{display:flex;gap:8px;align-items:center;margin-bottom:8px}
.d{width:16px;height:16px;border-radius:50%;flex:none;box-shadow:0 0 0 2px rgba(0,0,0,.1)}
input{flex:1;width:100%;min-height:48px;padding:0 12px;font:700 17px Nunito,system-ui,sans-serif;color:var(--cink);background:var(--tint);border:2px solid var(--line);border-radius:12px}
.x{width:44px;height:44px;flex:none;border-radius:12px;border:0;background:var(--tint);color:var(--cink);font:700 22px/1 Nunito,sans-serif;cursor:pointer}
.x:disabled{opacity:.35;cursor:default}
.ph{flex:none;padding:3px 9px;border-radius:999px;background:var(--tint);font-weight:800;font-size:13px}
.seg{display:flex;gap:8px;flex-wrap:wrap}
.seg button{flex:1 1 0;min-height:48px;padding:4px 8px;border-radius:12px;border:2px solid var(--line);background:var(--card);color:var(--cink);font:800 16px/1.15 Nunito,system-ui,sans-serif;cursor:pointer}
.seg button[aria-pressed=true]{background:var(--cink);color:var(--card);border-color:var(--cink)}
.hint{margin:8px 0 0;color:var(--soft);font-size:14px}
.btn{min-height:52px;padding:0 20px;border-radius:14px;border:0;font:800 20px var(--font);cursor:pointer;background:var(--acc);color:var(--accInk);box-shadow:0 4px 0 var(--accEdge)}
.btn:active{transform:translateY(2px);box-shadow:0 2px 0 var(--accEdge)}
.btn:disabled{opacity:.55;cursor:default;transform:none}
.btn.big{display:block;width:100%;min-height:60px;font-size:24px;margin-top:18px}
.btn.alt{background:var(--tint);color:var(--cink);box-shadow:none}
.btn.add{background:transparent;color:var(--cink);border:2px dashed var(--line);box-shadow:none;font:700 16px Nunito,sans-serif;min-height:44px;width:100%}
.rules{margin:16px 0 0;padding:12px 16px 12px 34px;border-radius:14px;background:var(--tint);font-size:15px;font-weight:700;display:grid;gap:4px}
.join{display:grid;grid-template-columns:auto minmax(0,1fr);gap:16px;align-items:center;margin-top:12px}
.qr{background:#fff;padding:8px;border-radius:12px;line-height:0}.qr img,.qr canvas{width:140px;height:140px}
.jl{margin:0;color:var(--soft);font-weight:700;font-size:14px}
.ju{margin:2px 0 6px;font-weight:800;font-size:15px;line-height:1.3}
.jc{margin:0;font:800 44px/1 var(--font);letter-spacing:.12em}
.jn{margin:6px 0 0;font-weight:700;font-size:15px}
.err{color:var(--bad);font-weight:800}
@media(max-width:480px){.join{grid-template-columns:minmax(0,1fr);justify-items:center;text-align:center}}
.board{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px}
.pc{display:flex;align-items:center;gap:8px;min-height:38px;padding:4px 14px 4px 10px;border-radius:999px;background:rgba(255,255,255,.16);font-weight:800}
.pc.on{background:var(--card);color:var(--cink)}
.st{font:800 18px var(--font);white-space:nowrap}
.streak{padding:1px 8px;border-radius:999px;background:#ff8a3d;color:#2a1200;font:800 12px Nunito,sans-serif}
.head{text-align:center;margin:4px 0 14px}
.who{font:800 clamp(26px,5vw,38px)/1.1 var(--font);margin:2px 0 4px;text-wrap:balance}
.sub{margin:0;font-weight:800;opacity:.95;min-height:1.5em}
.grid{display:grid;grid-template-columns:repeat(var(--cols,4),minmax(0,1fr));gap:clamp(6px,1.1vw,12px);perspective:1100px;margin:0 auto;max-width:max(520px,calc((100vh - 230px) / var(--rows,3) * .75 * var(--cols,4)))}
@media(max-width:620px){.grid{--cols:4!important;max-width:none}}
.mc{container-type:inline-size;position:relative;aspect-ratio:3/4;border:0;padding:0;margin:0;background:none;cursor:pointer;border-radius:14px;color:inherit;font:inherit;-webkit-tap-highlight-color:transparent}
.mc:disabled{cursor:default}
.in{position:absolute;inset:0;transition:transform .45s cubic-bezier(.3,.7,.3,1);transform-style:preserve-3d}
.mc.up .in{transform:rotateY(180deg)}
.bk,.fr{position:absolute;inset:0;border-radius:14px;backface-visibility:hidden;-webkit-backface-visibility:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden}
.bk{background:var(--back);color:var(--acc);border:3px solid color-mix(in srgb,var(--acc) 55%,var(--back));box-shadow:0 6px 0 -1px var(--backEdge),0 10px 18px -8px rgba(0,0,0,.5)}
.bk svg{width:52%;height:auto}
.mc:not(:disabled):hover .bk{border-color:var(--acc)}
.fr{transform:rotateY(180deg);background:var(--card);color:var(--cink);padding:8px 6px 18px;text-align:center;border:3px solid var(--line);box-shadow:0 10px 18px -8px rgba(0,0,0,.5)}
.mc.b .fr{background:var(--factbg)}
.fr img{width:100%;flex:1 1 0;min-height:0;object-fit:cover;border-radius:8px;margin-bottom:4px}
.em{font-size:clamp(22px,30cqi,50px);line-height:1.1}
.em.sm{font-size:clamp(15px,17cqi,30px);margin-bottom:4px}
.nm{font:800 clamp(12px,13.5cqi,22px)/1.08 var(--font);margin-top:4px;text-wrap:balance;overflow-wrap:anywhere}
.sy{font:800 clamp(10px,12.5cqi,19px)/1.18 Nunito,system-ui,sans-serif;text-wrap:balance;overflow-wrap:anywhere}
.img .nm,.img .sy{font-size:clamp(10px,11cqi,17px)}
.bb{position:absolute;bottom:4px;left:4px;right:4px;font:800 clamp(7px,6.5cqi,11px)/1.2 Nunito,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:var(--soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mc.got .fr{border-color:var(--own);box-shadow:inset 0 0 0 3px var(--own)}
.mc.got .fr::after{content:'★';position:absolute;top:3px;right:6px;color:var(--own);font-size:clamp(12px,11cqi,20px);text-shadow:0 0 2px rgba(0,0,0,.45)}
.mc.miss .fr{border-color:var(--bad);animation:mmshake .45s .45s both}
.mc.hit .fr{border-color:var(--good);animation:mmpop .5s .4s both}
@keyframes mmshake{25%{translate:-5px 0}50%{translate:5px 0}75%{translate:-3px 0}}
@keyframes mmpop{50%{scale:1.08}}
.pop{position:fixed;inset:0;z-index:5;display:grid;place-items:center;padding:16px;background:rgba(12,16,6,.6);animation:mmfade .3s .6s both}
@keyframes mmfade{from{opacity:0}}
.pop .card{width:min(640px,100%);max-height:calc(100vh - 32px);overflow:auto;margin:0}
.got{margin:0 0 12px;font:800 24px/1.15 var(--font);color:var(--good)}
.big{display:flex;align-items:center;gap:14px;margin:0 0 12px}
.big .em{font-size:58px;line-height:1;flex:none}
.big img{width:120px;height:120px;object-fit:cover;border-radius:14px;flex:none}
.big h2{font:800 clamp(26px,5vw,34px)/1.05 var(--font);margin:0}
.big p{margin:4px 0 0;font-weight:800;color:var(--soft)}
.fact{margin:0 0 12px;padding:14px 16px;border-radius:14px;background:var(--factbg)}
.fact b{font-family:var(--font);font-size:19px}
.ref{display:block;margin-top:8px;font-weight:800;color:var(--soft);font-size:15px}
.quote{margin:0 0 12px;border-radius:14px;border:2px solid var(--line);padding:12px 16px}
blockquote{margin:0 0 8px;padding:0 0 0 12px;border-left:4px solid var(--acc);font:500 17px/1.5 Georgia,'Times New Roman',serif}
cite{display:block;margin-top:4px;font:800 13px Nunito,sans-serif;color:var(--soft);font-style:normal}
.end{text-align:center}
.end h2{font:800 clamp(32px,6vw,44px)/1.05 var(--font);margin:6px 0 4px}
.rank{list-style:none;padding:0;margin:16px 0 18px;display:grid;gap:8px;text-align:left}
.rank li{display:flex;align-items:center;gap:12px;min-height:52px;padding:8px 16px;border-radius:14px;background:var(--tint);font-weight:800;font-size:18px}
.rank li.top{background:color-mix(in srgb,var(--acc) 35%,var(--card))}
.rank .nm2{flex:1}
details{margin:0 0 16px;text-align:left;border-radius:14px;background:var(--tint)}
summary{cursor:pointer;min-height:46px;display:flex;align-items:center;padding:8px 16px;font:800 19px var(--font)}
details ol{margin:0;padding:0 16px 14px 36px;display:grid;gap:8px}
details li{font-weight:700;line-height:1.35}
.ra{display:block;color:var(--good);font-weight:800}
.rr{display:block;color:var(--soft);font-size:14px;font-weight:700}
.row{display:grid;gap:10px}
.quit{display:block;margin:20px auto 0;min-height:44px;padding:0 12px;background:transparent;border:0;color:var(--ink);font:700 16px Nunito,sans-serif;text-decoration:underline;cursor:pointer;opacity:.9}
.conf{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:9}
.conf i{position:absolute;top:-14px;width:10px;height:14px;border-radius:2px;animation:mmfall 1.3s cubic-bezier(.3,.6,.5,1) forwards}
@keyframes mmfall{to{transform:translate3d(var(--dx),105vh,0) rotate(var(--r))}}
:focus-visible{outline:3px solid var(--acc);outline-offset:2px}
@media(prefers-reduced-motion:reduce){.in{transition:none}.mc.miss .fr,.mc.hit .fr,.pop{animation:none}}
`;

  // Face of one side of a pair, for the TV and (as data) for phones.
  const faceOf = (P, side, pics) => {
    const f = side === 0 ? P.a : P.b;
    return { s: side, pic: side === 0 || pics ? (f.pic || '') : '', text: f.text || '', img: f.img || '', tag: (side === 0 && P.tagA !== undefined ? P.tagA : P.tag) || '' };
  };
  const faceHTML = f => (f.img ? `<img src="${esc(f.img)}" alt="">` : f.pic ? `<span class="em${f.s ? ' sm' : ''}" aria-hidden="true">${f.pic}</span>` : '')
    + `<span class="${f.s ? 'sy' : 'nm'}">${esc(f.text)}</span>${f.tag ? `<span class="bb">${esc(f.tag)}</span>` : ''}`;
  const panelOf = P => ({ title: P.title || P.a.text, sub: P.sub || P.b.text, pic: P.a.pic || P.b.pic || '', img: P.a.img || P.b.img || '', fact: P.fact || '', ref: P.ref || '', quote: P.quote || [] });

  let O = null, root = null, hostEl = null, curKey = '';   // options, shadow root, overlay element
  let G = null, view = 'setup';       // game state
  let setupP = [], size = 8, set = 'all', pics = true;
  let built = '', popFor = '', missT = null, sfxKey = '';
  const PH = { room: null, P: {}, on: false, busy: false, err: '', seen: {}, removed: new Set(), key: '' };

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem('closet-mm-' + O.key) || '{}');
      if ([6, 8, 10, 12].includes(s.size)) size = s.size;
      if (O.sets && O.sets[s.set]) set = s.set;
      if (typeof s.pics === 'boolean') pics = s.pics;
    } catch (e) {}
    let names = null;
    try { names = JSON.parse(localStorage.getItem('closet-players') || 'null'); } catch (e) {}
    if (O.players && O.players.length) names = O.players;
    setupP = (Array.isArray(names) && names.length ? names : ['Player 1', 'Player 2']).slice(0, MAXP).map(n => ({ name: String(n && n.name || n || '').slice(0, 16), uid: n && n.uid || '' }));
  }
  function save() {
    try {
      localStorage.setItem('closet-mm-' + O.key, JSON.stringify({ size, set, pics }));
      localStorage.setItem('closet-players', JSON.stringify(setupP.filter(p => !p.uid).map(p => p.name)));
    } catch (e) {}
    pub();
  }
  const pool = () => O.pairs.map((_, i) => i).filter(i => set === 'all' || !O.sets || O.pairs[i].set === set);
  const poolKeys = () => new Set(pool().map(i => O.pairs[i].key || ('#' + i))).size;
  const sizes = () => [6, 8, 10, 12].filter(n => n <= Math.max(6, poolKeys()));

  /* ---------- screens ---------- */
  function shell() {
    root.innerHTML = `<style>${CSS}</style><div class="mw">
      <div class="mtop"><h1 class="mt">Memory Match<small>${esc(O.game)}</small></h1><div style="display:flex;gap:8px"><button class="pill" data-k="snd"></button><button class="pill" data-k="close">${esc(O.backLabel || 'Back to the game')}</button></div></div>
      <section data-v="setup"></section><section data-v="game" hidden></section><section data-v="end" hidden></section></div>`;
    sndUI();
  }
  const sec = v => $(root, `section[data-v="${v}"]`);
  function show(v) { for (const s of root.querySelectorAll('section[data-v]')) s.hidden = s.dataset.v !== v; }
  function sndUI() { const b = $(root, '[data-k="snd"]'); if (b) { b.textContent = soundOn ? 'Sound on' : 'Sound off'; b.style.opacity = soundOn ? 1 : .65; } }

  function renderSetup() {
    show('setup');
    const sz = sizes(); if (!sz.includes(size)) size = sz[sz.length - 1];
    const phones = O.phones !== false && window.ClosetRoom;
    sec('setup').innerHTML = `
      ${phones ? `<div class="card"><h3>Play on phones</h3><p style="margin:0">Everyone can flip cards from their own phone. No account or app needed.</p>
        ${PH.on ? `<div class="join"><div class="qr" data-k="qr"></div><div><p class="jl">Scan the code, or go to</p><p class="ju">${ClosetRoom.urlHTML(ClosetRoom.shortURL(O.playPage || 'memory-play.html'))}</p><p class="jl">and enter</p><p class="jc">${PH.room.code}</p><p class="jn">${phoneNames() || 'No phones yet. When someone joins, they show up in the player list.'}</p></div></div>`
        : `<button class="btn" data-k="host" style="margin-top:12px"${PH.busy ? ' disabled' : ''}>${PH.busy ? 'Opening a room…' : 'Let phones join'}</button>${PH.err ? `<p class="err">${esc(PH.err)}</p>` : ''}`}</div>` : ''}
      <div class="card">
        <h3>Who's playing?</h3>
        <div data-k="plist">${setupP.map((p, i) => `<div class="pr"><i class="d" style="background:${PCOL[i]}"></i><input data-i="${i}" value="${esc(p.name)}" maxlength="16" aria-label="Player ${i + 1} name" autocomplete="off">${p.uid ? '<span class="ph">phone</span>' : ''}<button class="x" data-rm="${i}" aria-label="Remove player ${i + 1}"${setupP.length < 2 ? ' disabled' : ''}>×</button></div>`).join('')}</div>
        ${setupP.length < MAXP ? '<button class="btn add" data-k="add">Add a player</button>' : ''}
        <h3>How many pairs?</h3>
        <div class="seg" data-k="size">${sz.map(n => `<button data-v="${n}" aria-pressed="${n === size}">${n}</button>`).join('')}</div>
        ${O.sets ? `<h3>Cards from</h3><div class="seg" data-k="set">${Object.entries(O.sets).map(([k, v]) => `<button data-v="${k}" aria-pressed="${k === set}">${esc(v)}</button>`).join('')}</div>` : ''}
        ${O.picsOption ? `<h3>Card style</h3><div class="seg" data-k="pics"><button data-v="1" aria-pressed="${pics}">Matching pictures</button><button data-v="0" aria-pressed="${!pics}">${esc(O.hardLabel || 'No picture clue')}</button></div>
          <p class="hint">${pics ? 'Both cards in a pair share a picture. Great for younger players.' : 'Only one card in each pair has a picture. You have to know what goes together!'}</p>` : ''}
        <ol class="rules">${(O.rules || ['Flip two cards. Find the two that go together.']).map(r => `<li>${r}</li>`).join('')}<li>Find a match? Keep the pair, earn a <b>star</b> and <b>go again</b>.</li><li>No match? The cards flip back. <b>Remember where they were!</b></li></ol>
        <button class="btn big" data-k="start">Let's play!</button>
        ${G && G.phase !== 'over' ? '<button class="btn alt big" data-k="resume" style="margin-top:10px">Back to the game in progress</button>' : ''}
      </div>`;
    if (PH.on) ClosetRoom.qr($(root, '[data-k="qr"]'), ClosetRoom.pageURL(O.playPage || 'memory-play.html', PH.room.code));
  }
  const phoneNames = () => { const n = Object.values(PH.P).filter(p => p && p.name && p.online !== false && !p.kicked).map(p => esc(p.name)); return n.length ? 'On phones: ' + n.join(', ') : ''; };

  const cp = () => G.players[G.turn % G.players.length];
  function renderGame(instant) {
    show('game');
    const S = sec('game'), n = G.cards.length;
    if (built !== G.id) {
      built = G.id; popFor = '';
      const cols = n <= 12 ? 6 : n <= 16 ? 8 : n <= 20 ? 7 : 8;
      S.innerHTML = `<div class="board" data-k="board"></div><div class="head"><h2 class="who" data-k="who"></h2><p class="sub" data-k="sub"></p></div>
        <div class="grid" data-k="grid" style="--cols:${cols};--rows:${Math.ceil(n / cols)}">${G.cards.map((c, i) => { const f = faceOf(O.pairs[c.p], c.s, G.pics); return `<button class="mc ${c.s ? 'b' : 'a'}${f.img ? ' img' : ''}" data-i="${i}"><span class="in"><span class="bk">${O.back || BACK}</span><span class="fr">${faceHTML(f)}</span></span></button>`; }).join('')}</div>
        <div class="pop" data-k="pop" hidden><div class="card" role="dialog" aria-modal="true"><p class="got" data-k="got"></p><div class="big" data-k="big"></div><div data-k="body"></div><button class="btn big" data-k="next">Keep going</button></div></div>
        <button class="quit" data-k="quit">End game</button>`;
    }
    const up = G.up || [], ph = G.phase, p = cp(), hit = ph === 'match' ? (G.hit || []) : [];
    $(S, '[data-k="board"]').innerHTML = G.players.map((q, i) => `<div class="pc${i === G.turn % G.players.length ? ' on' : ''}"><i class="d" style="background:${q.col}"></i>${esc(q.name)}<span class="st">★ ${q.score}</span>${(q.streak || 0) >= 2 ? `<span class="streak">${q.streak} in a row</span>` : ''}</div>`).join('');
    S.querySelectorAll('.mc').forEach((el, i) => {
      const c = G.cards[i], isUp = c.m >= 0 || up.includes(i);
      el.classList.toggle('up', isUp); el.classList.toggle('got', c.m >= 0); el.classList.toggle('miss', ph === 'miss' && up.includes(i)); el.classList.toggle('hit', hit.includes(i));
      if (c.m >= 0) el.style.setProperty('--own', (G.players[c.m] || {}).col || '#f2c14e');
      el.disabled = ph !== 'flip' || isUp || up.length >= 2;
      const f = faceOf(O.pairs[c.p], c.s, G.pics);
      el.setAttribute('aria-label', isUp ? f.text : `Card ${i + 1}, face down`);
    });
    const solo = G.players.length < 2, nx = G.players[(G.turn + 1) % G.players.length];
    const who = $(S, '[data-k="who"]'), sub = $(S, '[data-k="sub"]');
    if (ph === 'miss') {
      who.textContent = 'Not a match!'; sub.textContent = solo ? 'Remember where they were!' : `Remember where they were! Next up: ${nx.name}`;
      once('m' + G.id + G.tries, SFX.miss);
      clearTimeout(missT); missT = setTimeout(resolveMiss, Math.max(300, Math.min(2200, (G.missAt || 0) + (reduce ? 1300 : 2000) - Date.now())));
    } else if (ph === 'match') { who.textContent = `Match! ${p.name} goes again`; sub.textContent = `${G.found} of ${G.size} pairs found`; }
    else {
      who.textContent = solo ? 'Find the pairs!' : `${p.name}'s turn`;
      sub.textContent = up.length === 1 ? 'Now find its match!' : `Flip two cards. ${G.found} of ${G.size} pairs found` + (PH.on && p.uid ? ` · ${p.name} can tap on their phone` : '');
      if (up.length === 1) once('f' + G.id + G.tries, SFX.flip);
    }
    const pop = $(S, '[data-k="pop"]');
    if (ph === 'match' && G.last >= 0) {
      pop.hidden = false;
      const k = G.id + ':' + G.found;
      if (popFor !== k) {
        popFor = k; once('g' + k, SFX.good); confetti();
        const P = panelOf(O.pairs[G.last]);
        $(S, '[data-k="got"]').textContent = `Match! +1 star for ${p.name}` + ((p.streak || 0) >= 2 ? `. ${p.streak} in a row!` : '');
        $(S, '[data-k="big"]').innerHTML = `${P.img ? `<img src="${esc(P.img)}" alt="">` : P.pic ? `<span class="em" aria-hidden="true">${P.pic}</span>` : ''}<div><h2>${esc(P.title)}</h2><p>${esc(P.sub)}</p></div>`;
        $(S, '[data-k="body"]').innerHTML = (P.fact ? `<p class="fact"><b>${esc(O.factLabel || 'Did you know?')}</b> ${esc(P.fact)}${P.ref ? `<span class="ref">${esc(P.ref)}</span>` : ''}</p>` : '')
          + (P.quote.length ? `<div class="quote">${P.quote.map(q => `<blockquote>${esc(q[1])}<cite>${esc(q[0])}</cite></blockquote>`).join('')}</div>` : '');
      }
      const last = G.found >= G.size; $(S, '[data-k="next"]').textContent = last ? 'See who won!' : `Keep going, ${p.name}!`;
    } else pop.hidden = true;
  }
  function renderEnd() {
    show('end');
    const r = G.players.slice().sort((a, b) => b.score - a.score), top = r[0].score, win = r.filter(p => p.score === top);
    once('e' + G.id, SFX.win);
    const lg = (G.log || []).filter(e => O.pairs[e.p]);
    sec('end').innerHTML = `<div class="card end"><div style="font-size:64px;line-height:1">🏆</div>
      <h2>${G.players.length === 1 ? `You found all ${G.size} pairs!` : win.length === 1 ? `${esc(win[0].name)} wins!` : `It's a tie: ${win.map(p => esc(p.name)).join(' & ')}!`}</h2>
      <p style="margin:0;color:var(--soft);font-weight:700">${G.found} pair${G.found === 1 ? '' : 's'} found in ${G.tries} tr${G.tries === 1 ? 'y' : 'ies'}</p>
      <ol class="rank">${r.map(p => `<li class="${p.score === top ? 'top' : ''}"><i class="d" style="background:${p.col}"></i><span class="nm2">${esc(p.name)}</span><span class="st">★ ${p.score}</span></li>`).join('')}</ol>
      ${lg.length ? `<details open><summary>What we learned (${lg.length})</summary><ol>${lg.map(e => { const P = panelOf(O.pairs[e.p]), w = G.players[e.w]; return `<li>${P.pic ? P.pic + ' ' : ''}${esc(P.title)}<span class="ra">✓ ${esc(P.sub)}</span>${P.ref || w ? `<span class="rr">${esc(P.ref)}${P.ref && w ? ' · ' : ''}${w ? esc(w.name) + ' found it' : ''}</span>` : ''}</li>`; }).join('')}</ol></details>` : ''}
      <div class="row"><button class="btn big" data-k="again" style="margin-top:0">Play again</button><button class="btn alt" data-k="setup">Change players or cards</button></div></div>`;
  }
  function render(instant) {
    if (!root) return;
    if (view === 'setup' || !G) renderSetup(); else if (G.phase === 'over') renderEnd(); else renderGame(instant);
    pub();
  }
  function once(k, f) { if (sfxKey !== k) { sfxKey = k; f(); } }
  function confetti() {
    if (reduce) return; const box = document.createElement('div'); box.className = 'conf';
    const cols = ['#ffd23f', '#ff7aa8', '#5fe0b5', '#ffa94d', '#b9a3ff', '#7fd1ff', '#ffffff'];
    for (let i = 0; i < 34; i++) { const e = document.createElement('i'); e.style.left = (Math.random() * 100) + '%'; e.style.background = cols[i % cols.length]; e.style.setProperty('--dx', ((Math.random() - .5) * 160).toFixed(0) + 'px'); e.style.setProperty('--r', ((Math.random() - .5) * 900).toFixed(0) + 'deg'); e.style.animationDelay = (Math.random() * .25).toFixed(2) + 's'; box.appendChild(e); }
    root.appendChild(box); setTimeout(() => box.remove(), 1800);
  }

  /* ---------- game actions ---------- */
  function commit(st) { G = st; render(false); }
  function newGame(players) {
    const all = pool(), n = Math.min(size, poolKeys());
    let used = []; try { used = JSON.parse(localStorage.getItem('closet-mm-used-' + O.key) || '[]').filter(i => all.includes(i)); } catch (e) {}
    if (all.length - used.length < n) used = [];
    // One pair per person/topic: pairs that share a key are never on the same board.
    const keyOf = i => O.pairs[i].key || ('#' + i), seenK = new Set();
    let chosen = shuffle(all.filter(i => !used.includes(i))).filter(i => { const k = keyOf(i); if (seenK.has(k)) return false; seenK.add(k); return true; }).slice(0, n);
    if (chosen.length < n) for (const i of shuffle(all.slice())) { if (chosen.length >= n) break; const k = keyOf(i); if (!chosen.includes(i) && !seenK.has(k)) { seenK.add(k); chosen.push(i); } }
    try { localStorage.setItem('closet-mm-used-' + O.key, JSON.stringify(used.concat(chosen))); } catch (e) {}
    const cards = shuffle(chosen.flatMap(i => [{ p: i, s: 0, m: -1 }, { p: i, s: 1, m: -1 }]));
    view = 'game';
    commit({ id: rid(), players: players.map((p, i) => ({ name: (p.name || '').trim() || `Player ${i + 1}`, col: PCOL[i % PCOL.length], score: 0, streak: 0, uid: p.uid || '' })),
      turn: 0, phase: 'flip', cards, up: [], hit: [], last: -1, pics: !!(pics || !O.picsOption), size: n, found: 0, tries: 0, missAt: 0, log: [] });
  }
  function flip(i) {
    if (!G || G.phase !== 'flip') return;
    const c = G.cards[i], up = G.up || []; if (!c || c.m >= 0 || up.includes(i) || up.length >= 2) return;
    const st = clone(G); st.up = up.concat(i);
    if (st.up.length === 2) {
      st.tries++; const w = st.turn % st.players.length, pl = st.players[w], [a, b] = st.up.map(k => st.cards[k]);
      if (a.p === b.p) { a.m = b.m = w; pl.score++; pl.streak = (pl.streak || 0) + 1; st.found++; st.last = a.p; st.hit = st.up.slice(); st.up = []; st.phase = 'match'; st.log = (st.log || []).concat({ p: a.p, w }).slice(-100); }
      else { pl.streak = 0; st.phase = 'miss'; st.missAt = Date.now(); }
    }
    commit(st);
  }
  function resolveMiss() { if (!G || G.phase !== 'miss') return; const st = clone(G); st.up = []; st.turn++; st.phase = 'flip'; commit(st); }
  function next() { if (!G || G.phase !== 'match') return; const st = clone(G); st.up = []; st.hit = []; st.last = -1; st.phase = st.found >= st.size ? 'over' : 'flip'; commit(st); }

  /* ---------- phones ---------- */
  async function startRoom() {
    if (PH.on || PH.busy) return; PH.busy = true; PH.err = ''; render();
    try { PH.room = await ClosetRoom.host('memory', 'closet-mm-room'); }
    catch (e) { PH.busy = false; PH.err = "Couldn't open a room. Check the internet, then try again."; render(); return; }
    PH.on = true; PH.busy = false;
    PH.room.players(v => { PH.P = v; mergePhones(); render(); });
    render();
  }
  function mergePhones() {
    if (G && view === 'game' && G.phase !== 'over') return;
    for (const [uid, p] of Object.entries(PH.P)) {
      if (!p || !p.name || PH.removed.has(uid) || p.kicked) continue;
      const nm = String(p.name).trim().slice(0, 16);
      let s = setupP.find(x => x.uid === uid);
      if (!s) { s = setupP.find(x => !x.uid && x.name.trim().toLowerCase() === nm.toLowerCase()) || setupP.find(x => !x.uid && /^player \d+$/i.test(x.name.trim())); if (s) s.uid = uid; }
      if (s) { if (PH.seen[uid] !== nm) s.name = nm; }
      else if (setupP.length < MAXP) setupP.push({ name: nm, uid });
      PH.seen[uid] = nm;
    }
  }
  function pub() {
    if (!PH.on || !PH.room) return;
    const s = { game: O.game, theme: O.theme || {}, view: G && view !== 'setup' ? 'game' : 'setup', setup: setupP.map(p => ({ name: p.name, uid: p.uid || '' })) };
    if (G) {
      const up = G.up || [];
      s.g = { id: G.id, phase: G.phase, turn: G.turn, size: G.size, found: G.found, tries: G.tries,
        players: G.players.map(p => ({ name: p.name, col: p.col, score: p.score, streak: p.streak || 0, uid: p.uid || '' })),
        cards: G.cards.map((c, i) => c.m >= 0 || up.includes(i) ? { f: faceOf(O.pairs[c.p], c.s, G.pics), m: c.m } : { f: null, m: -1 }),
        up, hit: G.hit || [], panel: G.phase === 'match' && G.last >= 0 ? panelOf(O.pairs[G.last]) : null };
    }
    PH.room.publish(s);
    const key = G && view === 'game' && G.phase !== 'over' ? `${G.id}-${G.turn}` : '';
    PH.room.inputs(key, (uid, a, x) => {
      if (!G || `${G.id}-${G.turn}` !== key) return;
      const me = G.players.findIndex(p => p.uid === uid); if (me < 0 || me !== G.turn % G.players.length) return;
      if (a === 'flip') flip(+x); else if (a === 'next') next();
    });
  }

  /* ---------- events ---------- */
  function onClick(e) {
    const t = e.target.closest('[data-k],[data-rm],.mc,[data-v]'); if (!t) return;
    const k = t.dataset.k;
    if (t.classList.contains('mc')) { if (!t.disabled) flip(+t.dataset.i); return; }
    if (t.dataset.rm !== undefined) { if (setupP.length < 2) return; const gone = setupP.splice(+t.dataset.rm, 1)[0]; if (gone && gone.uid) PH.removed.add(gone.uid); save(); render(); return; }
    const segK = t.parentElement && t.parentElement.dataset.k;
    if (t.dataset.v !== undefined && segK) {
      if (segK === 'size') size = +t.dataset.v; else if (segK === 'set') set = t.dataset.v; else if (segK === 'pics') pics = t.dataset.v === '1';
      save(); render(); return;
    }
    if (k === 'close') return close();
    if (k === 'snd') { soundOn = !soundOn; try { localStorage.setItem('closet-sound', soundOn ? 'on' : 'off'); } catch (x) {} sndUI(); if (soundOn) SFX.flip(); return; }
    if (k === 'host') return startRoom();
    if (k === 'add') { if (setupP.length < MAXP) { setupP.push({ name: `Player ${setupP.length + 1}` }); save(); render(); const ins = root.querySelectorAll('[data-k="plist"] input'); const inp = ins[ins.length - 1]; if (inp) { inp.focus(); inp.select(); } } return; }
    if (k === 'start') return newGame(setupP);
    if (k === 'resume') { view = 'game'; render(); return; }
    if (k === 'next') return next();
    if (k === 'again') return newGame(G.players);
    if (k === 'setup') { setupP = G.players.map(p => ({ name: p.name, uid: p.uid })); view = 'setup'; render(); return; }
    if (k === 'quit') {
      if (t.dataset.arm) { const st = clone(G); st.phase = 'over'; commit(st); }
      else { t.dataset.arm = '1'; t.textContent = 'Tap again to end the game'; setTimeout(() => { if (t.isConnected) { delete t.dataset.arm; t.textContent = 'End game'; } }, 3000); }
    }
  }
  function onInput(e) { const i = e.target.dataset && e.target.dataset.i; if (i === undefined) return; setupP[+i].name = e.target.value; save(); }
  function onKey(e) { if (e.key === 'Escape' && hostEl && !hostEl.hidden && view === 'setup') close(); }

  function open(opts) {
    O = Object.assign({ key: 'game', game: 'Memory Match', pairs: [] }, opts);
    if (!root) {
      hostEl = document.createElement('div'); hostEl.id = 'mmx'; hostEl.setAttribute('role', 'dialog'); hostEl.setAttribute('aria-label', 'Memory Match');
      document.body.appendChild(hostEl);
      root = hostEl.attachShadow({ mode: 'open' });
      root.addEventListener('click', onClick); root.addEventListener('input', onInput); document.addEventListener('keydown', onKey);
    }
    const th = O.theme || {};
    for (const [k, v] of Object.entries(th)) hostEl.style.setProperty('--' + k, v);
    hostEl.hidden = false; document.documentElement.style.overflow = 'hidden';
    if (curKey !== O.key) { curKey = O.key; G = null; view = 'setup'; load(); }
    built = ''; shell(); render();
    try { hostEl.scrollTop = 0; } catch (e) {}
  }
  function close() { if (!hostEl) return; hostEl.hidden = true; document.documentElement.style.overflow = ''; if (O && O.onClose) try { O.onClose(); } catch (e) {} }

  window.MemoryMatch = { open, close, _state: () => G };
})();
