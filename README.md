# StudyTrack
StudyTrack@123
Qwerty@123ABC
# 📚 StudyFlow — Track · Review · Improve
Vist Us : https://nmspublic.github.io/StudyFlow/

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
