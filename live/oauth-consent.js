// Keep consent usable with JavaScript disabled; reveal is an optional enhancement.
const password = document.getElementById("consent-password");
const reveal = document.getElementById("reveal-password");
if (
  password instanceof HTMLInputElement &&
  reveal instanceof HTMLButtonElement
) {
  reveal.hidden = false;
  reveal.addEventListener("click", () => {
    const visible = password.type === "password";
    password.type = visible ? "text" : "password";
    reveal.setAttribute("aria-pressed", String(visible));
    reveal.setAttribute(
      "aria-label",
      visible ? "Hide password" : "Show password",
    );
    reveal.textContent = visible ? "Hide" : "Show";
  });
}

const form = document.querySelector('form[action="/api/oauth/authorize"]');
if (form instanceof HTMLFormElement) {
  let submitting = false;
  form.addEventListener("submit", (event) => {
    if (submitting) {
      event.preventDefault();
      return;
    }
    submitting = true;
    // Disabled buttons are omitted from native POST data. Preserve the chosen
    // decision before disabling them, including submission with Enter.
    const decision = document.createElement("input");
    decision.type = "hidden";
    decision.name = "decision";
    decision.value = event.submitter?.value === "deny" ? "deny" : "allow";
    form.append(decision);
    form.setAttribute("aria-busy", "true");
    for (const button of form.querySelectorAll('button[name="decision"]')) {
      button.disabled = true;
    }
    if (event.submitter instanceof HTMLButtonElement) {
      event.submitter.textContent =
        decision.value === "deny" ? "Cancelling…" : "Connecting…";
    }
    const status = document.getElementById("connection-status");
    if (status) {
      status.hidden = false;
      status.textContent =
        decision.value === "deny"
          ? "Cancelling the connection…"
          : "Connecting to ChatGPT. Please wait…";
    }
  });
}
