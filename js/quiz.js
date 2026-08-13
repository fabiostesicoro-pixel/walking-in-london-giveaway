const STATUS = { ACTIVE: "active" };
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

async function fetchActiveGiveaways() {
  const url = `${CONFIG.SUPABASE_URL}/rest/v1/giveaways?status=eq.${STATUS.ACTIVE}&select=*`;
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

function renderCard(item) {
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
        <label>Your answer</label>
        <div class="quiz-answer-row">
          <input type="text" class="quiz-answer-input" placeholder="Type your answer" required>
          <button type="submit" class="btn btn--small">Submit</button>
        </div>
        <p class="quiz-answer-status"></p>
      </form>`
    : `<p class="quiz-locked"><a href="index.html">Sign up</a> to answer</p>`;

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

function render() {
  const list = document.getElementById("quiz-list");
  list.innerHTML = "";

  if (giveaways.length === 0) {
    list.innerHTML = `<p class="g-empty">No active countdowns right now — check back soon.</p>`;
    return;
  }

  giveaways.forEach((item) => {
    list.appendChild(renderCard(item));
  });
}

async function loadAndRender() {
  try {
    giveaways = await fetchActiveGiveaways();
    render();
  } catch (err) {
    console.error("Error loading giveaways:", err);
    document.getElementById("quiz-list").innerHTML =
      `<p class="g-empty">Unable to load the quiz right now. Please try again shortly.</p>`;
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

async function verifyHandle(handle, { silent } = {}) {
  const handleBtn = document.getElementById("handle-btn");
  const handleMessage = document.getElementById("handle-message");

  if (!silent) {
    handleMessage.textContent = "";
    handleMessage.classList.remove("error");
    handleBtn.disabled = true;
    handleBtn.textContent = "Checking...";
  }

  try {
    const registered = await isRegistered(handle);
    if (registered) {
      currentHandle = handle;
      isVerified = true;
      localStorage.setItem(HANDLE_STORAGE_KEY, handle);
      if (!silent) {
        handleMessage.textContent = "Verified! You can now answer below.";
        handleMessage.classList.remove("error");
        handleMessage.classList.add("success");
      }
      render();
    } else if (!silent) {
      handleMessage.textContent = "We couldn't find that handle. Please sign up first on the Sign Up page.";
      handleMessage.classList.add("error");
    }
  } catch (err) {
    console.error("Error checking registration:", err);
    if (!silent) {
      handleMessage.textContent = "Something went wrong. Please try again.";
      handleMessage.classList.add("error");
    }
  }

  if (!silent) {
    handleBtn.disabled = false;
    handleBtn.textContent = "Verify";
  }
}

document.getElementById("handle-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const handle = document.getElementById("handle-input").value.trim();
  if (!handle) return;
  verifyHandle(handle);
});

loadAndRender();
setInterval(tickTimers, 1000);
setInterval(loadAndRender, 60 * 1000);

const savedHandle = localStorage.getItem(HANDLE_STORAGE_KEY);
if (savedHandle) {
  document.getElementById("handle-input").value = savedHandle;
  verifyHandle(savedHandle, { silent: true });
}
