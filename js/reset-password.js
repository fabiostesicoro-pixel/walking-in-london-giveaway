const supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

const introText = document.getElementById("reset-intro");
const form = document.getElementById("reset-form");
const resetBtn = document.getElementById("reset-btn");
const resetMessage = document.getElementById("reset-message");

let recoveryReady = false;

supabaseClient.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") {
    recoveryReady = true;
    form.hidden = false;
  }
});

// Fallback: if the recovery link already established a session by the time
// this script runs (supabase-js processes the URL hash on load), just check.
setTimeout(async () => {
  if (recoveryReady) return;
  const { data } = await supabaseClient.auth.getSession();
  if (data.session) {
    recoveryReady = true;
    form.hidden = false;
  } else {
    introText.textContent = "This reset link is invalid or has expired. Please request a new one.";
    resetMessage.innerHTML = `<a href="forgot-password.html">Request a new reset link</a>`;
  }
}, 1500);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const newPassword = document.getElementById("new-password").value;
  const confirmPassword = document.getElementById("new-password-confirm").value;

  resetMessage.textContent = "";
  resetMessage.classList.remove("error", "success");

  if (newPassword !== confirmPassword) {
    resetMessage.textContent = "Passwords don't match.";
    resetMessage.classList.add("error");
    return;
  }

  resetBtn.disabled = true;
  resetBtn.textContent = "Saving...";

  try {
    const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
    if (error) throw error;

    form.hidden = true;
    resetMessage.textContent = "Password updated! Taking you to the Quiz page…";
    resetMessage.classList.add("success");
    setTimeout(() => {
      window.location.href = "quiz.html";
    }, 1500);
  } catch (err) {
    console.error("Reset password error:", err);
    resetMessage.textContent = "Something went wrong. Please try again.";
    resetMessage.classList.add("error");
    resetBtn.disabled = false;
    resetBtn.textContent = "Set New Password";
  }
});
