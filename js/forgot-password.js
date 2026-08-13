const supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

const form = document.getElementById("forgot-form");
const forgotBtn = document.getElementById("forgot-btn");
const forgotMessage = document.getElementById("forgot-message");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.getElementById("forgot-email").value.trim();

  forgotMessage.textContent = "";
  forgotMessage.classList.remove("error");

  if (!email) return;

  forgotBtn.disabled = true;
  forgotBtn.textContent = "Sending...";

  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: "https://walkinginlondon.com/reset-password.html",
    });
    if (error) throw error;

    form.hidden = true;
    forgotMessage.textContent = "Check your inbox! We've sent you a link to reset your password.";
    forgotMessage.classList.remove("error");
    forgotMessage.classList.add("success");
  } catch (err) {
    console.error("Reset request error:", err);
    forgotMessage.textContent = "Something went wrong. Please try again.";
    forgotMessage.classList.add("error");
    forgotBtn.disabled = false;
    forgotBtn.textContent = "Send Reset Link";
  }
});
