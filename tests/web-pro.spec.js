import { test, expect } from "@playwright/test";
import { PRO_CODES_URL, PRO_SESSION_STORAGE } from "../src/pro-access.js";
import {
  login,
  codesRoute,
  listResponse,
  grantPro,
  storedProof,
  localDocumentCount,
} from "./helpers/pro-access.js";

test("beta requires email and key; a successful login persists across beta and pro", async ({
  page,
  context,
}) => {
  expect(PRO_CODES_URL).toBe("https://tyterapp.github.io/codes-for-pro.txt");
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  const requests = [];
  page.on("request", (request) =>
    requests.push({ url: request.url(), method: request.method() }),
  );
  await page.route(codesRoute, async (route) =>
    route.fulfill(await listResponse()),
  );
  await page.addInitScript(() =>
    localStorage.setItem("tyter.onboarding.v1", "done"),
  );
  await page.goto("/beta");
  await expect(page.getByRole("heading", { name: "Вход в Pro" })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("wrong@example.test");
  await page.getByLabel("Ключ доступа").fill(login.code);
  await page.getByRole("button", { name: "Открыть Pro" }).click();
  await expect(page.getByRole("alert")).toContainText("Email или ключ");
  await page.getByLabel("Email", { exact: true }).fill("PRO@EXAMPLE.TEST");
  await page.getByLabel("Ключ доступа").fill(login.code.toLowerCase());
  await page.getByRole("button", { name: "Открыть Pro" }).click();
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await page.reload();
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  const proof = await storedProof(page);
  expect(proof).toMatch(/^[a-f0-9]{64}$/);
  expect(proof).not.toContain(login.code);
  expect(proof).not.toContain(login.email);
  const checks = requests.filter(
    (request) => new URL(request.url).pathname === "/codes-for-pro.txt",
  );
  expect(checks.length).toBeGreaterThanOrEqual(2);
  for (const check of checks) {
    const url = new URL(check.url);
    expect(url.origin + url.pathname).toBe(PRO_CODES_URL);
    expect(check.method).toBe("GET");
    expect(url.searchParams.has("check")).toBe(true);
    expect(url.href).not.toContain(login.email);
    expect(url.href).not.toContain(login.code);
  }
  expect(requests.some((request) => request.url.includes("/api/pro/"))).toBe(
    false,
  );
  await page.close();
  const reopened = await context.newPage();
  await reopened.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await reopened.route(codesRoute, async (route) =>
    route.fulfill(await listResponse()),
  );
  await reopened.goto("/pro");
  await expect(reopened.locator(".screenplay-editor")).toBeVisible();
  await expect(
    reopened.getByRole("button", { name: "Аутлайн", exact: true }),
  ).toBeVisible();
});

for (const [name, code, email, message] of [
  ["missing key", "MISS01", login.email, "Email или ключ"],
  ["empty email in the file", "EMPTY1", login.email, "не указан email"],
  ["unassigned email in the file", "PEND01", login.email, "не указан email"],
  ["invalid email in the file", "BAD001", login.email, "не указан email"],
  [
    "email belonging to another key",
    login.code,
    "second@example.test",
    "Email или ключ",
  ],
])
  test(name + " prevents access", async ({ page }) => {
    await page.route(codesRoute, async (route) =>
      route.fulfill(await listResponse()),
    );
    await page.goto("/pro");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Ключ доступа").fill(code);
    await page.getByRole("button", { name: "Открыть Pro" }).click();
    await expect(page.getByRole("alert")).toContainText(message);
    await expect(page.locator(".screenplay-editor")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Бесплатная веб-версия" }),
    ).toBeVisible();
    expect(await storedProof(page)).toBeNull();
  });

test("free browser trial cannot be upgraded by a saved Pro session", async ({
  page,
}) => {
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ json: { documents: [] } }),
  );
  await page.goto("/free");
  await page.getByRole("button", { name: "Аутлайн", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Полная версия Tyter" }),
  ).toBeVisible();
  await expect(page.locator(".outline-layout")).toHaveCount(0);
});

test("minute recheck locks a removed pair and keeps local documents", async ({
  page,
}) => {
  await page.clock.install();
  await grantPro(page);
  let allowed = true;
  await page.route(codesRoute, async (route) =>
    route.fulfill(await listResponse(allowed ? undefined : "[ABC123][]")),
  );
  await page.goto("/pro");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  await page.getByRole("button", { name: "Новый сценарий" }).click();
  await page.clock.runFor(1000);
  await expect.poll(() => localDocumentCount(page)).toBeGreaterThanOrEqual(3);
  allowed = false;
  await page.clock.runFor(61000);
  await expect(page.getByRole("alert")).toContainText(
    "Доступ к Pro не подтверждён",
  );
  await expect(page.locator(".screenplay-editor")).toHaveCount(0);
  expect(await storedProof(page)).toBeNull();
  expect(await localDocumentCount(page)).toBeGreaterThanOrEqual(3);
});

test("a network failure keeps the saved session for retry", async ({
  page,
}) => {
  const proof = await grantPro(page);
  let offline = true;
  await page.route(codesRoute, async (route) =>
    offline
      ? route.abort("internetdisconnected")
      : route.fulfill(await listResponse()),
  );
  await page.goto("/pro");
  await expect(page.getByRole("alert")).toContainText("Проверьте интернет");
  expect(await storedProof(page)).toBe(proof);
  await expect(page.locator(".screenplay-editor")).toHaveCount(0);
  offline = false;
  await page.getByRole("button", { name: "Повторить проверку" }).click();
  await expect(page.locator(".screenplay-editor")).toBeVisible();
});

test("an unavailable file reports an error and retains the session", async ({
  page,
}) => {
  const proof = await grantPro(page);
  await page.route(codesRoute, async (route) =>
    route.fulfill(await listResponse("Not found", 404)),
  );
  await page.goto("/pro");
  await expect(page.getByRole("alert")).toContainText("Файл ключей недоступен");
  await expect(page.locator(".screenplay-editor")).toHaveCount(0);
  expect(await storedProof(page)).toBe(proof);
});

test("an arbitrary stored session is checked against the file", async ({
  page,
}) => {
  await page.route(codesRoute, async (route) =>
    route.fulfill(await listResponse()),
  );
  await page.addInitScript(
    (storage) => localStorage.setItem(storage, "a".repeat(64)),
    PRO_SESSION_STORAGE,
  );
  await page.goto("/pro");
  await expect(page.getByRole("alert")).toContainText(
    "Доступ к Pro не подтверждён",
  );
  await expect(page.locator(".screenplay-editor")).toHaveCount(0);
  expect(await storedProof(page)).toBeNull();
});
