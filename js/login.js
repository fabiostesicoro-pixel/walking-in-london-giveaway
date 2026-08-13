const supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

const form = document.getElementById("login-form");
const loginBtn = document.getElementById("login-btn");
const loginMessage = document.getElementById("login-message");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  loginMessage.textContent = "";
  loginMessage.classList.remove("error");

  if (!email || !password) return;

  loginBtn.disabled = true;
  loginBtn.textContent = "Checking...";

  try {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;

    loginMessage.textContent = "You're in! Taking you to the Quiz page…";
    loginMessage.classList.remove("error");
    loginMessage.classList.add("success");
    setTimeout(() => {
      window.location.href = "quiz.html";
    }, 1000);
    return;
  } catch (err) {
    console.error("Login error:", err);
    loginMessage.textContent = "Incorrect email or password. Please try again.";
    loginMessage.classList.add("error");
  }

  loginBtn.disabled = false;
  loginBtn.textContent = "Login";
});
