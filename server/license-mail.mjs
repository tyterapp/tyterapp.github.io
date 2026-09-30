import nodemailer from "nodemailer";

export function createLicenseMail(env = process.env) {
  const available = !!(
    env.SMTP_HOST &&
    env.SMTP_USER &&
    env.SMTP_PASSWORD &&
    env.SMTP_FROM
  );
  const transport = available
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT || 465),
        secure: env.SMTP_SECURE !== "false",
        requireTLS: env.SMTP_SECURE === "false",
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
        connectionTimeout: 10000,
        socketTimeout: 20000,
      })
    : null;
  return {
    available,
    async send(order) {
      if (!transport) throw new Error("Почта не настроена.");
      const download =
        env.TYTER_PRO_DOWNLOAD_URL ||
        `${env.TYTER_PUBLIC_URL?.replace(/\/$/, "")}/downloads/Tyter-Pro-Setup-1.0.0.exe`;
      if (!download.startsWith("https://"))
        throw new Error("Укажите HTTPS-ссылку на установщик Pro.");
      const result = await transport.sendMail({
        from: env.SMTP_FROM,
        to: order.email,
        subject: "Ваш Tyter Pro — установщик и ключ активации",
        messageId: `<tyter-license-${order.id}@${new URL(download).hostname}>`,
        text: `Здравствуйте${order.name ? `, ${order.name}` : ""}!\n\nВаш ключ Tyter Pro готов.\n\nСкачать полную версию для Windows:\n${download}\n\nКлюч активации:\n${order.licenseKey}\n\nУстановите Tyter Pro, вставьте ключ в окно активации и нажмите «Активировать». Лицензия действует один год с момента покупки. Сохраните это письмо.\n\nTyter`,
      });
      if (!result.accepted?.length)
        throw new Error("Почтовый сервер не принял письмо.");
    },
  };
}
