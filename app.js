/* =========================================================
   STUDYTRACK APP
========================================================= */

"use strict";

const supabase = window.supabase.createClient(
    window.STUDYTRACK_CONFIG.SUPABASE_URL,
    window.STUDYTRACK_CONFIG.SUPABASE_ANON_KEY
);


/* =========================================================
   STATE
========================================================= */

let currentUser = null;
let currentProfile = null;

let sessions = [];
let reviews = [];

let timerInterval = null;

let timerState = {
    running: false,
    paused: false,
    startedAt: null,
    accumulatedSeconds: 0
};

let analyticsRange = 7;

const TIMER_STORAGE_KEY = "studytrack_active_timer";


/* =========================================================
   INITIALIZATION
========================================================= */

document.addEventListener("DOMContentLoaded", async () => {

    console.log("StudyTrack loaded.");

    setDateText();

    restoreTimer();

    restoreTimerUI();

    const {
        data,
        error
    } = await supabase.auth.getSession();

    if (error) {
        console.error("Auth session error:", error);
        showAuth();
        return;
    }

    if (data.session) {

        currentUser = data.session.user;

        await initializeApp();

    } else {

        showAuth();
    }
});


supabase.auth.onAuthStateChange(async (event, session) => {

    console.log("Auth event:", event);

    if (session) {

        currentUser = session.user;

        await initializeApp();

    } else {

        currentUser = null;

        currentProfile = null;

        showAuth();
    }
});


/* =========================================================
   AUTH UI
========================================================= */

function showAuth() {

    document
        .getElementById("authScreen")
        .classList.remove("hidden");

    document
        .getElementById("appScreen")
        .classList.add("hidden");

    showLogin();
}


function showLogin() {

    document
        .getElementById("loginForm")
        .classList.remove("hidden");

    document
        .getElementById("signupForm")
        .classList.add("hidden");
}


function showSignup() {

    document
        .getElementById("loginForm")
        .classList.add("hidden");

    document
        .getElementById("signupForm")
        .classList.remove("hidden");
}


/* =========================================================
   USERNAME → INTERNAL EMAIL
========================================================= */

function usernameEmail(username) {

    return username.toLowerCase().trim() + "@studytrack.local";
}


/* =========================================================
   SIGNUP
========================================================= */

async function signup() {

    const username =
        document
            .getElementById("signupUsername")
            .value
            .trim()
            .toLowerCase();

    const password =
        document
            .getElementById("signupPassword")
            .value;

    const password2 =
        document
            .getElementById("signupPassword2")
            .value;


    if (!/^[a-z0-9_]{3,20}$/.test(username)) {

        toast(
            "Username must be 3–20 characters and use only letters, numbers or _"
        );

        return;
    }


    if (password.length < 6) {

        toast(
            "Password must contain at least 6 characters."
        );

        return;
    }


    if (password !== password2) {

        toast("Passwords do not match.");

        return;
    }


    const email = usernameEmail(username);

    setAuthButtonsDisabled(true);

    try {

        const {
            data,
            error
        } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    username
                }
            }
        });


        if (error) {

            console.error("Signup error:", error);

            toast(cleanError(error.message));

            return;
        }


        console.log("Signup result:", data);

        if (data.session) {

            toast("Account created!");

        } else {

            toast(
                "Account created. Check your email if confirmation is required."
            );

            showLogin();
        }

    } catch (error) {

        console.error("Signup exception:", error);

        toast("Could not create account.");

    } finally {

        setAuthButtonsDisabled(false);
    }
}


/* =========================================================
   LOGIN
========================================================= */

async function login() {

    const username =
        document
            .getElementById("loginUsername")
            .value
            .trim()
            .toLowerCase();

    const password =
        document
            .getElementById("loginPassword")
            .value;


    if (!username || !password) {

        toast("Enter your username and password.");

        return;
    }


    const email = usernameEmail(username);

    setAuthButtonsDisabled(true);

    try {

        const {
            data,
            error
        } = await supabase.auth.signInWithPassword({
            email,
            password
        });


        if (error) {

            console.error("Login error:", error);

            toast("Incorrect username or password.");

            return;
        }


        console.log("Login successful:", data.user);

        currentUser = data.user;

        await initializeApp();

    } catch (error) {

        console.error("Login exception:", error);

        toast("Login failed.");

    } finally {

        setAuthButtonsDisabled(false);
    }
}


/* =========================================================
   AUTH BUTTON STATE
========================================================= */

function setAuthButtonsDisabled(disabled) {

    const loginButton =
        document.getElementById("loginButton");

    const signupButton =
        document.getElementById("signupButton");

    if (loginButton)
        loginButton.disabled = disabled;

    if (signupButton)
        signupButton.disabled = disabled;
}


/* =========================================================
   LOGOUT
========================================================= */

async function logout() {

    try {

        await supabase.auth.signOut();

    } catch (error) {

        console.error(error);

    }

    stopTimerInterval();

    currentUser = null;

    currentProfile = null;

    showAuth();
}


/* =========================================================
   INITIALIZE
========================================================= */

async function initializeApp() {

    document
        .getElementById("authScreen")
        .classList.add("hidden");

    document
        .getElementById("appScreen")
        .classList.remove("hidden");


    await loadProfile();

    await loadSessions();

    await loadReviews();

    await loadGoals();

    updateHeader();

    renderDashboard();

    renderReviews();

    restoreTimerUI();
}


/* =========================================================
   PROFILE
========================================================= */

async function loadProfile() {

    if (!currentUser)
        return;


    const {
        data,
        error
    } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", currentUser.id)
        .single();


    if (error) {

        console.error("Profile error:", error);

        toast("Could not load your profile.");

        return;
    }


    currentProfile = data;
}


function updateHeader() {

    if (!currentProfile)
        return;


    document
        .getElementById("headerUsername")
        .textContent =
        "@" + currentProfile.username;


    document
        .getElementById("settingsUsername")
        .textContent =
        "@" + currentProfile.username;
}


/* =========================================================
   LOAD SESSIONS
========================================================= */

async function loadSessions() {

    if (!currentUser)
        return;


    const {
        data,
        error
    } = await supabase
        .from("study_sessions")
        .select("*")
        .eq("user_id", currentUser.id)
        .order("start_time", {
            ascending: false
        });


    if (error) {

        console.error("Sessions error:", error);

        sessions = [];

        return;
    }


    sessions = data || [];
}


/* =========================================================
   LOAD REVIEWS
========================================================= */

async function loadReviews() {

    if (!currentUser)
        return;


    const {
        data,
        error
    } = await supabase
        .from("review_items")
        .select("*")
        .eq("user_id", currentUser.id)
        .order("due_at", {
            ascending: true
        });


    if (error) {

        console.error("Reviews error:", error);

        reviews = [];

        return;
    }


    reviews = data || [];
}


/* =========================================================
   LOAD GOALS
========================================================= */

async function loadGoals() {

    if (!currentUser)
        return;


    const {
        data,
        error
    } = await supabase
        .from("study_goals")
        .select("*")
        .eq("user_id", currentUser.id)
        .single();


    if (error) {

        console.error("Goals error:", error);

        return;
    }


    if (!data)
        return;


    document
        .getElementById("dailyGoal")
        .value =
        Math.round(
            data.daily_goal_seconds / 60
        );


    document
        .getElementById("weeklyGoal")
        .value =
        Math.round(
            data.weekly_goal_seconds / 60
        );


    document
        .getElementById("monthlyGoal")
        .value =
        Math.round(
            data.monthly_goal_seconds / 60
        );
}


/* =========================================================
   TIMER STORAGE
========================================================= */

function saveTimerState() {

    localStorage.setItem(
        TIMER_STORAGE_KEY,
        JSON.stringify(timerState)
    );
}


function clearTimerState() {

    localStorage.removeItem(
        TIMER_STORAGE_KEY
    );
}


function restoreTimer() {

    const raw =
        localStorage.getItem(
            TIMER_STORAGE_KEY
        );


    if (!raw)
        return;


    try {

        timerState = JSON.parse(raw);

    } catch {

        clearTimerState();

        return;
    }


    if (
        timerState.running &&
        !timerState.paused
    ) {

        startTimerInterval();
    }
}


/* =========================================================
   TIMER
========================================================= */

function getTimerSeconds() {

    let seconds =
        Number(
            timerState.accumulatedSeconds || 0
        );


    if (
        timerState.running &&
        !timerState.paused &&
        timerState.startedAt
    ) {

        seconds +=
            Math.floor(
                (
                    Date.now() -
                    timerState.startedAt
                ) / 1000
            );
    }


    return Math.max(0, seconds);
}


function formatDuration(seconds) {

    seconds = Math.max(
        0,
        Math.floor(seconds)
    );


    const hours =
        Math.floor(seconds / 3600);

    const minutes =
        Math.floor(
            (seconds % 3600) / 60
        );

    const secs =
        seconds % 60;


    if (hours > 0)
        return `${hours}h ${minutes}m`;

    if (minutes > 0)
        return `${minutes}m ${secs}s`;

    return `${secs}s`;
}


function formatTimer(seconds) {

    seconds =
        Math.max(
            0,
            Math.floor(seconds)
        );


    const h =
        Math.floor(seconds / 3600);

    const m =
        Math.floor(
            (seconds % 3600) / 60
        );

    const s =
        seconds % 60;


    return [h, m, s]
        .map(
            value =>
                String(value)
                    .padStart(2, "0")
        )
        .join(":");
}


function startTimer() {

    if (timerState.running)
        return;


    timerState = {
        running: true,
        paused: false,
        startedAt: Date.now(),
        accumulatedSeconds: 0
    };


    saveTimerState();

    startTimerInterval();

    restoreTimerUI();

    toast("Study session started.");
}


function pauseTimer() {

    if (
        !timerState.running ||
        timerState.paused
    )
        return;


    timerState.accumulatedSeconds =
        getTimerSeconds();

    timerState.paused = true;

    timerState.startedAt = null;

    saveTimerState();

    stopTimerInterval();

    restoreTimerUI();
}


function resumeTimer() {

    if (
        !timerState.running ||
        !timerState.paused
    )
        return;


    timerState.paused = false;

    timerState.startedAt = Date.now();

    saveTimerState();

    startTimerInterval();

    restoreTimerUI();
}


async function stopTimer() {

    if (!timerState.running)
        return;


    const duration =
        getTimerSeconds();


    if (duration < 1) {

        clearTimerState();

        timerState = {
            running: false,
            paused: false,
            startedAt: null,
            accumulatedSeconds: 0
        };

        restoreTimerUI();

        return;
    }


    if (!currentUser) {

        toast("You must be logged in.");

        return;
    }


    const startTime =
        new Date(
            Date.now() -
            duration * 1000
        ).toISOString();


    const endTime =
        new Date().toISOString();


    const subject =
        document
            .getElementById("sessionSubject")
            .value
            .trim() || null;


    const notes =
        document
            .getElementById("sessionNotes")
            .value
            .trim() || null;


    const {
        data,
        error
    } = await supabase
        .from("study_sessions")
        .insert({
            user_id: currentUser.id,
            start_time: startTime,
            end_time: endTime,
            duration_seconds: duration,
            subject,
            notes
        })
        .select()
        .single();


    if (error) {

        console.error(error);

        toast("Could not save the study session.");

        return;
    }


    sessions.unshift(data);

    clearTimerState();


    timerState = {
        running: false,
        paused: false,
        startedAt: null,
        accumulatedSeconds: 0
    };


    stopTimerInterval();


    document
        .getElementById("sessionSubject")
        .value = "";

    document
        .getElementById("sessionNotes")
        .value = "";


    restoreTimerUI();

    renderDashboard();

    toast(
        `Saved ${formatDuration(duration)} of study time.`
    );
}


/* =========================================================
   TIMER INTERVAL
========================================================= */

function startTimerInterval() {

    stopTimerInterval();

    timerInterval =
        setInterval(
            updateTimerDisplay,
            500
        );

    updateTimerDisplay();
}


function stopTimerInterval() {

    if (timerInterval) {

        clearInterval(timerInterval);

        timerInterval = null;
    }
}


function updateTimerDisplay() {

    const timer =
        document.getElementById("timer");

    if (!timer)
        return;


    timer.textContent =
        formatTimer(
            getTimerSeconds()
        );
}


/* =========================================================
   TIMER UI
========================================================= */

function restoreTimerUI() {

    const start =
        document.getElementById("startButton");

    const pause =
        document.getElementById("pauseButton");

    const resume =
        document.getElementById("resumeButton");

    const stop =
        document.getElementById("stopButton");

    const status =
        document.getElementById("timerStatus");


    if (!start)
        return;


    start.classList.add("hidden");
    pause.classList.add("hidden");
    resume.classList.add("hidden");
    stop.classList.add("hidden");


    if (!timerState.running) {

        start.classList.remove("hidden");

        status.textContent = "Ready";

        updateTimerDisplay();

        return;
    }


    stop.classList.remove("hidden");


    if (timerState.paused) {

        resume.classList.remove("hidden");

        status.textContent = "Paused";

    } else {

        pause.classList.remove("hidden");

        status.textContent = "Studying";
    }


    updateTimerDisplay();
}


/* =========================================================
   DASHBOARD
========================================================= */

function setDateText() {

    const element =
        document.getElementById("dateText");

    if (!element)
        return;


    element.textContent =
        new Date().toLocaleDateString(
            undefined,
            {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric"
            }
        );
}


function startOfDay(date = new Date()) {

    return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
    );
}


function totalBetween(from, to) {

    return sessions.reduce(
        (total, session) => {

            const start =
                new Date(
                    session.start_time
                );


            if (
                start >= from &&
                start < to
            ) {

                return total +
                    Number(
                        session.duration_seconds || 0
                    );
            }


            return total;

        },
        0
    );
}


function todaySeconds() {

    const from =
        startOfDay();

    const to =
        new Date(from);

    to.setDate(
        to.getDate() + 1
    );


    return totalBetween(
        from,
        to
    );
}


function renderDashboard() {

    const today =
        todaySeconds();

    const week =
        totalLastDays(7);

    const month =
        totalCurrentMonth();


    document
        .getElementById("todayTotal")
        .textContent =
        formatDuration(today);


    document
        .getElementById("weekTotal")
        .textContent =
        formatDuration(week);


    document
        .getElementById("monthTotal")
        .textContent =
        formatDuration(month);


    document
        .getElementById("streak")
        .textContent =
        calculateStreak() + " days";


    renderTimeline();

    drawWeekChart();

    renderDashboardReviews();
}


function totalLastDays(days) {

    const now =
        new Date();

    const from =
        new Date(now);


    from.setDate(
        from.getDate() -
        (days - 1)
    );


    from.setHours(
        0,
        0,
        0,
        0
    );


    return sessions.reduce(
        (total, session) => {

            const start =
                new Date(
                    session.start_time
                );


            if (
                start >= from &&
                start <= now
            ) {

                return total +
                    Number(
                        session.duration_seconds || 0
                    );
            }


            return total;

        },
        0
    );
}


function totalCurrentMonth() {

    const now =
        new Date();

    const from =
        new Date(
            now.getFullYear(),
            now.getMonth(),
            1
        );


    return totalBetween(
        from,
        new Date(
            now.getTime() + 1000
        )
    );
}


/* =========================================================
   STREAK
========================================================= */

function calculateStreak() {

    const studiedDays =
        new Set();


    sessions.forEach(session => {

        const date =
            new Date(
                session.start_time
            );

        studiedDays.add(
            date.toDateString()
        );
    });


    let streak = 0;

    const date =
        startOfDay();


    while (
        studiedDays.has(
            date.toDateString()
        )
    ) {

        streak++;

        date.setDate(
            date.getDate() - 1
        );
    }


    return streak;
}


/* =========================================================
   TIMELINE
========================================================= */

function renderTimeline() {

    const container =
        document.getElementById("timeline");

    if (!container)
        return;


    const today =
        startOfDay();

    const tomorrow =
        new Date(today);


    tomorrow.setDate(
        tomorrow.getDate() + 1
    );


    const list =
        sessions
            .filter(session => {

                const date =
                    new Date(
                        session.start_time
                    );

                return (
                    date >= today &&
                    date < tomorrow
                );
            })
            .sort(
                (a, b) =>
                    new Date(a.start_time) -
                    new Date(b.start_time)
            );


    if (!list.length) {

        container.innerHTML =
            `<p class="muted">
                No study sessions today.
            </p>`;

        return;
    }


    container.innerHTML =
        list.map(session => {

            const start =
                new Date(
                    session.start_time
                );

            const end =
                new Date(
                    session.end_time
                );


            return `
                <div class="timeline-item">

                    <div class="timeline-dot"></div>

                    <div class="timeline-content">

                        <div class="timeline-title">
                            ${escapeHTML(
                                session.subject ||
                                "Study session"
                            )}
                        </div>

                        <div class="timeline-meta">
                            ${formatClock(start)}
                            →
                            ${formatClock(end)}
                            ·
                            ${formatDuration(
                                session.duration_seconds
                            )}
                        </div>

                        ${
                            session.notes
                            ? `
                                <div class="timeline-meta">
                                    ${escapeHTML(
                                        session.notes
                                    )}
                                </div>
                            `
                            : ""
                        }

                    </div>

                </div>
            `;

        }).join("");
}


/* =========================================================
   CHARTS
========================================================= */

function drawWeekChart() {

    drawBarChart(
        "weekChart",
        7
    );
}


function drawBarChart(canvasId, days) {

    const canvas =
        document.getElementById(canvasId);

    if (!canvas)
        return;


    const ctx =
        canvas.getContext("2d");

    const width =
        canvas.clientWidth || 600;

    const height = 280;

    const ratio =
        window.devicePixelRatio || 1;


    canvas.width =
        width * ratio;

    canvas.height =
        height * ratio;


    ctx.setTransform(
        ratio,
        0,
        0,
        ratio,
        0,
        0
    );


    const values = [];


    for (
        let i = days - 1;
        i >= 0;
        i--
    ) {

        const date =
            startOfDay();

        date.setDate(
            date.getDate() - i
        );


        const next =
            new Date(date);

        next.setDate(
            next.getDate() + 1
        );


        values.push(
            totalBetween(
                date,
                next
            )
        );
    }


    const max =
        Math.max(
            ...values,
            3600
        );


    ctx.clearRect(
        0,
        0,
        width,
        height
    );


    const padding = 35;

    const chartHeight =
        height - 65;

    const chartWidth =
        width - padding * 2;


    values.forEach(
        (value, index) => {

            const slotWidth =
                chartWidth /
                values.length;


            const barWidth =
                slotWidth * 0.55;


            const x =
                padding +
                (
                    index + 0.5
                ) *
                slotWidth -
                barWidth / 2;


            const barHeight =
                (
                    value /
                    max
                ) *
                chartHeight;


            const y =
                height -
                35 -
                barHeight;


            const gradient =
                ctx.createLinearGradient(
                    0,
                    y,
                    0,
                    height
                );


            gradient.addColorStop(
                0,
                "#8179ff"
            );

            gradient.addColorStop(
                1,
                "#4039a8"
            );


            ctx.fillStyle =
                gradient;


            ctx.beginPath();

            if (
                typeof ctx.roundRect ===
                "function"
            ) {

                ctx.roundRect(
                    x,
                    y,
                    barWidth,
                    Math.max(
                        2,
                        barHeight
                    ),
                    6
                );

            } else {

                ctx.rect(
                    x,
                    y,
                    barWidth,
                    Math.max(
                        2,
                        barHeight
                    )
                );
            }

            ctx.fill();


            const date =
                new Date();

            date.setDate(
                date.getDate() -
                (
                    values.length -
                    1 -
                    index
                )
            );


            ctx.fillStyle =
                "#8d98b5";

            ctx.font =
                "12px sans-serif";

            ctx.textAlign =
                "center";


            ctx.fillText(
                date.toLocaleDateString(
                    undefined,
                    {
                        weekday: "short"
                    }
                ),
                x + barWidth / 2,
                height - 12
            );
        }
    );
}


/* =========================================================
   HISTORY
========================================================= */

function renderHistory() {

    const container =
        document.getElementById("historyList");

    if (!container)
        return;


    const search =
        (
            document
                .getElementById("historySearch")
                .value || ""
        )
        .toLowerCase()
        .trim();


    const period =
        document
            .getElementById("historyPeriod")
            .value;


    const now =
        new Date();


    const list =
        sessions.filter(session => {

            const text =
                (
                    session.subject ||
                    ""
                ).toLowerCase()
                +
                " "
                +
                (
                    session.notes ||
                    ""
                ).toLowerCase();


            if (
                search &&
                !text.includes(search)
            ) {

                return false;
            }


            if (
                period !== "all"
            ) {

                const from =
                    new Date(now);

                from.setDate(
                    from.getDate() -
                    Number(period)
                );


                if (
                    new Date(
                        session.start_time
                    ) < from
                ) {

                    return false;
                }
            }


            return true;

        });


    if (!list.length) {

        container.innerHTML =
            "<p>No study sessions found.</p>";

        return;
    }


    container.innerHTML =
        list.map(session => {

            const start =
                new Date(
                    session.start_time
                );


            return `
                <div class="session-row">

                    <div class="session-time">

                        ${start.toLocaleDateString()}

                        <br>

                        ${formatClock(start)}

                    </div>

                    <div>

                        <div class="session-subject">
                            ${escapeHTML(
                                session.subject ||
                                "Study session"
                            )}
                        </div>

                        ${
                            session.notes
                            ? `
                                <div class="session-notes">
                                    ${escapeHTML(
                                        session.notes
                                    )}
                                </div>
                            `
                            : ""
                        }

                    </div>

                    <div class="session-duration">

                        ${formatDuration(
                            session.duration_seconds
                        )}

                    </div>

                </div>
            `;

        }).join("");
}


/* =========================================================
   ANALYTICS
========================================================= */

function setAnalyticsRange(days) {

    analyticsRange = days;

    renderAnalytics();
}


function renderAnalytics() {

    const days =
        analyticsRange;


    const from =
        startOfDay();


    from.setDate(
        from.getDate() -
        (days - 1)
    );


    const relevant =
        sessions.filter(
            session =>
                new Date(
                    session.start_time
                ) >= from
        );


    const total =
        relevant.reduce(
            (sum, session) =>
                sum +
                Number(
                    session.duration_seconds || 0
                ),
            0
        );


    const longest =
        Math.max(
            0,
            ...relevant.map(
                session =>
                    Number(
                        session.duration_seconds || 0
                    )
            )
        );


    document
        .getElementById("analyticsTotal")
        .textContent =
        formatDuration(total);


    document
        .getElementById("analyticsAverage")
        .textContent =
        formatDuration(
            days ? total / days : 0
        );


    document
        .getElementById("analyticsSessions")
        .textContent =
        relevant.length;


    document
        .getElementById("analyticsLongest")
        .textContent =
        formatDuration(longest);


    drawBarChart(
        "analyticsChart",
        days
    );


    renderSubjectStats(relevant);

    renderHeatmap();
}


function renderSubjectStats(relevant) {

    const map = {};


    relevant.forEach(session => {

        const subject =
            session.subject ||
            "Unspecified";


        map[subject] =
            (
                map[subject] || 0
            ) +
            Number(
                session.duration_seconds || 0
            );
    });


    const entries =
        Object.entries(map)
            .sort(
                (a, b) =>
                    b[1] - a[1]
            );


    const max =
        Math.max(
            ...entries.map(
                entry => entry[1]
            ),
            1
        );


    const container =
        document.getElementById(
            "subjectStats"
        );


    if (!entries.length) {

        container.innerHTML =
            "<p>No subject data yet.</p>";

        return;
    }


    container.innerHTML =
        entries.map(
            ([name, seconds]) => `

                <div class="subject-row">

                    <div>

                        <strong>
                            ${escapeHTML(name)}
                        </strong>

                        <div class="subject-bar">

                            <div
                                class="subject-fill"
                                style="
                                    width: ${
                                        (
                                            seconds /
                                            max
                                        ) * 100
                                    }%;
                                "
                            ></div>

                        </div>

                    </div>

                    <strong>
                        ${formatDuration(seconds)}
                    </strong>

                </div>

            `
        ).join("");
}


/* =========================================================
   HEATMAP
========================================================= */

function renderHeatmap() {

    const container =
        document.getElementById("heatmap");

    if (!container)
        return;


    const today =
        startOfDay();


    let html = "";


    for (
        let i = 89;
        i >= 0;
        i--
    ) {

        const date =
            new Date(today);


        date.setDate(
            date.getDate() - i
        );


        const next =
            new Date(date);


        next.setDate(
            next.getDate() + 1
        );


        const seconds =
            totalBetween(
                date,
                next
            );


        let level = 0;


        if (seconds > 0)
            level = 1;

        if (seconds >= 1800)
            level = 2;

        if (seconds >= 7200)
            level = 3;

        if (seconds >= 14400)
            level = 4;


        html += `
            <div
                class="heat-cell heat-${level}"
                title="${date.toLocaleDateString()} — ${formatDuration(seconds)}"
            ></div>
        `;
    }


    container.innerHTML = html;
}


/* =========================================================
   REVIEWS
========================================================= */

function openReviewModal() {

    document
        .getElementById("reviewModal")
        .classList.remove("hidden");
}


function closeReviewModal() {

    document
        .getElementById("reviewModal")
        .classList.add("hidden");
}


async function addReviewItem() {

    const subject =
        document
            .getElementById("reviewSubject")
            .value
            .trim();


    const topic =
        document
            .getElementById("reviewTopic")
            .value
            .trim();


    const notes =
        document
            .getElementById("reviewNotes")
            .value
            .trim();


    if (!topic) {

        toast("Enter a topic.");

        return;
    }


    const {
        data,
        error
    } = await supabase
        .from("review_items")
        .insert({
            user_id: currentUser.id,
            subject: subject || null,
            topic,
            notes: notes || null,
            due_at: new Date().toISOString()
        })
        .select()
        .single();


    if (error) {

        console.error(error);

        toast(error.message);

        return;
    }


    reviews.push(data);


    document
        .getElementById("reviewSubject")
        .value = "";

    document
        .getElementById("reviewTopic")
        .value = "";

    document
        .getElementById("reviewNotes")
        .value = "";


    closeReviewModal();

    renderReviews();

    toast("Revision topic added.");
}


/* =========================================================
   SPACED REPETITION
========================================================= */

async function reviewItem(id, rating) {

    const item =
        reviews.find(
            x => x.id === id
        );


    if (!item)
        return;


    let ease =
        Number(
            item.ease_factor || 2.5
        );


    let repetitions =
        Number(
            item.repetitions || 0
        );


    let interval =
        Number(
            item.interval_days || 0
        );


    if (rating === "again") {

        repetitions = 0;

        interval = 1;

        ease =
            Math.max(
                1.3,
                ease - 0.20
            );
    }


    if (rating === "hard") {

        repetitions++;

        interval =
            interval < 1
            ? 1
            : Math.max(
                1,
                Math.round(
                    interval * 1.2
                )
            );

        ease =
            Math.max(
                1.3,
                ease - 0.15
            );
    }


    if (rating === "good") {

        repetitions++;

        if (interval === 0) {

            interval = 1;

        } else if (interval === 1) {

            interval = 3;

        } else {

            interval =
                Math.round(
                    interval * ease
                );
        }
    }


    if (rating === "easy") {

        repetitions++;

        if (interval === 0) {

            interval = 4;

        } else {

            interval =
                Math.round(
                    interval *
                    ease *
                    1.3
                );
        }

        ease += 0.15;
    }


    const nextDate =
        new Date();


    nextDate.setDate(
        nextDate.getDate() +
        interval
    );


    const {
        data,
        error
    } = await supabase
        .from("review_items")
        .update({
            due_at: nextDate.toISOString(),
            last_reviewed_at:
                new Date().toISOString(),
            interval_days: interval,
            repetitions,
            ease_factor:
                Number(
                    ease.toFixed(2)
                )
        })
        .eq("id", id)
        .select()
        .single();


    if (error) {

        toast(error.message);

        return;
    }


    const index =
        reviews.findIndex(
            x => x.id === id
        );


    reviews[index] = data;


    renderReviews();

    renderDashboardReviews();


    toast(
        `Next review in ${interval} day${interval === 1 ? "" : "s"}.`
    );
}


/* =========================================================
   REVIEW RENDER
========================================================= */

function reviewStatus(item) {

    const due =
        new Date(item.due_at);

    const today =
        startOfDay();

    const tomorrow =
        new Date(today);


    tomorrow.setDate(
        tomorrow.getDate() + 1
    );


    if (due < today)
        return "overdue";

    if (due < tomorrow)
        return "today";

    return "upcoming";
}


function renderReviews() {

    const container =
        document.getElementById("reviewList");

    if (!container)
        return;


    let overdue = 0;
    let today = 0;
    let upcoming = 0;


    reviews.forEach(item => {

        const status =
            reviewStatus(item);


        if (status === "overdue")
            overdue++;

        if (status === "today")
            today++;

        if (status === "upcoming")
            upcoming++;
    });


    document
        .getElementById("overdueCount")
        .textContent = overdue;


    document
        .getElementById("dueTodayCount")
        .textContent = today;


    document
        .getElementById("upcomingCount")
        .textContent = upcoming;


    const due =
        reviews.filter(
            item =>
                reviewStatus(item) !==
                "upcoming"
        );


    if (!due.length) {

        container.innerHTML =
            `<p>
                🎉 Nothing needs reviewing right now.
            </p>`;

        return;
    }


    container.innerHTML =
        due.map(item => `

            <div class="review-row">

                <div>

                    <div class="review-topic">
                        ${escapeHTML(item.topic)}
                    </div>

                    <div class="review-meta">

                        ${
                            item.subject
                            ? escapeHTML(item.subject) + " · "
                            : ""
                        }

                        ${
                            reviewStatus(item) === "overdue"
                            ? "🔴 Overdue"
                            : "🟢 Due today"
                        }

                    </div>

                </div>


                <div class="review-actions">

                    <button
                        class="danger"
                        onclick="reviewItem('${item.id}', 'again')"
                    >
                        Again
                    </button>

                    <button
                        class="secondary"
                        onclick="reviewItem('${item.id}', 'hard')"
                    >
                        Hard
                    </button>

                    <button
                        class="primary"
                        onclick="reviewItem('${item.id}', 'good')"
                    >
                        Good
                    </button>

                    <button
                        class="primary"
                        onclick="reviewItem('${item.id}', 'easy')"
                    >
                        Easy
                    </button>

                </div>

            </div>

        `).join("");
}


function renderDashboardReviews() {

    const container =
        document.getElementById(
            "dashboardReviews"
        );

    if (!container)
        return;


    const due =
        reviews
            .filter(
                item =>
                    reviewStatus(item) !==
                    "upcoming"
            )
            .slice(0, 5);


    if (!due.length) {

        container.innerHTML =
            `<p>
                🎉 No reviews due today.
            </p>`;

        return;
    }


    container.innerHTML =
        due.map(item => `

            <div class="review-row">

                <div>

                    <div class="review-topic">
                        ${escapeHTML(item.topic)}
                    </div>

                    <div class="review-meta">
                        ${
                            item.subject
                            ? escapeHTML(item.subject)
                            : ""
                        }
                    </div>

                </div>

                <button
                    class="primary"
                    onclick="navigate('reviews')"
                >
                    Review
                </button>

            </div>

        `).join("");
}


/* =========================================================
   LEADERBOARD
========================================================= */

async function loadLeaderboard(type = "weekly") {

    const container =
        document.getElementById(
            "leaderboardList"
        );


    document
        .getElementById("weeklyTab")
        .classList.toggle(
            "active",
            type === "weekly"
        );


    document
        .getElementById("alltimeTab")
        .classList.toggle(
            "active",
            type === "alltime"
        );


    const table =
        type === "weekly"
        ? "weekly_leaderboard"
        : "leaderboard";


    const {
        data,
        error
    } = await supabase
        .from(table)
        .select("*")
        .limit(100);


    if (error) {

        console.error(error);

        container.innerHTML =
            "<p>Could not load leaderboard.</p>";

        return;
    }


    if (!data || !data.length) {

        container.innerHTML =
            "<p>No leaderboard data yet.</p>";

        return;
    }


    container.innerHTML =
        data.map(
            (row, index) => {

                let medal =
                    `${index + 1}`;

                if (index === 0)
                    medal = "🥇";

                if (index === 1)
                    medal = "🥈";

                if (index === 2)
                    medal = "🥉";


                return `

                    <div class="rank-row">

                        <div class="rank">
                            ${medal}
                        </div>

                        <div class="rank-name">
                            @${escapeHTML(row.username)}
                        </div>

                        <div class="rank-time">
                            ${formatDuration(
                                Number(row.total_seconds || 0)
                            )}
                        </div>

                    </div>

                `;
            }
        ).join("");
}


/* =========================================================
   GOALS
========================================================= */

async function saveGoals() {

    const daily =
        Number(
            document
                .getElementById("dailyGoal")
                .value
        );


    const weekly =
        Number(
            document
                .getElementById("weeklyGoal")
                .value
        );


    const monthly =
        Number(
            document
                .getElementById("monthlyGoal")
                .value
        );


    const {
        error
    } = await supabase
        .from("study_goals")
        .update({
            daily_goal_seconds: daily * 60,
            weekly_goal_seconds: weekly * 60,
            monthly_goal_seconds: monthly * 60,
            updated_at: new Date().toISOString()
        })
        .eq(
            "user_id",
            currentUser.id
        );


    if (error) {

        toast(error.message);

        return;
    }


    toast("Goals saved.");
}


/* =========================================================
   NAVIGATION
========================================================= */

function navigate(page) {

    document
        .querySelectorAll(".page")
        .forEach(
            element =>
                element.classList.add("hidden")
        );


    const target =
        document.getElementById(
            "page-" + page
        );


    if (!target)
        return;


    target.classList.remove("hidden");


    document
        .querySelectorAll(".nav")
        .forEach(button => {

            button.classList.toggle(
                "active",
                button.dataset.page === page
            );
        });


    if (page === "dashboard")
        renderDashboard();

    if (page === "history")
        renderHistory();

    if (page === "analytics")
        renderAnalytics();

    if (page === "reviews")
        renderReviews();

    if (page === "leaderboard")
        loadLeaderboard();

    if (page === "settings")
        loadGoals();
}


/* =========================================================
   HELPERS
========================================================= */

function formatClock(date) {

    return date.toLocaleTimeString(
        undefined,
        {
            hour: "2-digit",
            minute: "2-digit"
        }
    );
}


function escapeHTML(value) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


function cleanError(message) {

    const lower =
        String(message).toLowerCase();


    if (
        lower.includes("already registered") ||
        lower.includes("user already registered")
    ) {

        return "That username is already taken.";
    }


    if (
        lower.includes("email rate limit")
    ) {

        return "Too many attempts. Please wait a little and try again.";
    }


    return message;
}


function toast(message) {

    const element =
        document.getElementById("toast");


    if (!element)
        return;


    element.textContent = message;

    element.classList.add("show");


    setTimeout(
        () => {
            element.classList.remove("show");
        },
        3000
    );
}


/* =========================================================
   RESIZE
========================================================= */

window.addEventListener("resize", () => {

    const dashboard =
        document.getElementById(
            "page-dashboard"
        );

    const analytics =
        document.getElementById(
            "page-analytics"
        );


    if (
        dashboard &&
        !dashboard.classList.contains("hidden")
    ) {

        drawWeekChart();
    }


    if (
        analytics &&
        !analytics.classList.contains("hidden")
    ) {

        renderAnalytics();
    }
});


/* =========================================================
   BEFORE UNLOAD
========================================================= */

window.addEventListener(
    "beforeunload",
    () => {

        if (timerState.running)
            saveTimerState();
    }
);


/* =========================================================
   MAKE FUNCTIONS AVAILABLE TO HTML onclick=""
========================================================= */

window.login = login;
window.signup = signup;
window.showLogin = showLogin;
window.showSignup = showSignup;

window.logout = logout;

window.startTimer = startTimer;
window.pauseTimer = pauseTimer;
window.resumeTimer = resumeTimer;
window.stopTimer = stopTimer;

window.navigate = navigate;

window.setAnalyticsRange =
    setAnalyticsRange;

window.renderHistory =
    renderHistory;

window.openReviewModal =
    openReviewModal;

window.closeReviewModal =
    closeReviewModal;

window.addReviewItem =
    addReviewItem;

window.reviewItem =
    reviewItem;

window.loadLeaderboard =
    loadLeaderboard;

window.saveGoals =
    saveGoals;
