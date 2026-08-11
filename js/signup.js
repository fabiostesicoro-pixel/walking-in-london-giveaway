const form = document.getElementById("signup-form");
const submitBtn = document.getElementById("submit-btn");
const formMessage = document.getElementById("form-message");
const successMessage = document.getElementById("success-message");

form.querySelectorAll("input").forEach((input) => {
  input.addEventListener("blur", () => input.classList.add("touched"));
});

async function submitSignup(payload) {
  const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/signups`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: CONFIG.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Supabase insert failed: ${response.status}`);
  }
}

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

  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting...";

  try {
    await submitSignup({
      first_name: document.getElementById("first-name").value.trim(),
      last_name: document.getElementById("last-name").value.trim(),
      youtube_handle: document.getElementById("youtube-handle").value.trim(),
      email: document.getElementById("email").value.trim(),
    });

    form.hidden = true;
    successMessage.hidden = false;
  } catch (err) {
    console.error("Signup error:", err);
    formMessage.textContent = "Something went wrong while submitting. Please try again in a moment.";
    formMessage.classList.add("error");
  }

  submitBtn.disabled = false;
  submitBtn.textContent = "Enter the Giveaway";
});
