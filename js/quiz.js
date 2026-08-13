const STATUS = { ACTIVE: "active" };
const HANDLE_STORAGE_KEY = "walking-in-london-quiz-handle";

let currentHandle = "";
let giveaways = [];

function thumbnailUrl(videoId) {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
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

async function submitAnswer(videoId, answer) {
  // Row Level Security has no SELECT policy on quiz_answers (answers must stay
  // private), and Postgres' INSERT ... ON CONFLICT upsert needs SELECT rights
  // to detect conflicts. So we do it in two plain steps instead: try INSERT,
  // and if it's already there (unique violation), fall back to UPDATE.
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

function renderQuizCard(item) {
  const el = document.createElement("div");
  el.className = "g-card g-card--active";

  el.innerHTML = `
    <span class="g-badge g-badge--active">LIVE</span>
    <div class="g-card__row">
      <img class="g-card__thumb" src="${thumbnailUrl(item.video_id)}" alt="${item.title}">
      <div class="g-card__body">
        <p class="g-card__title">${item.title}</p>
      </div>
    </div>
    <form class="quiz-answer-form">
      <label>Your answer</label>
      <div class="quiz-answer-row">
        <input type="text" class="quiz-answer-input" placeholder="Type your answer" required>
        <button type="submit" class="btn btn--small">Submit</button>
      </div>
      <p class="quiz-answer-status"></p>
    </form>
  `;

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

  return el;
}

async function loadAndRenderQuiz() {
  const list = document.getElementById("quiz-list");
  try {
    giveaways = await fetchActiveGiveaways();
  } catch (err) {
    console.error("Error loading giveaways:", err);
    list.innerHTML = `<p class="g-empty">Unable to load the quiz right now. Please try again shortly.</p>`;
    return;
  }

  list.innerHTML = "";
  if (giveaways.length === 0) {
    list.innerHTML = `<p class="g-empty">No active countdowns right now — check back soon.</p>`;
    return;
  }

  giveaways.forEach((item) => {
    list.appendChild(renderQuizCard(item));
  });
}

function unlockQuiz(handle) {
  currentHandle = handle;
  localStorage.setItem(HANDLE_STORAGE_KEY, handle);
  document.getElementById("gate-card").hidden = true;
  document.getElementById("quiz-section").hidden = false;
  loadAndRenderQuiz();
}

document.getElementById("gate-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const gateBtn = document.getElementById("gate-btn");
  const gateMessage = document.getElementById("gate-message");
  const handle = document.getElementById("gate-handle").value.trim();

  gateMessage.textContent = "";
  gateMessage.classList.remove("error");

  if (!handle) return;

  gateBtn.disabled = true;
  gateBtn.textContent = "Checking...";

  try {
    const registered = await isRegistered(handle);
    if (registered) {
      unlockQuiz(handle);
    } else {
      gateMessage.textContent = "We couldn't find that handle. Please sign up first on the Sign Up page.";
      gateMessage.classList.add("error");
    }
  } catch (err) {
    console.error("Error checking registration:", err);
    gateMessage.textContent = "Something went wrong. Please try again.";
    gateMessage.classList.add("error");
  }

  gateBtn.disabled = false;
  gateBtn.textContent = "Enter";
});

const savedHandle = localStorage.getItem(HANDLE_STORAGE_KEY);
if (savedHandle) {
  document.getElementById("gate-handle").value = savedHandle;
  isRegistered(savedHandle)
    .then((registered) => {
      if (registered) unlockQuiz(savedHandle);
    })
    .catch((err) => console.error("Error auto-checking saved handle:", err));
}
