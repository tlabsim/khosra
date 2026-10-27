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
