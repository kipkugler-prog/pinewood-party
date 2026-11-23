// Game Closet phone rooms.
// Uses the same free Firebase project as Pinewood Party (Realtime Database, anonymous sign-in),
// so nobody needs an account. The web config below is meant to be public; the database rules control access.
// Add "?dev=1" to the address to test on one computer with no internet (tabs share a pretend database).
(function () {
  const FIREBASE = {
    apiKey: 'AIzaSyB7sK4BUv7XCajidERw-AnAyPAHfTQMpEo',
    authDomain: 'pinewood-party.firebaseapp.com',
    databaseURL: 'https://pinewood-party-default-rtdb.firebaseio.com',
    projectId: 'pinewood-party',
    storageBucket: 'pinewood-party.firebasestorage.app',
    messagingSenderId: '604648438377',
    appId: '1:604648438377:web:9f27422274f6e3965240f8'
  };
  const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const DEV = new URLSearchParams(location.search).has('dev');

  async function firebaseNet() {
    const [{ initializeApp, getApps }, A, D] = await Promise.all([
      import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-database.js')
    ]);
    const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE);
    const cred = await A.signInAnonymously(A.getAuth(app));
    const db = D.getDatabase(app);
    let offset = 0;
    D.onValue(D.ref(db, '.info/serverTimeOffset'), s => { offset = s.val() || 0; });
    const r = p => D.ref(db, p);
    return {
      uid: cred.user.uid, kind: 'firebase',
      now: () => Date.now() + offset,
      set: (p, v) => D.set(r(p), v),
      update: (p, v) => D.update(r(p), v),
      remove: p => D.remove(r(p)),
      get: async p => (await D.get(r(p))).val(),
      on: (p, cb) => D.onValue(r(p), s => cb(s.val())),
      onDisconnectUpdate: (p, v) => D.onDisconnect(r(p)).update(v),
      onConnected: cb => D.onValue(r('.info/connected'), s => cb(!!s.val()))
    };
  }

  function devNet() {
    const K = 'closet-dev-db', subs = [];
    let uid = sessionStorage.getItem('closet-dev-uid');
    if (!uid) { uid = 'u' + Math.random().toString(36).slice(2, 10); sessionStorage.setItem('closet-dev-uid', uid); }
    const read = () => { try { return JSON.parse(localStorage.getItem(K) || '{}'); } catch (e) { return {}; } };
    const keys = p => String(p).split('/').filter(Boolean);
    const getAt = (t, p) => { let o = t; for (const k of keys(p)) { if (!o || typeof o !== 'object') return null; o = o[k]; } return o === undefined ? null : o; };
    const setAt = (t, p, v) => {
      const ks = keys(p); if (!ks.length) return v == null ? {} : JSON.parse(JSON.stringify(v));
      let o = t; for (let i = 0; i < ks.length - 1; i++) { if (!o[ks[i]] || typeof o[ks[i]] !== 'object') o[ks[i]] = {}; o = o[ks[i]]; }
      const last = ks[ks.length - 1]; if (v == null) delete o[last]; else o[last] = JSON.parse(JSON.stringify(v)); return t;
    };
    const fire = () => { const t = read(); for (const s of subs.slice()) { const v = getAt(t, s.p), j = JSON.stringify(v); if (j !== s.last) { s.last = j; s.cb(v == null ? null : JSON.parse(j)); } } };
    const write = t => { localStorage.setItem(K, JSON.stringify(t)); setTimeout(fire, 0); };
    addEventListener('storage', e => { if (e.key === K) fire(); });
    return Promise.resolve({
      uid, kind: 'dev', now: () => Date.now(),
      set: async (p, v) => write(setAt(read(), p, v)),
      update: async (p, v) => { let t = read(); for (const [k, x] of Object.entries(v || {})) t = setAt(t, p + '/' + k, x); write(t); },
      remove: async p => write(setAt(read(), p, null)),
      get: async p => getAt(read(), p),
      on: (p, cb) => { const s = { p, cb, last: undefined }; subs.push(s); setTimeout(() => { const v = getAt(read(), p); s.last = JSON.stringify(v); cb(v); }, 0); return () => { const i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1); }; },
      onDisconnectUpdate: async () => {},
      onConnected: cb => cb(true)
    });
  }

  let netP = null;
  const net = () => netP || (netP = (DEV ? devNet() : firebaseNet()).catch(e => { netP = null; throw e; }));
  const LETTERS = 'BCDFGHJKLMNPQRSTVWXZ';
  const clean = v => JSON.parse(JSON.stringify(v === undefined ? null : v));
  const here = () => location.href.replace(/[?#].*$/, '');
  const pageURL = (page, code) => {
    const u = new URL(page, here());
    if (DEV) u.searchParams.set('dev', '1');
    if (code) u.searchParams.set('c', code);
    return u.href;
  };
  const shortURL = page => new URL(page, here()).href.replace(/^https?:\/\//, '');

  // Host: the screen that runs the game. Reuses its last room code on this device when it can.
  async function host(app, saveKey) {
    const n = await net();
    let code = '', saved = '';
    try { saved = localStorage.getItem(saveKey) || ''; } catch (e) {}
    if (saved) { const meta = await n.get(`rooms/${saved}/meta`); if (meta && meta.host === n.uid) code = saved; }
    if (!code) {
      for (let t = 0; t < 20 && !code; t++) {
        const c = Array.from({ length: 4 }, () => LETTERS[Math.random() * LETTERS.length | 0]).join('');
        if (!(await n.get(`rooms/${c}/meta`))) code = c;
      }
      if (!code) throw new Error('no free code');
      await n.set(`rooms/${code}`, { meta: { host: n.uid, created: n.now(), v: 1 } });
      try { localStorage.setItem(saveKey, code); } catch (e) {}
    }
    const room = p => `rooms/${code}${p ? '/' + p : ''}`;
    const lastN = {};
    let inKey = '', inUn = null, pubT = null, pending = null;
    return {
      code, uid: n.uid, net: n,
      publish(state) {
        pending = state; if (pubT) return;
        pubT = setTimeout(() => { pubT = null; const s = pending; pending = null; n.set(room('state'), clean(Object.assign({}, s, { app, at: n.now() }))).catch(() => {}); }, 40);
      },
      players(cb) { return n.on(room('players'), v => cb(v && typeof v === 'object' ? v : {})); },
      // Listen to phone actions for one key (a game turn). Each action is delivered once.
      inputs(key, cb) {
        if (key === inKey) return;
        if (inUn) { try { inUn(); } catch (e) {} inUn = null; }
        if (inKey) n.remove(room('inputs/' + inKey)).catch(() => {});
        inKey = key; if (!key) return;
        inUn = n.on(room('inputs/' + key), v => {
          if (inKey !== key) return;
          for (const [uid, x] of Object.entries(v && typeof v === 'object' ? v : {})) {
            if (!x || typeof x !== 'object') continue;
            const id = key + '/' + uid, num = +x.n || 0; if (num <= (lastN[id] || 0)) continue; lastN[id] = num;
            cb(uid, x.a, x.x);
          }
        });
      },
      kick(uid) { return n.update(room('players/' + uid), { online: false, kicked: true }); }
    };
  }

  // Phone: join a room by code.
  async function join(code, app, profile) {
    code = String(code || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    if (code.length !== 4) throw Object.assign(new Error('Type the 4-letter code from the TV.'), { user: true });
    const n = await net();
    const meta = await n.get(`rooms/${code}/meta`);
    if (!meta) throw Object.assign(new Error("We couldn't find that code. Check the TV and try again."), { user: true });
    const st = await n.get(`rooms/${code}/state`);
    if (!st || (app && st.app !== app)) throw Object.assign(new Error('That code is for a different game.'), { user: true });
    const room = p => `rooms/${code}${p ? '/' + p : ''}`;
    const me = n.uid;
    const ps = (await n.get(room('players'))) || {};
    await n.update(room('players/' + me), Object.assign({ color: '#f2c14e', level: 'I' }, profile, { joined: (ps[me] && ps[me].joined) || n.now(), online: true, kicked: null }));
    n.onDisconnectUpdate(room('players/' + me), { online: false });
    n.onConnected(ok => { if (ok) n.update(room('players/' + me), { online: true }); });
    return {
      code, me, net: n,
      state(cb) { return n.on(room('state'), cb); },
      send(key, a, x) { return n.set(room(`inputs/${key}/${me}`), { a, x: x === undefined ? null : x, n: Date.now(), t: n.now() }); },
      update(p) { return n.update(room('players/' + me), p); },
      leave() { return n.update(room('players/' + me), { online: false }); }
    };
  }

  function qr(el, text) {
    el.innerHTML = '';
    try { new QRCode(el, { text, width: 300, height: 300, colorDark: '#111111', colorLight: '#ffffff' }); el.hidden = false; }
    catch (e) { el.hidden = true; }
  }
  // Show a web address so it only breaks at the slashes.
  const urlHTML = u => u.split('/').map(x => `<span style="white-space:nowrap">${String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))}</span>`).join('/<wbr>');

  window.ClosetRoom = { net, host, join, qr, pageURL, shortURL, urlHTML, DEV };
})();
