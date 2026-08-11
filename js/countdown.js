const STATUS = {
  ACTIVE: "active",
  CLOSED: "closed",
};

let giveaways = [];

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
    // No API key configured yet: mock value until we connect the YouTube Data API.
    return Math.floor(10000 + Math.random() * 10000);
  }

  const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}&key=${CONFIG.YOUTUBE_API_KEY}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Error calling the YouTube Data API");
  const data = await response.json();
  return Number(data.items?.[0]?.statistics?.viewCount ?? 0);
}

function renderActiveCard(item, isExpired) {
  const el = document.createElement("div");
  el.className = "g-card g-card--active" + (isExpired ? " g-card--pending" : "");

  const badge = isExpired
    ? `<span class="g-badge g-badge--pending">DRAW WITHIN 24H</span>`
    : `<span class="g-badge g-badge--active">LIVE</span>`;

  const clock = isExpired
    ? ""
    : `<span class="g-clock" data-expiry="${item.expires_at}">${formatCountdown(new Date(item.expires_at) - Date.now())}</span>`;

  const metaLine = isExpired
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
  `;

  if (isExpired) {
    fetchFinalViews(item.video_id)
      .then((views) => {
        const metaEl = el.querySelector(".g-card__meta--views");
        if (metaEl) metaEl.textContent = `👁 ${views} final views`;
      })
      .catch((err) => console.error("Error fetching final views:", err));
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
  const activeList = document.getElementById("active-list");
  const historyList = document.getElementById("history-list");

  activeList.innerHTML = "";
  historyList.innerHTML = "";

  const active = giveaways.filter((g) => g.status === STATUS.ACTIVE);
  const history = giveaways
    .filter((g) => g.status === STATUS.CLOSED)
    .sort((a, b) => new Date(b.expires_at) - new Date(a.expires_at));

  if (active.length === 0) {
    activeList.innerHTML = `<p class="g-empty">No active countdowns right now.</p>`;
  } else {
    active.forEach((item) => {
      activeList.appendChild(renderActiveCard(item, isPastExpiry(item)));
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

async function loadAndRender() {
  try {
    giveaways = await fetchGiveaways();
    render();
  } catch (err) {
    console.error("Error loading giveaways:", err);
    document.getElementById("active-list").innerHTML =
      `<p class="g-empty">Unable to load the draw right now. Please try again shortly.</p>`;
  }
}

loadAndRender();
setInterval(tickTimers, 1000);
setInterval(loadAndRender, 60 * 1000);
