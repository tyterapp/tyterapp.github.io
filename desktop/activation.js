const form = document.getElementById("activation-form");
const input = document.getElementById("license-key");
const error = document.getElementById("error");
const button = form.querySelector("button");
const retry = document.getElementById("retry-button");
for (const link of document.querySelectorAll("[data-support]"))
  link.addEventListener("click", (event) => {
    event.preventDefault();
    window.tyterDesktop.openSupport(link.dataset.support);
  });
input.addEventListener("input", () => {
  input.value = input.value.replace(/\D/g, "").slice(0, 6);
});
window.tyterDesktop.activationStatus().then((state) => {
  error.textContent = state.reason || "";
  retry.hidden = !state.saved;
  document.getElementById("saved-note").hidden = !state.saved;
});
retry.addEventListener("click", async () => {
  retry.disabled = true;
  error.textContent = "Проверяем сохранённый код…";
  try {
    const result = await window.tyterDesktop.retryActivation();
    error.textContent = result.valid ? "Код принят." : result.reason;
  } catch {
    error.textContent = "Не удалось проверить код. Повторите попытку.";
  } finally {
    retry.disabled = false;
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  button.disabled = true;
  error.textContent = "Проверяем код…";
  try {
    const result = await window.tyterDesktop.activateLicense(input.value);
    if (!result.valid) error.textContent = result.reason;
  } catch {
    error.textContent = "Не удалось сохранить лицензию. Попробуйте ещё раз.";
  } finally {
    button.disabled = false;
  }
});
