const HANDLE_STORAGE_KEY = "walking-in-london-quiz-handle";

const form = document.getElementById("login-form");
const loginBtn = document.getElementById("login-btn");
const loginMessage = document.getElementById("login-message");

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

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const handle = document.getElementById("login-handle").value.trim();

  loginMessage.textContent = "";
  loginMessage.classList.remove("error");

  if (!handle) return;

  loginBtn.disabled = true;
  loginBtn.textContent = "Checking...";

  try {
    const registered = await isRegistered(handle);
    if (registered) {
      localStorage.setItem(HANDLE_STORAGE_KEY, handle);
      loginMessage.textContent = "You're in! Taking you to the Quiz page…";
      loginMessage.classList.remove("error");
      loginMessage.classList.add("success");
      setTimeout(() => {
        window.location.href = "quiz.html";
      }, 1200);
      return;
    }

    loginMessage.innerHTML = `We couldn't find that handle. Please <a href="signup.html">sign up</a> first.`;
    loginMessage.classList.add("error");
  } catch (err) {
    console.error("Error checking registration:", err);
    loginMessage.textContent = "Something went wrong. Please try again.";
    loginMessage.classList.add("error");
  }

  loginBtn.disabled = false;
  loginBtn.textContent = "Login";
});
