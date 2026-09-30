import { createPaymentHandler } from "./server/payments.mjs";

export function paymentPlugin() {
  return {
    name: "tyter-payment-api",
    configureServer(server) { server.middlewares.use(createPaymentHandler()); },
    configurePreviewServer(server) { server.middlewares.use(createPaymentHandler()); },
  };
}
