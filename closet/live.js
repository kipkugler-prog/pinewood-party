// Two Sticks Trivia live connection.
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
    const K = 'tsdev-db', subs = [];
    let uid = sessionStorage.getItem('tsdev-uid');
    if (!uid) { uid = 'u' + Math.random().toString(36).slice(2, 10); sessionStorage.setItem('tsdev-uid', uid); }
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

  window.TSNet = { connect: () => (new URLSearchParams(location.search).has('dev') ? devNet() : firebaseNet()) };
})();
