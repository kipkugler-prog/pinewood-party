// Realtime transport. Production uses Firebase Realtime Database with anonymous sign-in.
// "?dev=1" uses a tiny local WebSocket server (devserver.js) so the whole game can be tested offline.
import { FIREBASE } from './config.js';

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';

export async function connect() {
  const dev = new URLSearchParams(location.search).has('dev');
  return dev ? devNet() : firebaseNet();
}

async function firebaseNet() {
  const [{ initializeApp }, A, D] = await Promise.all([
    import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-database.js')
  ]);
  const app = initializeApp(FIREBASE);
  const auth = A.getAuth(app);
  const cred = await A.signInAnonymously(auth);
  const db = D.getDatabase(app);
  let offset = 0;
  D.onValue(D.ref(db, '.info/serverTimeOffset'), s => { offset = s.val() || 0; });
  const r = p => D.ref(db, p);
  return {
    uid: cred.user.uid,
    kind: 'firebase',
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
  return new Promise(resolve => {
    let uid = sessionStorage.getItem('dev-uid');
    if (!uid) { uid = 'u' + Math.random().toString(36).slice(2, 10); sessionStorage.setItem('dev-uid', uid); }
    const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    const subs = new Map(); let n = 0; const waits = new Map();
    const send = m => ws.send(JSON.stringify(m));
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.op === 'val') { const cb = subs.get(m.id); if (cb) cb(m.value ?? null); }
      if (m.op === 'got') { const w = waits.get(m.id); if (w) { waits.delete(m.id); w(m.value ?? null); } }
    };
    ws.onopen = () => {
      send({ op: 'hello', uid });
      resolve({
        uid, kind: 'dev',
        now: () => Date.now(),
        set: async (p, v) => send({ op: 'set', path: p, value: v ?? null }),
        update: async (p, v) => send({ op: 'update', path: p, value: v }),
        remove: async p => send({ op: 'set', path: p, value: null }),
        get: p => new Promise(res => { const id = ++n; waits.set(id, res); send({ op: 'get', id, path: p }); }),
        on: (p, cb) => { const id = ++n; subs.set(id, cb); send({ op: 'sub', id, path: p }); return () => { subs.delete(id); send({ op: 'unsub', id }); }; },
        onDisconnectUpdate: async (p, v) => send({ op: 'ondisc', path: p, value: v }),
        onConnected: cb => cb(true)
      });
    };
  });
}
