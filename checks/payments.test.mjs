import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { createPaymentHandler } from "../server/payments.mjs";

const require = createRequire(import.meta.url);
const { verifyLicense } = require("../desktop/license.cjs");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

test("Robokassa callback issues one signed unique license only after validated payment", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "tyter-payment-"));
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  await mkdir(path.join(root, "desktop"));
  await mkdir(path.join(root, "build-secrets"));
  await writeFile(path.join(root, "desktop/license-public.pem"), publicKey);
  await writeFile(
    path.join(root, "build-secrets/license-private.pem"),
    privateKey,
  );
  const env = {
    ROBOKASSA_MERCHANT_LOGIN: "tyter-test",
    ROBOKASSA_PASSWORD_1: "first-password",
    ROBOKASSA_PASSWORD_2: "second-password",
    ROBOKASSA_HASH_ALGORITHM: "sha256",
    ROBOKASSA_TAX: "none",
    ROBOKASSA_TEST_MODE: "1",
    TYTER_PUBLIC_URL: "https://tyter.example",
  };
  const sent = [];
  let failDelivery = true;
  const handler = createPaymentHandler({
    root,
    env,
    mail: {
      available: true,
      async send(order) {
        if (failDelivery) {
          failDelivery = false;
          throw new Error("SMTP temporarily unavailable");
        }
        sent.push(structuredClone(order));
      },
    },
  });
  const server = createServer((req, res) =>
    handler(req, res, () => res.writeHead(404).end()),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const config = await (await fetch(`${base}/api/payment/config`)).json();
    assert.equal(config.available, true);
    const created = await (
      await fetch(`${base}/api/payment/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://tyter.example",
        },
        body: JSON.stringify({ name: "Анна", email: "anna@example.com" }),
      })
    ).json();
    assert.match(created.orderId, /^\d{9}$/);
    assert.ok(created.token.length > 30);
    const checkout = new URL(created.checkoutUrl);
    assert.equal(checkout.hostname, "auth.robokassa.ru");
    assert.equal(checkout.searchParams.get("OutSum"), "1200.00");
    const receipt = checkout.searchParams.get("Receipt");
    assert.equal(
      checkout.searchParams.get("SignatureValue"),
      sha256(`tyter-test:1200.00:${created.orderId}:${receipt}:first-password`),
    );
    const statusUrl = `${base}/api/payment/status?${new URLSearchParams({ orderId: created.orderId, token: created.token })}`;
    assert.equal((await (await fetch(statusUrl)).json()).status, "pending");
    assert.equal(
      (
        await fetch(
          `${base}/api/payment/status?orderId=${created.orderId}&token=wrong`,
        )
      ).status,
      404,
    );
    const notify = (outSum, signature) =>
      fetch(`${base}/api/payment/result`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          OutSum: outSum,
          InvId: created.orderId,
          SignatureValue: signature,
        }),
      });
    assert.equal((await notify("1200.00", "0".repeat(64))).status, 403);
    assert.equal(
      (
        await notify(
          "100.00",
          sha256(`100.00:${created.orderId}:second-password`),
        )
      ).status,
      403,
    );
    const validSignature = sha256(
      `1200.000000:${created.orderId}:second-password`,
    );
    assert.equal((await notify("1200.000000", validSignature)).status, 500);
    const pendingEmail = await (await fetch(statusUrl)).json();
    assert.equal(pendingEmail.status, "paid");
    assert.equal(pendingEmail.emailSent, false);
    const result = await notify("1200.000000", validSignature);
    assert.equal(result.status, 200);
    assert.equal(await result.text(), `OK${created.orderId}`);
    const paid = await (await fetch(statusUrl)).json();
    assert.equal(paid.status, "paid");
    assert.equal(verifyLicense(paid.licenseKey, publicKey).valid, true);
    assert.equal(
      verifyLicense(paid.licenseKey, publicKey).payload.emailHash,
      sha256("anna@example.com"),
    );
    assert.equal(paid.licenseKey, pendingEmail.licenseKey);
    assert.equal(paid.emailSent, true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].email, "anna@example.com");
    assert.equal((await notify("1200.000000", validSignature)).status, 200);
    assert.equal(
      (await (await fetch(statusUrl)).json()).licenseKey,
      paid.licenseKey,
    );
    assert.equal(sent.length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});

test("payment API does not accept orders without merchant configuration", async () => {
  const handler = createPaymentHandler({ env: {} });
  const server = createServer((req, res) =>
    handler(req, res, () => res.writeHead(404).end()),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal(
      (await (await fetch(`${base}/api/payment/config`)).json()).available,
      false,
    );
    assert.equal(
      (await fetch(`${base}/api/payment/create`, { method: "POST" })).status,
      503,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
