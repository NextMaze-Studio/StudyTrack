/* ============================================================
   StudyFlow — main application
   ============================================================ */
import { createStore, USERNAME_RE } from "./store.js";
import { makeTopic, gradeTopic, isDue, daysUntil, dueLabel, intervalDays } from "./srs.js";
import { ensureChartJS, renderDailyChart, renderSubjectChart } from "./charts.js";
import {
  formatDuration, formatClock, formatHMS, dateKey, keyToDate, addDays, startOfDay,
  humanDay, humanTime, relativeDayLabel, escapeHtml, colorFor, computeStats,
  secondsInLastDays, monthKey, weekKey
} from "./utils.js";

/* -------------------------------------------------- state */
const state = {
  store: null,
  user: null,
  profile: null,
  sessions: [],
  topics: [],
  leaderboard: [],
  running: false,
  startTs: null,
  tick: null,
  range: 7,
  lbMetric: "totalSec",
  view: "dashboard",
  chartReady: false
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
let toastTimer = null;

function toast(msg, type = "") {
  const el = $("#toast");
  el.textContent = msg;
  el.className = "toast show " + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = "toast " + type; }, 3200);
}

/* -------------------------------------------------- boot */
(async function boot() {
  wireAuthUI();
  wireNav();
  wireTimer();
  wireReview();
  wireDashboard();

  const { store, configured } = await createStore();
  state.store = store;

  store.on("auth", (u) => { state.user = u; if (u) showApp(u); else showAuth(); });
  store.on("sessions", (s) => { state.sessions = s || []; renderAll(); });
  store.on("topics", (t) => { state.topics = t || []; renderReview(); renderSubjectSuggestions(); renderDashboard(); });
  store.on("profile", (p) => { state.profile = p; renderStats(); });
  store.on("leaderboard", (rows) => { state.leaderboard = rows || []; renderLeaderboard(); });

  setModeUI(configured);
  const user = await store.init();
  if (user) showApp(user);

  ensureChartJS().then(() => {
    state.chartReady = true;
    renderDashboard();
  }).catch(() => { /* charts unavailable — dashboard still works */ });
})();

/* -------------------------------------------------- mode UI */
function setModeUI(configured) {
  const banner = $("#modeBanner");
  if (configured) {
    $("#footMode").textContent = "☁️ Cloud sync · global leaderboard";
    $("#modeNote").textContent = "Cloud mode: your username is unique worldwide and the leaderboard is shared.";
    banner.classList.add("hidden");
  } else {
    $("#footMode").textContent = "💾 On-device mode";
    $("#modeNote").textContent = "On-device mode (no cloud configured yet). Data & accounts live in this browser only.";
    banner.innerHTML = "💾 <strong>On-device mode.</strong> Everything is saved in this browser. To unlock <strong>globally unique usernames</strong> and a shared leaderboard, add your free Firebase config in <code>js/firebase-config.js</code> — see the README for the 5-minute setup.";
    banner.classList.remove("hidden");
  }
}

/* -------------------------------------------------- auth UI */
function wireAuthUI() {
  $$(".tab[data-authtab]").forEach(tab => {
    tab.addEventListener("click", () => {
      $$(".tab[data-authtab]").forEach(t => t.classList.toggle("active", t === tab));
      const isLogin = tab.dataset.authtab === "login";
      $("#loginForm").classList.toggle("hidden", !isLogin);
      $("#signupForm").classList.toggle("hidden", isLogin);
    });
  });

  $("#signupUsername").addEventListener("input", (e) => {
    const v = e.target.value.trim();
    const hint = $("#usernameHint");
    if (!v) { hint.textContent = "No email needed. Usernames can't be reused by anyone else."; hint.style.color = ""; return; }
    if (USERNAME_RE.test(v)) { hint.textContent = "✓ Looks good."; hint.style.color = "var(--success)"; }
    else { hint.textContent = "Use 3–20 letters, numbers or underscores (no spaces)."; hint.style.color = "var(--danger)"; }
  });

  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#loginMsg"); msg.className = "auth-msg";
    const un = $("#loginUsername").value, pw = $("#loginPassword").value;
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true; msg.textContent = "Logging in...";
    try {
      await state.store.login(un, pw);
    } catch (err) { msg.textContent = err.message; msg.classList.add("err"); }
    finally { btn.disabled = false; }
  });

  $("#signupForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#signupMsg"); msg.className = "auth-msg";
    const un = $("#signupUsername").value.trim(), pw = $("#signupPassword").value, pw2 = $("#signupPassword2").value;
    if (pw !== pw2) { msg.textContent = "Passwords don't match."; msg.classList.add("err"); return; }
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true; msg.textContent = "Creating account...";
    try {
      await state.store.signup(un, pw);
    } catch (err) { msg.textContent = err.message; msg.classList.add("err"); }
    finally { btn.disabled = false; }
  });

  $("#logoutBtn").addEventListener("click", async () => {
    clearPersistedTimer();
    await state.store.logout();
    toast("Logged out. See you soon!", "ok");
  });
}

function showAuth() {
  $("#appView").classList.add("hidden");
  $("#authView").classList.remove("hidden");
  $("#loginForm").reset(); $("#signupForm").reset();
}
function showApp(user) {
  $("#authView").classList.add("hidden");
  $("#appView").classList.remove("hidden");
  $("#userChip").textContent = "👤 " + (user.username || "you");
  $("#dashGreeting").textContent = `Welcome back, ${user.username}! Here's your progress.`;
  restoreTimer();
  updateNotifyButton();
  renderAll();
  scheduleNotificationChecks();
}

/* -------------------------------------------------- navigation */
function wireNav() {
  $$("#mainNav .nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      state.view = btn.dataset.view;
      $$("#mainNav .nav-btn").forEach(b => b.classList.toggle("active", b === btn));
      $$(".view").forEach(v => v.classList.add("hidden"));
      $("#view-" + state.view).classList.remove("hidden");
      if (state.view === "leaderboard") { state.store.refreshLeaderboard?.(); renderLeaderboard(); }
    });
  });
}

/* ================================================== TIMER */
function wireTimer() {
  $("#startBtn").addEventListener("click", startTimer);
  $("#stopBtn").addEventListener("click", stopTimer);
  $("#cancelBtn").addEventListener("click", () => {
    clearInterval(state.tick);
    state.running = false; state.startTs = null;
    clearPersistedTimer();
    updateTimerUI();
    toast("Session discarded.");
  });
  $("#clearTimerHistoryBtn").addEventListener("click", async () => {
    const today = dateKey();
    const todays = state.sessions.filter(s => s.dateKey === today);
    if (!todays.length) return;
    if (!confirm(`Delete all ${todays.length} session(s) logged today?`)) return;
    for (const s of todays) await state.store.deleteSession(s.id);
    toast("Cleared today's sessions.", "ok");
  });

  // Persist in-progress notes so a refresh doesn't lose them.
  $("#timerSubject").addEventListener("input", () => { if (state.running) persistTimer(); });
  $("#timerNotes").addEventListener("input", () => { if (state.running) persistTimer(); });
}

const timerKey = () => (state.user ? `studyflow:timer:${state.user.uid}` : null);

function persistTimer() {
  const k = timerKey(); if (!k || !state.running) return;
  localStorage.setItem(k, JSON.stringify({
    start: state.startTs,
    subject: $("#timerSubject").value,
    notes: $("#timerNotes").value,
    srs: $("#timerSrs").checked
  }));
}
function clearPersistedTimer() { const k = timerKey(); if (k) localStorage.removeItem(k); }

function restoreTimer() {
  const k = timerKey(); if (!k) return;
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(k) || "null"); } catch {}
  if (!saved || !saved.start) return;
  const elapsed = (Date.now() - saved.start) / 1000;
  if (elapsed > 6 * 3600) { // too long to be a real session — avoid bogus records
    clearPersistedTimer();
    toast("A previous session ran over 6h and was discarded.", "err");
    updateTimerUI();
    return;
  }
  $("#timerSubject").value = saved.subject || "";
  $("#timerNotes").value = saved.notes || "";
  $("#timerSrs").checked = saved.srs !== false;
  state.running = true;
  state.startTs = saved.start;
  clearInterval(state.tick);
  state.tick = setInterval(updateTimerUI, 1000);
  updateTimerUI();
  toast("Resumed your unfinished session ⏱️");
}

function startTimer() {
  state.running = true;
  state.startTs = Date.now();
  persistTimer();
  clearInterval(state.tick);
  state.tick = setInterval(updateTimerUI, 1000);
  updateTimerUI();
}

async function stopTimer() {
  if (!state.running) return;
  const endTs = Date.now();
  const startTs = state.startTs;
  const durationSec = Math.max(1, Math.round((endTs - startTs) / 1000));
  const subject = $("#timerSubject").value.trim();
  const notes = $("#timerNotes").value.trim();
  const addSrs = $("#timerSrs").checked;

  clearInterval(state.tick);
  state.running = false; state.startTs = null;
  clearPersistedTimer();
  updateTimerUI();

  const session = {
    start: startTs, end: endTs, durationSec,
    dateKey: dateKey(new Date(startTs)),
    subject, notes, createdAt: Date.now()
  };
  try {
    await state.store.addSession(session);
    if (addSrs && subject) await addOrReviewTopic(subject, subject);
    $("#timerSubject").value = ""; $("#timerNotes").value = "";
    toast(`Saved ${formatDuration(durationSec)} of studying 🎉`, "ok");
  } catch (e) {
    toast("Could not save session: " + e.message, "err");
  }
}

function updateTimerUI() {
  const display = $("#timerDisplay");
  const elapsed = state.running ? (Date.now() - state.startTs) / 1000 : 0;
  display.textContent = formatClock(elapsed);
  $("#timerStatus").textContent = state.running ? "● Studying…" : "Ready";
  $("#timerStatus").classList.toggle("running", state.running);
  $("#startBtn").classList.toggle("hidden", state.running);
  $("#stopBtn").classList.toggle("hidden", !state.running);
  $("#cancelBtn").classList.toggle("hidden", !state.running);

  const today = state.sessions.filter(s => s.dateKey === dateKey()).reduce((a, s) => a + s.durationSec, 0);
  $("#timerTodayTotal").textContent = formatDuration(today);
}

/* ================================================== REVIEW (spaced repetition) */
async function addOrReviewTopic(name, subject) {
  const existing = state.topics.find(t => t.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    await state.store.updateTopic(existing.id, gradeTopic(existing, "good"));
    toast(`"${name}" reviewed — next in ${intervalDays(existing.intervalIndex + 1)} days.`, "ok");
  } else {
    await state.store.addTopic(makeTopic(name, subject));
    toast(`"${name}" added to review — due tomorrow.`, "ok");
  }
}

function wireReview() {
  $("#addTopicBtn").addEventListener("click", async () => {
    const name = $("#topicName").value.trim();
    const subject = $("#topicSubject").value.trim();
    if (!name) { toast("Enter a topic name first.", "err"); return; }
    const existing = state.topics.find(t => t.name.toLowerCase() === name.toLowerCase());
    if (existing) { toast("That topic is already in your review list."); return; }
    await state.store.addTopic(makeTopic(name, subject));
    $("#topicName").value = ""; $("#topicSubject").value = "";
    toast(`"${name}" scheduled for review.`, "ok");
  });
  $("#topicName").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#addTopicBtn").click(); });
}

async function wireDashboard() {
  $$("#rangeSeg .seg-btn").forEach(b => b.addEventListener("click", () => {
    state.range = Number(b.dataset.range);
    $$("#rangeSeg .seg-btn").forEach(x => x.classList.toggle("active", x === b));
    renderDailyChartUI();
  }));
  $$("#lbSeg .seg-btn").forEach(b => b.addEventListener("click", () => {
    state.lbMetric = b.dataset.lb;
    $$("#lbSeg .seg-btn").forEach(x => x.classList.toggle("active", x === b));
    renderLeaderboard();
  }));
  $("#notifyBtn").addEventListener("click", requestNotifications);
}

/* ================================================== RENDER: all */
function renderAll() {
  renderStats();
  renderDashboard();
  renderTimerLists();
  renderReview();
  renderSubjectSuggestions();
  renderLeaderboard();
}

function renderStats() {
  const s = computeStats(state.sessions);
  $("#statToday").textContent = formatDuration(secondsInLastDays(state.sessions, 1));
  $("#statWeek").textContent = formatDuration(s.weekSec);
  $("#statMonth").textContent = formatDuration(s.monthSec);
  $("#statAll").textContent = formatDuration(s.totalSec);
  $("#statAllSub").textContent = `${s.sessionCount} session${s.sessionCount === 1 ? "" : "s"}`;
  $("#statStreak").textContent = `${s.streak} day${s.streak === 1 ? "" : "s"}`;
  const today = secondsInLastDays(state.sessions, 1);
  $("#statStreakSub").textContent = today > 0 ? "Keep it burning! 🔥" : "Study today to keep it";
  $("#statTodaySub").textContent = today > 0 ? "Nice work today" : "No study yet today";
  const avgWeek = s.sessionCount ? s.totalSec / 7 : 0;
  $("#statWeekSub").textContent = `Mon–Sun · this week`;
  $("#statMonthSub").textContent = new Date().toLocaleString("en", { month: "long" });

  // timer view total
  $("#timerTodayTotal").textContent = formatDuration(today);
}

function renderSubjectSuggestions() {
  const set = new Set();
  state.sessions.forEach(s => { if (s.subject) set.add(s.subject); });
  state.topics.forEach(t => { if (t.subject) set.add(t.subject); });
  $("#subjectSuggestions").innerHTML = [...set].map(s => `<option value="${escapeHtml(s)}"></option>`).join("");
}

/* ================================================== RENDER: dashboard */
function renderDashboard() {
  renderDailyChartUI();
  renderSubjectChartUI();
  renderWindowList();
  renderHeatmap();
  renderTimeline();
}

function buildDailySeries(days) {
  const labels = [], full = [], mins = [];
  const now = new Date();
  const byDay = new Map();
  for (const s of state.sessions) byDay.set(s.dateKey, (byDay.get(s.dateKey) || 0) + s.durationSec);
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(now, -i);
    const key = dateKey(d);
    labels.push(days > 10 ? String(d.getDate()) : d.toLocaleDateString("en", { weekday: "short" }));
    full.push(`${humanDay(key)} — ${formatDuration(byDay.get(key) || 0)}`);
    mins.push(Math.round((byDay.get(key) || 0) / 60));
  }
  return { labels, full, mins };
}

function renderDailyChartUI() {
  if (!state.chartReady) return;
  const { labels, full, mins } = buildDailySeries(state.range);
  renderDailyChart($("#dailyChart"), labels, mins, { fullLabels: full });
}

function renderSubjectChartUI() {
  if (!state.chartReady) return;
  const bySub = new Map();
  for (const s of state.sessions) {
    const key = s.subject || "Untagged";
    bySub.set(key, (bySub.get(key) || 0) + s.durationSec);
  }
  let entries = [...bySub.entries()].sort((a, b) => b[1] - a[1]);
  const empty = entries.length === 0;
  $("#subjectEmpty").classList.toggle("hidden", !empty);
  if (empty) return;
  if (entries.length > 8) {
    const top = entries.slice(0, 8);
    const other = entries.slice(8).reduce((a, e) => a + e[1], 0);
    top.push(["Other", other]);
    entries = top;
  }
  const labels = entries.map(e => e[0]);
  const values = entries.map(e => Math.round(e[1] / 60));
  const colors = labels.map(l => (l === "Other" ? "#c7ccd8" : colorFor(l)));
  renderSubjectChart($("#subjectChart"), labels, values, colors);
}

function renderWindowList() {
  const rows = [];
  const totLast = (n) => secondsInLastDays(state.sessions, n);
  for (let n = 1; n <= 7; n++) {
    const sec = totLast(n);
    const label = n === 1 ? "Today" : `Last ${n} days`;
    rows.push({ label, sec });
  }
  const max = Math.max(1, ...rows.map(r => r.sec));
  $("#windowList").innerHTML = rows.map(r => `
    <li>
      <span class="lbl">${r.label}</span>
      <span class="bar"><i style="width:${Math.round(r.sec / max * 100)}%"></i></span>
      <span class="val">${formatDuration(r.sec)}</span>
    </li>`).join("");
}

function renderHeatmap() {
  const weeks = 26;
  const byDay = new Map();
  for (const s of state.sessions) byDay.set(s.dateKey, (byDay.get(s.dateKey) || 0) + s.durationSec);
  const max = Math.max(1, ...byDay.values());

  // Start on the Monday of the week `weeks-1` weeks ago.
  const today = startOfDay(new Date());
  const mondayOffset = (today.getDay() + 6) % 7;
  const start = addDays(today, -mondayOffset - (weeks - 1) * 7);

  const cells = [];
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d);
      if (date > today) { cells.push(`<div class="hm-cell" style="visibility:hidden"></div>`); continue; }
      const key = dateKey(date);
      const sec = byDay.get(key) || 0;
      const lvl = sec === 0 ? 0 : Math.min(4, Math.max(1, Math.ceil(sec / max * 4)));
      const mins = Math.round(sec / 60);
      cells.push(`<div class="hm-cell" data-lvl="${lvl}" title="${humanDay(key)} — ${formatDuration(sec)} (${mins}m)"></div>`);
    }
  }
  $("#heatmap").innerHTML = cells.join("");
}

function renderTimeline() {
  const list = $("#timeline");
  const sessions = state.sessions.slice(0, 80);
  $("#timelineCount").textContent = `${state.sessions.length} session${state.sessions.length === 1 ? "" : "s"}`;
  $("#timelineEmpty").classList.toggle("hidden", state.sessions.length > 0);
  list.innerHTML = sessions.map(sessionRowHtml).join("");
  wireTimelineDeletes(list);
}

function sessionRowHtml(s) {
  const title = s.subject ? escapeHtml(s.subject) : "Study session";
  const notes = s.notes ? ` · ${escapeHtml(s.notes)}` : "";
  return `<div class="session-row" data-id="${s.id}">
    <span class="dot" style="background:${colorFor(s.subject || "Study session")}"></span>
    <div class="session-main">
      <div class="session-title">${title}</div>
      <div class="session-meta">${relativeDayLabel(s.dateKey)} · ${humanTime(s.start)}–${humanTime(s.end)}${notes}</div>
    </div>
    <span class="session-dur">${formatDuration(s.durationSec)}</span>
    <button class="session-del" title="Delete session" data-del="${s.id}">🗑</button>
  </div>`;
}

function wireTimelineDeletes(root) {
  $$("[data-del]", root).forEach(btn => btn.addEventListener("click", async () => {
    if (!confirm("Delete this session?")) return;
    await state.store.deleteSession(btn.dataset.del);
    toast("Session deleted.");
  }));
}

function renderTimerLists() {
  const today = dateKey();
  const todays = state.sessions.filter(s => s.dateKey === today);
  $("#todayEmpty").classList.toggle("hidden", todays.length > 0);
  $("#clearTimerHistoryBtn").classList.toggle("hidden", todays.length === 0);
  const root = $("#todayTimeline");
  root.innerHTML = todays.map(sessionRowHtml).join("");
  wireTimelineDeletes(root);
  $("#timerTodayTotal").textContent = formatDuration(todays.reduce((a, s) => a + s.durationSec, 0));
}

/* ================================================== RENDER: review */
function renderReview() {
  const today = dateKey();
  const due = state.topics.filter(t => isDue(t, today)).sort((a, b) => a.nextReviewDate.localeCompare(b.nextReviewDate));
  const upcoming = state.topics.filter(t => !isDue(t, today)).sort((a, b) => a.nextReviewDate.localeCompare(b.nextReviewDate));

  $("#dueCount").textContent = due.length ? `${due.length} due` : "0";
  $("#dueEmpty").classList.toggle("hidden", due.length > 0);
  $("#dueList").innerHTML = due.map(t => topicRowHtml(t, true)).join("");

  $("#upcomingEmpty").classList.toggle("hidden", upcoming.length > 0);
  $("#upcomingList").innerHTML = upcoming.slice(0, 12).map(t => topicRowHtml(t, false)).join("");

  const all = [...state.topics].sort((a, b) => a.nextReviewDate.localeCompare(b.nextReviewDate));
  $("#allTopicsEmpty").classList.toggle("hidden", all.length > 0);
  $("#allTopicsList").innerHTML = all.map(t => topicRowHtml(t, isDue(t, today))).join("");

  wireTopicActions($("#view-review"));
  updateDueBadge(due.length);
}

function topicRowHtml(t, due) {
  const d = daysUntil(t);
  const cls = due ? "due" : (d <= 2 ? "soon" : "");
  const sub = t.subject ? `${escapeHtml(t.subject)} · ` : "";
  return `<div class="topic-row ${due ? "due" : ""}" data-topic="${t.id}">
    <div class="topic-info">
      <div class="topic-name">${escapeHtml(t.name)}</div>
      <div class="topic-meta">${sub}reviewed ${t.reviewCount || 0}× · interval ${intervalDays(t.intervalIndex)}d</div>
    </div>
    <span class="pill ${cls}">${dueLabel(t)}</span>
    <div class="topic-actions">
      <button class="btn small ${due ? "btn-primary" : ""}" data-grade="good" data-id="${t.id}">✓ Reviewed</button>
      ${due ? `<button class="btn small btn-ghost" data-grade="again" data-id="${t.id}">↺ Forgot</button>` : ""}
      <button class="btn small btn-ghost" data-del-topic="${t.id}" title="Remove">🗑</button>
    </div>
  </div>`;
}

function wireTopicActions(root) {
  $$("[data-grade]", root).forEach(btn => btn.addEventListener("click", async () => {
    const t = state.topics.find(x => x.id === btn.dataset.id);
    if (!t) return;
    const updated = gradeTopic(t, btn.dataset.grade);
    await state.store.updateTopic(t.id, updated);
    toast(`"${t.name}" → next review in ${intervalDays(updated.intervalIndex)} days.`, "ok");
  }));
  $$("[data-del-topic]", root).forEach(btn => btn.addEventListener("click", async () => {
    const t = state.topics.find(x => x.id === btn.dataset.delTopic);
    if (!t || !confirm(`Remove "${t.name}" from review?`)) return;
    await state.store.deleteTopic(t.id);
    toast("Topic removed.");
  }));
}

function updateDueBadge(n) {
  const btn = $$("#mainNav .nav-btn").find(b => b.dataset.view === "review");
  if (!btn) return;
  btn.textContent = n > 0 ? `🔁 Review (${n})` : "🔁 Review";
}

/* ================================================== RENDER: leaderboard */
function renderLeaderboard() {
  const metric = state.lbMetric;
  const rows = [...state.leaderboard].sort((a, b) => (b[metric] || 0) - (a[metric] || 0));
  $("#lbSubtitle").textContent = state.store.mode === "cloud"
    ? "All StudyFlow users, worldwide. Study to climb!"
    : "On-device leaderboard — shows accounts created in this browser. Enable cloud for a global board.";

  const empty = rows.length === 0;
  $("#lbEmpty").classList.toggle("hidden", !empty);
  if (empty) { $("#lbBody").innerHTML = ""; return; }

  $("#lbBody").innerHTML = rows.map((r, i) => {
    const me = state.user && r.uid === state.user.uid;
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : (i + 1);
    return `<tr class="${me ? "me" : ""}">
      <td class="lb-rank">${medal}</td>
      <td class="lb-user">${escapeHtml(r.username || "someone")}${me ? " (you)" : ""}</td>
      <td>${formatDuration(r[metric] || 0)}</td>
      <td>${r.sessionCount || 0}</td>
      <td>${r.streak || 0}🔥</td>
    </tr>`;
  }).join("");
}

/* ================================================== notifications */
function updateNotifyButton() {
  const btn = $("#notifyBtn");
  const on = ("Notification" in window) && Notification.permission === "granted";
  btn.classList.toggle("on", on);
  btn.title = on ? "Reminders on" : "Enable reminders";
}

function requestNotifications() {
  if (!("Notification" in window)) { toast("This browser doesn't support notifications.", "err"); return; }
  Notification.requestPermission().then((p) => {
    updateNotifyButton();
    if (p === "granted") { toast("Reminders enabled 🔔", "ok"); checkDueNotifications(); }
    else if (p === "denied") toast("Notifications blocked in browser settings.", "err");
  });
}

let notifTimer = null;
function scheduleNotificationChecks() {
  clearInterval(notifTimer);
  checkDueNotifications();
  notifTimer = setInterval(checkDueNotifications, 30 * 60 * 1000); // every 30 min while open
}

function checkDueNotifications() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const today = dateKey();
  const due = state.topics.filter(t => isDue(t, today));
  if (!due.length) return;
  const stampKey = `studyflow:notified:${state.user.uid}`;
  if (localStorage.getItem(stampKey) === today) return;
  localStorage.setItem(stampKey, today);
  const names = due.slice(0, 4).map(t => t.name).join(", ");
  const extra = due.length > 4 ? ` +${due.length - 4} more` : "";
  new Notification("📚 Time to review!", {
    body: `${due.length} topic${due.length === 1 ? "" : "s"} due today: ${names}${extra}.`,
    tag: "studyflow-due"
  });
}
