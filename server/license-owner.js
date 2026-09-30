const form = document.getElementById("license-form");
const message = document.getElementById("message");
const key = document.getElementById("key");
const copy = document.getElementById("copy");
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button");
  button.disabled = true;
  key.hidden = copy.hidden = true;
  message.textContent = "Готовим лицензию…";
  const data = new FormData(form);
  try {
    const response = await fetch("issue", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Owner-Token": location.pathname.split("/")[2],
      },
      body: JSON.stringify({
        email: data.get("email"),
        name: data.get("name"),
        days: Number(data.get("days")),
        send: data.get("send") === "on",
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    key.value = result.key;
    key.hidden = copy.hidden = false;
    message.textContent = result.emailSent
      ? "Ключ создан и письмо принято почтовым сервером."
      : result.emailError
        ? "Ключ создан и сохранён. Письмо не отправлено: проверьте настройки SMTP. Ключ можно передать вручную."
        : "Ключ создан и сохранён локально.";
  } catch (error) {
    message.textContent = error.message || "Не удалось создать ключ.";
  } finally {
    button.disabled = false;
  }
});
copy.addEventListener("click", async () => {
  await navigator.clipboard.writeText(key.value);
  copy.textContent = "Скопировано";
});
