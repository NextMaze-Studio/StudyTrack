# StudyTrack
StudyTrack@123
Qwerty@123ABC
# 📚 StudyFlow — Track · Review · Improve

A study timer + analytics + spaced-repetition + leaderboard web app. It's a
**100% static site** — perfect for **GitHub Pages**. No build step, no server.

Press **Start** when you open your books, **Stop** when you close them. StudyFlow
records the time & date, saves every session, and turns it all into charts,
streaks and stats. Add a unique username + password (no email!), and you stay
logged in even after closing the tab.

---

## ✨ Features

- ⏱️ **One-tap timer** — Start / Stop, live HH:MM:SS clock, with subject + notes.
- 💾 **Never lose a session** — an in-progress timer survives a refresh / tab close.
- 📊 **Dashboard analytics** — Today, This week, This month, All-time + 🔥 streak.
- 📈 **Charts** — daily study-time bar chart (7 / 14 / 30 days), subject doughnut,
  a **GitHub-style heatmap** and your full study timeline.
- 🔢 **Rolling windows** — "Last 1, 2, 3 … 7 days" totals at a glance.
- 🔁 **Spaced repetition** — add topics, get an interval that grows each review
  (1 → 3 → 7 → 14 → 30 → 60 … days), a **Due today** list, and **browser
  notifications** reminding you what to re-study.
- 🏆 **Global leaderboard** — all-time / this week / this month, ranked by real
  study time. Unique usernames across everyone.
- 🔐 **Simple login** — unique **username + password** only. No email required.
  You stay signed in across visits.
- 🎨 **Clean light theme**, fully responsive (phone friendly).

---

## 🚀 Quick start (2 minutes, on-device mode)

1. Download this folder.
2. Open `index.html` in your browser (or publish to GitHub Pages — see below).
3. Create a username + password and start studying.

In this mode everything is stored **in your browser only** (localStorage). Great
for trying it — but the leaderboard only shows accounts made on your device.

---

## ☁️ Turn on the cloud (unique usernames everywhere + shared leaderboard)

GitHub Pages can't run a server, so for *globally* unique usernames and a *real*
shared leaderboard we use **Firebase** (free tier). Takes ~5 minutes, no coding.

### 1. Create a Firebase project
- Go to <https://console.firebase.google.com> → **Add project** → give it a name → create.

### 2. Enable Authentication
- Left menu → **Build → Authentication → Get started**.
- Under **Sign-in method**, enable **Email/Password** → Save.

### 3. Create the database
- **Build → Firestore Database → Create database** → choose **Production mode** → pick a region.
- Open the **Rules** tab, delete everything, paste the contents of **`firestore.rules`**
  from this project, then **Publish**.

### 4. Get your web config
- Click the **⚙️ gear → Project settings** → scroll to **Your apps** → click the **`</>` (Web)** icon.
- Register the app (any nickname). Copy the `firebaseConfig = { ... }` block.
- Open **`js/firebase-config.js`** and paste your values over the placeholders.

Example:
```js
export const firebaseConfig = {
  apiKey: "AIzaSy....",
  authDomain: "studyflow-1234.firebaseapp.com",
  projectId: "studyflow-1234",
  storageBucket: "studyflow-1234.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123"
};
```

### 5. Authorize your site's domain
- **Authentication → Settings → Authorized domains → Add domain** →
  add `YOUR-USERNAME.github.io` (and `localhost` is already allowed for testing).

Reload the site — the banner disappears and you're on the cloud. 🎉

> Tip: the app auto-detects whether the config is filled in. Leave the
> placeholders and it quietly runs in on-device mode.

---

## 🌐 Host it on GitHub Pages

1. Create a new **public** repository on GitHub (e.g. `studyflow`).
2. Upload **all files in this folder** to the repo (keep the folder structure:
   `index.html`, `css/`, `js/`).
3. In the repo: **Settings → Pages**.
4. Under **Build and deployment → Source**, pick **Deploy from a branch**, choose
   branch **`main`** and folder **`/ (root)`**, then **Save**.
5. Wait ~1 minute. Your site is live at:
   `https://YOUR-USERNAME.github.io/studyflow/`
6. *(If you enabled the cloud)* Add that domain in Firebase's **Authorized domains** (step 5 above).

To update the site later, just edit files in the repo — Pages redeploys automatically.

---

## 🕒 How spaced repetition works

When you stop a session (or add a topic in the **Review** tab), StudyFlow schedules
the next review automatically:

| Review # | Next review in |
|---------:|:---------------|
| 1 | 1 day |
| 2 | 3 days |
| 3 | 7 days |
| 4 | 14 days |
| 5 | 30 days |
| 6 | 60 days |
| 7 | 120 days |
| 8+ | 240 / 365 days |

- **✓ Reviewed** → moves the topic to the next (longer) interval.
- **↺ Forgot** → resets the topic back to the 1-day interval.
- Everything due shows up under **🔔 Due for review today**, and (if you allow
  notifications) you'll get a browser pop-up **once a day** while the site is open.

> Browser notifications only fire while a StudyFlow tab is open (that's a limit
> of static sites — no background server). The in-app **Due today** list is always accurate.

---

## 📁 Project structure

```
study-tracker/
├── index.html            # the whole UI (single page app)
├── css/
│   └── styles.css        # clean light theme
├── js/
│   ├── firebase-config.js  # 👈 paste your Firebase keys here (optional)
│   ├── store.js            # data layer: Firebase + offline fallback
│   ├── utils.js            # dates, formatting, stats
│   ├── srs.js              # spaced-repetition scheduler
│   ├── charts.js           # Chart.js helpers
│   └── app.js              # app logic & rendering
├── firestore.rules       # paste into Firebase
└── README.md
```

---

## ❓ FAQ

**Do I need an email?** No. You just pick a unique username and a password.
(Under the hood the cloud turns `username` into `username@studyflow.app`.)

**Can two people have the same username?** No — the cloud enforces uniqueness
worldwide the moment you sign up.

**Where is my data?** In your own Firebase project (private to your account), or
in your browser in on-device mode.

**Will I stay logged in after closing the tab?** Yes — the session is remembered.

**Does the timer keep running if I close the tab?** Yes, for up to 6 hours; when
you reopen the site the timer resumes where it left off (longer gaps are discarded
to avoid fake time).

**Is it free?** Yes — GitHub Pages and Firebase's free tier both cover this easily.

---

Enjoy the focus. 📚✨
