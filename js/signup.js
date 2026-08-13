const supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

const form = document.getElementById("signup-form");
const submitBtn = document.getElementById("submit-btn");
const formMessage = document.getElementById("form-message");
const successMessage = document.getElementById("success-message");

form.querySelectorAll("input").forEach((input) => {
  input.addEventListener("blur", () => input.classList.add("touched"));
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  formMessage.textContent = "";
  formMessage.classList.remove("error");

  if (!form.checkValidity()) {
    form.querySelectorAll("input").forEach((input) => input.classList.add("touched"));
    formMessage.textContent = "Please check the highlighted fields and try again.";
    formMessage.classList.add("error");
    return;
  }

  const firstName = document.getElementById("first-name").value.trim();
  const lastName = document.getElementById("last-name").value.trim();
  const youtubeHandle = document.getElementById("youtube-handle").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const passwordConfirm = document.getElementById("password-confirm").value;

  if (password !== passwordConfirm) {
    formMessage.textContent = "Passwords don't match.";
    formMessage.classList.add("error");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting...";

  try {
    const { data: authData, error: authError } = await supabaseClient.auth.signUp({ email, password });
    if (authError) throw authError;

    const { error: insertError } = await supabaseClient.from("signups").insert({
      user_id: authData.user.id,
      first_name: firstName,
      last_name: lastName,
      youtube_handle: youtubeHandle,
      email,
    });
    if (insertError) throw insertError;

    form.hidden = true;
    successMessage.hidden = false;
    setTimeout(() => {
      window.location.href = "quiz.html";
    }, 1500);
  } catch (err) {
    console.error("Signup error:", err);
    formMessage.textContent =
      err.message && err.message.includes("already registered")
        ? "That email is already registered. Try logging in instead."
        : "Something went wrong while submitting. Please try again in a moment.";
    formMessage.classList.add("error");
  }

  submitBtn.disabled = false;
  submitBtn.textContent = "Enter the Giveaway";
});
