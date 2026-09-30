import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { issueEmailLicense, licenseSigningKey } from "./licenses.mjs";
import { createLicenseMail } from "./license-mail.mjs";

const PRICE = "1200.00";
const ALGORITHMS = new Set(["md5", "sha256", "sha512"]);
const TAXES = new Set([
  "none",
  "vat0",
  "vat5",
  "vat7",
  "vat10",
  "vat20",
  "vat22",
  "vat105",
  "vat107",
  "vat110",
  "vat120",
  "vat122",
]);

const digest = (value, algorithm) =>
  createHash(algorithm).update(value, "utf8").digest("hex");
const safeMatch = (expected, received) => {
  if (
    typeof received !== "string" ||
    !/^[a-f\d]+$/i.test(received) ||
    expected.length !== received.length
  )
    return false;
  return timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(received, "hex"),
  );
};
const send = (res, status, data) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
};
const readBody = async (req) => {
  const parts = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16_384) throw new Error("Слишком большой запрос.");
    parts.push(chunk);
  }
  return Buffer.concat(parts).toString("utf8");
};

export function createPaymentHandler({
  root = process.cwd(),
  env = process.env,
  dataDirectory = path.join(root, "payment-data"),
  mail = createLicenseMail(env),
} = {}) {
  const merchant = env.ROBOKASSA_MERCHANT_LOGIN?.trim();
  const password1 = env.ROBOKASSA_PASSWORD_1;
  const password2 = env.ROBOKASSA_PASSWORD_2;
  const algorithm = env.ROBOKASSA_HASH_ALGORITHM?.toLowerCase();
  const tax = env.ROBOKASSA_TAX?.toLowerCase();
  const publicUrl = env.TYTER_PUBLIC_URL?.replace(/\/$/, "");
  const testMode = env.ROBOKASSA_TEST_MODE === "1";
  const enabled = Boolean(
    merchant &&
    password1 &&
    password2 &&
    ALGORITHMS.has(algorithm) &&
    TAXES.has(tax) &&
    publicUrl &&
    /^https:\/\//.test(publicUrl),
  );
  let queue = Promise.resolve();
  const orderPath = (id) => path.join(dataDirectory, `order-${id}.json`);
  const load = async (id) => {
    if (!/^\d{9}$/.test(id)) return null;
    try {
      return JSON.parse(await readFile(orderPath(id), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  };
  const save = async (order) => {
    const target = orderPath(order.id);
    const temporary = target + `.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(order), {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(temporary, target);
  };
  const ready = async () => {
    if (!enabled || !mail.available) return false;
    try {
      await licenseSigningKey(root, env);
      return true;
    } catch {
      return false;
    }
  };
  return async (req, res, next = () => {}) => {
    const pathname = req.url?.split("?")[0];
    if (!pathname?.startsWith("/api/payment/")) return next();
    if (publicUrl && req.headers.origin === publicUrl) {
      res.setHeader("Access-Control-Allow-Origin", publicUrl);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    }
    if (req.method === "OPTIONS") {
      res
        .writeHead(publicUrl && req.headers.origin === publicUrl ? 204 : 403)
        .end();
      return;
    }
    try {
      if (pathname === "/api/payment/config" && req.method === "GET")
        return send(res, 200, {
          available: await ready(),
          amount: 1200,
          currency: "RUB",
        });

      if (pathname === "/api/payment/create" && req.method === "POST") {
        if (!(await ready()))
          return send(res, 503, { error: "Оплата пока не подключена." });
        const expectedOrigin = publicUrl;
        if (
          req.headers.origin &&
          req.headers.origin !== expectedOrigin &&
          !(testMode && req.headers.origin.startsWith("http://127.0.0.1:"))
        )
          return send(res, 403, { error: "Недопустимый источник." });
        if (!req.headers["content-type"]?.startsWith("application/json"))
          return send(res, 415, { error: "Ожидается JSON." });
        const input = JSON.parse(await readBody(req));
        const name = typeof input.name === "string" ? input.name.trim() : "";
        const email =
          typeof input.email === "string"
            ? input.email.trim().toLowerCase()
            : "";
        if (
          !name ||
          name.length > 100 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          email.length > 254
        )
          return send(res, 400, { error: "Укажите имя и действующий email." });
        await mkdir(dataDirectory, { recursive: true });
        let order;
        for (let attempt = 0; attempt < 10; attempt++) {
          const id = String(randomInt(100_000_000, 999_999_999));
          if (await load(id)) continue;
          const token = randomBytes(32).toString("base64url");
          order = {
            id,
            name,
            email,
            tokenHash: digest(token, "sha256"),
            amount: PRICE,
            createdAt: Date.now(),
            status: "pending",
            testMode,
          };
          try {
            await writeFile(orderPath(id), JSON.stringify(order), {
              encoding: "utf8",
              flag: "wx",
            });
            order.token = token;
            break;
          } catch (error) {
            if (error.code !== "EEXIST") throw error;
          }
        }
        if (!order?.token) throw new Error("Не удалось создать заказ.");
        const receipt = encodeURIComponent(
          JSON.stringify({
            items: [
              {
                name: "Tyter Pro — годовой доступ",
                quantity: 1,
                sum: 1200,
                tax,
                payment_method: "full_payment",
                payment_object: "service",
              },
            ],
          }),
        );
        const signature = digest(
          `${merchant}:${PRICE}:${order.id}:${receipt}:${password1}`,
          algorithm,
        );
        const checkout = new URL(
          "https://auth.robokassa.ru/Merchant/Index.aspx",
        );
        for (const [key, value] of Object.entries({
          MerchantLogin: merchant,
          OutSum: PRICE,
          InvId: order.id,
          Description: "Годовой доступ Tyter Pro",
          SignatureValue: signature,
          Receipt: receipt,
          Email: email,
          Culture: "ru",
          ...(testMode ? { IsTest: "1" } : {}),
        }))
          checkout.searchParams.set(key, value);
        return send(res, 200, {
          orderId: order.id,
          token: order.token,
          checkoutUrl: checkout.toString(),
        });
      }

      if (pathname === "/api/payment/status" && req.method === "GET") {
        const url = new URL(req.url, "http://localhost");
        const order = await load(url.searchParams.get("orderId") || "");
        const token = url.searchParams.get("token") || "";
        if (!order || !safeMatch(order.tokenHash, digest(token, "sha256")))
          return send(res, 404, { error: "Заказ не найден." });
        return send(res, 200, {
          status: order.status,
          orderId: order.id,
          ...(order.status === "paid"
            ? { licenseKey: order.licenseKey, emailSent: !!order.emailSentAt }
            : {}),
        });
      }

      if (pathname === "/api/payment/result" && req.method === "POST") {
        if (
          !enabled ||
          !req.headers["content-type"]?.startsWith(
            "application/x-www-form-urlencoded",
          )
        )
          return send(res, 403, { error: "Недоступно." });
        const form = new URLSearchParams(await readBody(req));
        const amount = form.get("OutSum") || "";
        const id = form.get("InvId") || form.get("InvID") || "";
        const signature = form.get("SignatureValue") || "";
        if (
          !/^1200(?:\.0{1,6})?$/.test(amount) ||
          !/^\d{9}$/.test(id) ||
          !safeMatch(
            digest(`${amount}:${id}:${password2}`, algorithm),
            signature,
          )
        )
          return send(res, 403, {
            error: "Подпись или сумма платежа не совпадает.",
          });
        const completed = queue
          .catch(() => {})
          .then(async () => {
            const order = await load(id);
            if (!order || order.amount !== PRICE || order.testMode !== testMode)
              return false;
            if (order.status !== "paid") {
              order.licenseKey = await issueEmailLicense({
                root,
                env,
                email: order.email,
              });
              order.status = "paid";
              order.paidAt = Date.now();
              await save(order);
            }
            if (!order.emailSentAt) {
              await mail.send(order);
              order.emailSentAt = Date.now();
              await save(order);
            }
            return true;
          });
        queue = completed.catch(() => {});
        if (!(await completed))
          return send(res, 404, { error: "Заказ не найден." });
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end(`OK${id}`);
        return;
      }
      send(res, 404, { error: "Не найдено." });
    } catch (error) {
      send(res, 500, {
        error: "Не удалось обработать платёж. Повторите попытку позже.",
      });
    }
  };
}
