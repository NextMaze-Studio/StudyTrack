/* ============================================================
   StudyFlow — data layer
   Two interchangeable backends behind one API:
     • FirebaseStore  -> Auth + Firestore (cloud, global leaderboard)
     • LocalStore     -> localStorage (works with zero setup)
   The app talks only to the returned store object.
   ============================================================ */
import { firebaseConfig, USERNAME_EMAIL_DOMAIN } from "./firebase-config.js";
import { computeStats, uid as makeId, dateKey } from "./utils.js";

export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

const PLACEHOLDERS = ["YOUR_API_KEY", "", undefined, null];
function looksConfigured(cfg) {
  return cfg && !PLACEHOLDERS.includes(cfg.apiKey) &&
    !PLACEHOLDERS.includes(cfg.projectId) && cfg.projectId !== "YOUR_PROJECT_ID";
}

/* ---------------------------------------------------------------- */
/* Tiny event emitter shared by both stores                          */
/* ---------------------------------------------------------------- */
class Emitter {
  constructor() { this._l = {}; }
  on(type, cb) {
    (this._l[type] = this._l[type] || []).push(cb);
    return () => { this._l[type] = this._l[type].filter(f => f !== cb); };
  }
  emit(type, data) { (this._l[type] || []).forEach(f => { try { f(data); } catch (e) { console.error(e); } }); }
}

/* ================================================================
   LOCAL BACKEND (no setup required)
   ================================================================ */
const LS_USERS = "studyflow:users";
const LS_SESSION = "studyflow:session";
const lsDataKey = (uid) => `studyflow:data:${uid}`;

function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function lsSet(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

async function hashPassword(pw) {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("studyflow::" + pw));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  } catch {
    let h = 0; const s = "studyflow::" + pw;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return "f" + h.toString(16);
  }
}

export class LocalStore extends Emitter {
  constructor() { super(); this.mode = "local"; this.user = null; this.sessions = []; this.topics = []; this.profile = null; }

  async init() {
    const lower = localStorage.getItem(LS_SESSION);
    const users = lsGet(LS_USERS, {});
    if (lower && users[lower]) { this._load(users[lower]); }
    return this.user;
  }

  _users() { return lsGet(LS_USERS, {}); }
  _data(uid) { return lsGet(lsDataKey(uid), { profile: null, sessions: [], topics: [] }); }
  _saveData() {
    if (!this.user) return;
    lsSet(lsDataKey(this.user.uid), { profile: this.profile, sessions: this.sessions, topics: this.topics });
  }
  _load(rec) {
    this.user = { uid: rec.uid, username: rec.username };
    const d = this._data(rec.uid);
    this.sessions = d.sessions || [];
    this.topics = d.topics || [];
    this.profile = d.profile || { username: rec.username, createdAt: Date.now() };
    this.emit("auth", this.user);
    this.emit("sessions", this.sessions);
    this.emit("topics", this.topics);
    this.emit("profile", this.profile);
  }

  async signup(username, password) {
    username = username.trim();
    if (!USERNAME_RE.test(username)) throw new Error("Username must be 3–20 characters: letters, numbers or underscore only.");
    if (password.length < 6) throw new Error("Password must be at least 6 characters.");
    const users = this._users();
    const lower = username.toLowerCase();
    if (users[lower]) throw new Error("That username is already taken. Try another.");
    const uid = makeId();
    users[lower] = { uid, username, pwHash: await hashPassword(password) };
    lsSet(LS_USERS, users);
    localStorage.setItem(LS_SESSION, lower);
    this._load(users[lower]);
    return this.user;
  }

  async login(username, password) {
    username = username.trim();
    const users = this._users();
    const rec = users[username.toLowerCase()];
    if (!rec) throw new Error("No account with that username.");
    const hash = await hashPassword(password);
    if (hash !== rec.pwHash) throw new Error("Incorrect password.");
    localStorage.setItem(LS_SESSION, username.toLowerCase());
    this._load(rec);
    return this.user;
  }

  async logout() {
    localStorage.removeItem(LS_SESSION);
    this.user = null; this.sessions = []; this.topics = []; this.profile = null;
    this.emit("auth", null);
  }

  async addSession(data) {
    const session = { id: makeId(), ...data };
    this.sessions = [session, ...this.sessions];
    this._writeStats(this.sessions);
    this._saveData();
    this.emit("sessions", this.sessions);
    return session;
  }

  async deleteSession(id) {
    this.sessions = this.sessions.filter(s => s.id !== id);
    this._writeStats(this.sessions);
    this._saveData();
    this.emit("sessions", this.sessions);
  }

  async addTopic(topic) {
    const t = { id: makeId(), ...topic };
    this.topics = [t, ...this.topics];
    this._saveData(); this.emit("topics", this.topics);
    return t;
  }
  async updateTopic(id, patch) {
    this.topics = this.topics.map(t => (t.id === id ? { ...t, ...patch } : t));
    this._saveData(); this.emit("topics", this.topics);
  }
  async deleteTopic(id) {
    this.topics = this.topics.filter(t => t.id !== id);
    this._saveData(); this.emit("topics", this.topics);
  }

  _writeStats(sessions) {
    const s = computeStats(sessions);
    this.profile = { ...(this.profile || {}), username: this.user.username, ...s };
    this.emit("profile", this.profile);
  }

  async refreshLeaderboard() {
    const users = this._users();
    const rows = Object.values(users).map(rec => {
      const d = this._data(rec.uid);
      const s = computeStats(d.sessions || []);
      return { uid: rec.uid, username: rec.username, ...s };
    });
    this.emit("leaderboard", rows);
  }
}

/* ================================================================
   FIREBASE BACKEND (cloud)
   ================================================================ */
export class FirebaseStore extends Emitter {
  constructor(sdk, app, cfg) {
    super();
    this.sdk = sdk;         // { auth, db, fns... }
    this.app = app;
    this.cfg = cfg;
    this.mode = "cloud";
    this.user = null;
    this.sessions = []; this.topics = []; this.profile = null;
    this._subs = [];
  }

  async init() {
    const { auth, onAuthStateChanged } = this.sdk;
    this._attached = false;
    return new Promise((resolve) => {
      let first = true;
      onAuthStateChanged(auth, async (fbUser) => {
        if (fbUser) {
          const username = (this._pendingUsername || fbUser.displayName || (this.user && this.user.username) || "").trim();
          this.user = { uid: fbUser.uid, username };
          if (!this._attached) await this._attach(fbUser.uid, username);
          this.emit("auth", this.user);
        } else {
          this.user = null;
          this._detach();
          this.emit("auth", null);
        }
        if (first) { first = false; resolve(this.user); }
      });
    });
  }

  async _attach(uid, username) {
    this._attached = true;
    const { db, doc, onSnapshot, collection, getDoc, setDoc } = this.sdk;
    // Ensure profile + leaderboard docs exist.
    const uRef = doc(db, "users", uid);
    const snap = await getDoc(uRef).catch(() => null);
    if (!snap || !snap.exists()) {
      const prof = { username, createdAt: Date.now(), totalSec: 0, weekSec: 0, monthSec: 0, sessionCount: 0, streak: 0, lastStudyDate: null };
      await setDoc(uRef, prof, { merge: true }).catch(() => {});
      await setDoc(doc(db, "leaderboard", uid), { username, ...prof, updatedAt: Date.now() }, { merge: true }).catch(() => {});
    }

    this._subs.push(onSnapshot(collection(db, "users", uid, "sessions"), (s) => {
      this.sessions = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.start - a.start);
      this.emit("sessions", this.sessions);
    }));
    this._subs.push(onSnapshot(collection(db, "users", uid, "topics"), (s) => {
      this.topics = s.docs.map(d => ({ id: d.id, ...d.data() }));
      this.emit("topics", this.topics);
    }));
    this._subs.push(onSnapshot(uRef, (d) => {
      this.profile = d.exists() ? d.data() : null;
      this.emit("profile", this.profile);
      this.emit("auth", this.user);
    }));
    this._subs.push(onSnapshot(collection(db, "leaderboard"), (s) => {
      this.emit("leaderboard", s.docs.map(d => ({ uid: d.id, ...d.data() })));
    }));
  }

  _detach() { this._subs.forEach(u => { try { u(); } catch {} }); this._subs = []; this.sessions = []; this.topics = []; this.profile = null; }

  _email(username) { return `${username.toLowerCase()}@${USERNAME_EMAIL_DOMAIN}`; }

  async signup(username, password) {
    username = username.trim();
    if (!USERNAME_RE.test(username)) throw new Error("Username must be 3–20 characters: letters, numbers or underscore only.");
    if (password.length < 6) throw new Error("Password must be at least 6 characters.");
    const { auth, db, createUserWithEmailAndPassword, getDoc, setDoc, doc, deleteUser, signOut, updateProfile } = this.sdk;
    const lower = username.toLowerCase();

    const taken = await getDoc(doc(db, "usernames", lower)).catch(() => null);
    if (taken && taken.exists()) throw new Error("That username is already taken. Try another.");

    this._pendingUsername = username;
    let cred;
    try {
      cred = await createUserWithEmailAndPassword(auth, this._email(username), password);
    } catch (e) { throw new Error(mapAuthError(e)); }

    try {
      await setDoc(doc(db, "usernames", lower), { uid: cred.user.uid, username, createdAt: Date.now() });
      await updateProfile(cred.user, { displayName: username }).catch(() => {});
    } catch (e) {
      // Race: someone else grabbed the name first — undo the account.
      try { await deleteUser(cred.user); } catch {}
      try { await signOut(auth); } catch {}
      throw new Error("That username was just taken. Please choose another.");
    }
    return { uid: cred.user.uid, username };
  }

  async login(username, password) {
    username = username.trim();
    const { auth, signInWithEmailAndPassword } = this.sdk;
    this._pendingUsername = username;
    try {
      const cred = await signInWithEmailAndPassword(auth, this._email(username), password);
      return { uid: cred.user.uid, username };
    } catch (e) { throw new Error(mapAuthError(e)); }
  }

  async logout() { await this.sdk.signOut(this.sdk.auth); }

  async addSession(data) {
    const { db, addDoc, collection } = this.sdk;
    const ref = await addDoc(collection(db, "users", this.user.uid, "sessions"), data);
    const session = { id: ref.id, ...data };
    this.sessions = [session, ...this.sessions];
    await this._writeStats(this.sessions);
    return session;
  }

  async deleteSession(id) {
    const { db, deleteDoc, doc } = this.sdk;
    await deleteDoc(doc(db, "users", this.user.uid, "sessions", id));
    this.sessions = this.sessions.filter(s => s.id !== id);
    await this._writeStats(this.sessions);
  }

  async addTopic(topic) {
    const { db, addDoc, collection } = this.sdk;
    const ref = await addDoc(collection(db, "users", this.user.uid, "topics"), topic);
    return { id: ref.id, ...topic };
  }
  async updateTopic(id, patch) {
    const { db, updateDoc, doc } = this.sdk;
    await updateDoc(doc(db, "users", this.user.uid, "topics", id), patch);
  }
  async deleteTopic(id) {
    const { db, deleteDoc, doc } = this.sdk;
    await deleteDoc(doc(db, "users", this.user.uid, "topics", id));
  }

  async _writeStats(sessions) {
    const { db, setDoc, doc } = this.sdk;
    const s = computeStats(sessions);
    const stats = { username: this.user.username, totalSec: s.totalSec, weekSec: s.weekSec, monthSec: s.monthSec, sessionCount: s.sessionCount, streak: s.streak, lastStudyDate: s.lastStudyDate, updatedAt: Date.now() };
    this.profile = { ...(this.profile || {}), ...stats };
    this.emit("profile", this.profile);
    await setDoc(doc(db, "users", this.user.uid), stats, { merge: true }).catch(() => {});
    await setDoc(doc(db, "leaderboard", this.user.uid), stats, { merge: true }).catch(() => {});
  }
}

/* ---------------------------------------------------------------- */
function mapAuthError(e) {
  const code = e && e.code || "";
  if (code.includes("email-already-in-use")) return "That username is already taken. Try another.";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "Wrong username or password.";
  if (code.includes("invalid-email")) return "That username can't be used. Use letters, numbers or underscore.";
  if (code.includes("weak-password")) return "Password must be at least 6 characters.";
  if (code.includes("network")) return "Network error — check your connection.";
  if (code.includes("too-many-requests")) return "Too many attempts. Please wait a moment.";
  if (code.includes("operation-not-allowed")) return "Email/Password sign-in is not enabled in your Firebase project.";
  return (e && e.message) || "Something went wrong. Please try again.";
}

/* ---------------------------------------------------------------- */
/** Boot the correct backend. */
export async function createStore() {
  if (looksConfigured(firebaseConfig)) {
    try {
      const BASE = "https://www.gstatic.com/firebasejs/10.12.2/";
      const [appMod, authMod, fsMod] = await Promise.all([
        import(BASE + "firebase-app.js"),
        import(BASE + "firebase-auth.js"),
        import(BASE + "firebase-firestore.js")
      ]);
      const app = appMod.initializeApp(firebaseConfig);
      const auth = authMod.getAuth(app);
      try { await authMod.setPersistence(auth, authMod.browserLocalPersistence); } catch {}
      const db = fsMod.getFirestore(app);
      const sdk = { app, auth, db, ...authMod, ...fsMod };
      const store = new FirebaseStore(sdk, app, firebaseConfig);
      store.fallback = false;
      return { store, configured: true };
    } catch (e) {
      console.warn("[StudyFlow] Firebase init failed, using on-device mode:", e);
      return { store: new LocalStore(), configured: false, error: e };
    }
  }
  return { store: new LocalStore(), configured: false };
}
