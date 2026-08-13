const STATUS = { ACTIVE: "active", CLOSED: "closed" };
const HANDLE_STORAGE_KEY = "walking-in-london-quiz-handle";

let giveaways = [];
let currentHandle = "";
let isVerified = false;

function thumbnailUrl(videoId) {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function formatCountdown(msRemaining) {
  if (msRemaining <= 0) return "00d 00:00:00";
  const totalSeconds = Math.floor(msRemaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad(days)}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function isPastExpiry(item) {
  return new Date(item.expires_at).getTime() <= Date.now();
}

async function fetchFinalViews(videoId) {
  if (!CONFIG.YOUTUBE_API_KEY) {
    return Math.floor(10000 + Math.random() * 10000);
  }
  const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}&key=${CONFIG.YOUTUBE_API_KEY}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Error calling the YouTube Data API");
  const data = await response.json();
  return Number(data.items?.[0]?.statistics?.viewCount ?? 0);
}

async function fetchGiveaways() {
  const url = `${CONFIG.SUPABASE_URL}/rest/v1/giveaways?select=*`;
  const response = await fetch(url, {
    headers: {
      apikey: CONFIG.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
    },
  });
  if (!response.ok) throw new Error(`Failed to load giveaways: ${response.status}`);
  return response.json();
}

async function isRegistered(handle) {
  const url = `${CONFIG.SUPABASE_URL}/rest/v1/rpc/is_registered`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: CONFIG.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ handle }),
  });
  if (!response.ok) throw new Error(`is_registered check failed: ${response.status}`);
  return response.json();
}

async function submitAnswer(videoId, answer) {
  // No SELECT policy on quiz_answers (answers stay private), and Postgres'
  // INSERT ... ON CONFLICT upsert needs SELECT rights to detect conflicts.
  // So: try INSERT, and if it's already there (unique violation), UPDATE instead.
  const baseHeaders = {
    "Content-Type": "application/json",
    apikey: CONFIG.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
  };
  const payload = {
    youtube_handle: currentHandle,
    video_id: videoId,
    answer,
    submitted_at: new Date().toISOString(),
  };

  const insertResponse = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/quiz_answers`, {
    method: "POST",
    headers: { ...baseHeaders, Prefer: "return=minimal" },
    body: JSON.stringify(payload),
  });

  if (insertResponse.ok) return;
  if (insertResponse.status !== 409) {
    throw new Error(`Failed to submit answer: ${insertResponse.status}`);
  }

  const updateUrl =
    `${CONFIG.SUPABASE_URL}/rest/v1/quiz_answers` +
    `?youtube_handle=eq.${encodeURIComponent(currentHandle)}` +
    `&video_id=eq.${encodeURIComponent(videoId)}`;

  const updateResponse = await fetch(updateUrl, {
    method: "PATCH",
    headers: { ...baseHeaders, Prefer: "return=minimal" },
    body: JSON.stringify({ answer, submitted_at: payload.submitted_at }),
  });

  if (!updateResponse.ok) throw new Error(`Failed to update answer: ${updateResponse.status}`);
}

function renderActiveCard(item) {
  const el = document.createElement("div");
  const expired = isPastExpiry(item);
  el.className = "g-card g-card--active" + (expired ? " g-card--pending" : "");

  const badge = expired
    ? `<span class="g-badge g-badge--pending">DRAW WITHIN 24H</span>`
    : `<span class="g-badge g-badge--active">LIVE</span>`;

  const clock = expired
    ? ""
    : `<span class="g-clock" data-expiry="${item.expires_at}">${formatCountdown(new Date(item.expires_at) - Date.now())}</span>`;

  const metaLine = expired
    ? `<p class="g-card__meta g-card__meta--views">Fetching final views&hellip;</p>`
    : `<p class="g-card__meta">👁 ${item.current_views ?? "—"} views</p>`;

  const answerSection = isVerified
    ? `<form class="quiz-answer-form" data-video-id="${item.video_id}">
        <label>Your Answer</label>
        <div class="quiz-answer-row">
          <input type="text" class="quiz-answer-input" placeholder="Type your answer" required>
          <button type="submit" class="btn btn--small">Submit</button>
        </div>
        <p class="quiz-answer-status"></p>
      </form>`
    : `<div class="quiz-locked">
        <label>Your Answer</label>
        <a href="signup.html" class="btn btn--small">Sign Up</a>
      </div>`;

  el.innerHTML = `
    ${badge}
    <div class="g-card__row">
      <img class="g-card__thumb" src="${thumbnailUrl(item.video_id)}" alt="${item.title}">
      <div class="g-card__body">
        <div class="g-card__title-row">
          <p class="g-card__title">${item.title}</p>
          ${clock}
        </div>
        ${metaLine}
      </div>
    </div>
    ${answerSection}
  `;

  if (expired) {
    fetchFinalViews(item.video_id)
      .then((views) => {
        const metaEl = el.querySelector(".g-card__meta--views");
        if (metaEl) metaEl.textContent = `👁 ${views} final views`;
      })
      .catch((err) => console.error("Error fetching final views:", err));
  }

  if (isVerified) {
    const form = el.querySelector(".quiz-answer-form");
    const input = el.querySelector(".quiz-answer-input");
    const status = el.querySelector(".quiz-answer-status");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const answer = input.value.trim();
      if (!answer) return;

      const submitBtn = form.querySelector("button");
      submitBtn.disabled = true;

      try {
        await submitAnswer(item.video_id, answer);
        status.textContent = "Answer received! Don't forget to comment DONE under the video on YouTube.";
        status.classList.remove("error");
        status.classList.add("success");
      } catch (err) {
        console.error("Error submitting answer:", err);
        status.textContent = "Something went wrong. Please try again.";
        status.classList.remove("success");
        status.classList.add("error");
      }

      submitBtn.disabled = false;
    });
  }

  return el;
}

function renderHistoryCard(item) {
  const el = document.createElement("div");
  el.className = "g-card g-card--history";
  el.innerHTML = `
    <div class="g-card__row">
      <img class="g-card__thumb" src="${thumbnailUrl(item.video_id)}" alt="${item.title}">
      <div class="g-card__body">
        <p class="g-card__title">${item.title}</p>
        <p class="g-card__meta">👁 ${item.final_views ?? "—"} final views</p>
        <p class="g-card__meta">🏆 Prize: ${item.prize ?? "—"}</p>
        <p class="g-card__meta">🎉 Winner: ${item.winner_handle ?? "—"}</p>
      </div>
    </div>
  `;
  return el;
}

function render() {
  const activeList = document.getElementById("quiz-list");
  const historyList = document.getElementById("history-list");

  activeList.innerHTML = "";
  historyList.innerHTML = "";

  const active = giveaways.filter((g) => g.status === STATUS.ACTIVE);
  const history = giveaways
    .filter((g) => g.status === STATUS.CLOSED)
    .sort((a, b) => new Date(b.expires_at) - new Date(a.expires_at));

  if (active.length === 0) {
    activeList.innerHTML = `<p class="g-empty">No active countdowns right now — check back soon.</p>`;
  } else {
    active.forEach((item) => {
      activeList.appendChild(renderActiveCard(item));
    });
  }

  if (history.length === 0) {
    historyList.innerHTML = `<p class="g-empty">No past winners yet.</p>`;
  } else {
    history.forEach((item) => {
      historyList.appendChild(renderHistoryCard(item));
    });
  }
}

async function loadAndRender() {
  try {
    giveaways = await fetchGiveaways();
    render();
  } catch (err) {
    console.error("Error loading giveaways:", err);
    document.getElementById("quiz-list").innerHTML =
      `<p class="g-empty">Unable to load the draw right now. Please try again shortly.</p>`;
  }
}

function tickTimers() {
  const timers = document.querySelectorAll(".g-clock");
  let anyExpired = false;

  timers.forEach((el) => {
    const remaining = new Date(el.dataset.expiry) - Date.now();
    el.textContent = formatCountdown(remaining);
    if (remaining <= 0) anyExpired = true;
  });

  if (anyExpired) render();
}

async function init() {
  const savedHandle = localStorage.getItem(HANDLE_STORAGE_KEY);
  if (savedHandle) {
    try {
      const registered = await isRegistered(savedHandle);
      if (registered) {
        currentHandle = savedHandle;
        isVerified = true;
      }
    } catch (err) {
      console.error("Error checking saved handle:", err);
    }
  }

  await loadAndRender();
}

init();
setInterval(tickTimers, 1000);
setInterval(loadAndRender, 60 * 1000);
