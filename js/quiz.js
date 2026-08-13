const STATUS = { ACTIVE: "active" };
const HANDLE_STORAGE_KEY = "walking-in-london-quiz-handle";

let giveaways = [];

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

async function submitAnswer(handle, videoId, answer) {
  // No SELECT policy on quiz_answers (answers stay private), and Postgres'
  // INSERT ... ON CONFLICT upsert needs SELECT rights to detect conflicts.
  // So: try INSERT, and if it's already there (unique violation), UPDATE instead.
  const baseHeaders = {
    "Content-Type": "application/json",
    apikey: CONFIG.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
  };
  const payload = {
    youtube_handle: handle,
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
    `?youtube_handle=eq.${encodeURIComponent(handle)}` +
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

  const savedHandle = localStorage.getItem(HANDLE_STORAGE_KEY) ?? "";

  const badge = expired
    ? `<span class="g-badge g-badge--pending">DRAW WITHIN 24H</span>`
    : `<span class="g-badge g-badge--active">LIVE</span>`;

  const clock = expired
    ? ""
    : `<span class="g-clock" data-expiry="${item.expires_at}">${formatCountdown(new Date(item.expires_at) - Date.now())}</span>`;

  const metaLine = expired
    ? `<p class="g-card__meta g-card__meta--views">Fetching final views&hellip;</p>`
    : `<p class="g-card__meta">👁 ${item.current_views ?? "—"} views</p>`;

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
    <form class="quiz-answer-form" data-video-id="${item.video_id}">
      <div class="quiz-answer-grid">
        <div>
          <label>Your YouTube Handle</label>
          <input type="text" class="quiz-handle-input" placeholder="@yourname" value="${savedHandle}">
        </div>
        <div>
          <label>Your answer</label>
          <input type="text" class="quiz-answer-input" placeholder="Type your answer">
        </div>
      </div>
      <button type="submit" class="btn btn--small">Submit</button>
      <p class="quiz-answer-status"></p>
    </form>
  `;

  if (expired) {
    fetchFinalViews(item.video_id)
      .then((views) => {
        const metaEl = el.querySelector(".g-card__meta--views");
        if (metaEl) metaEl.textContent = `👁 ${views} final views`;
      })
      .catch((err) => console.error("Error fetching final views:", err));
  }

  const form = el.querySelector(".quiz-answer-form");
  const handleInput = el.querySelector(".quiz-handle-input");
  const answerInput = el.querySelector(".quiz-answer-input");
  const status = el.querySelector(".quiz-answer-status");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const handle = handleInput.value.trim();
    const answer = answerInput.value.trim();

    status.textContent = "";
    status.classList.remove("error", "success");

    if (!handle || !answer) {
      status.textContent = "Please fill in both your handle and your answer.";
      status.classList.add("error");
      return;
    }

    const submitBtn = form.querySelector("button");
    submitBtn.disabled = true;

    try {
      const registered = await isRegistered(handle);
      if (!registered) {
        status.innerHTML = `We couldn't find that handle. Please <a href="index.html">sign up</a> first.`;
        status.classList.add("error");
        submitBtn.disabled = false;
        return;
      }

      await submitAnswer(handle, item.video_id, answer);
      localStorage.setItem(HANDLE_STORAGE_KEY, handle);
      status.textContent = "Answer received! Don't forget to comment DONE under the video on YouTube.";
      status.classList.add("success");
    } catch (err) {
      console.error("Error submitting answer:", err);
      status.textContent = "Something went wrong. Please try again.";
      status.classList.add("error");
    }

    submitBtn.disabled = false;
  });

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

loadAndRender();
setInterval(tickTimers, 1000);
setInterval(loadAndRender, 60 * 1000);
