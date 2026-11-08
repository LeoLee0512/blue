/**
 * 发信（验证邮件、找回密码邮件）。2026-10-30 Sam 新增。
 * 通过环境变量配置 SMTP：SMTP_HOST、SMTP_PORT、SMTP_USER、SMTP_PASS、MAIL_FROM。
 * 例：QQ 邮箱 SMTP_HOST=smtp.qq.com SMTP_PORT=465，SMTP_PASS 填邮箱「授权码」。
 * 生产环境未配置 SMTP 时直接报错，避免用户收不到邮件却不知道；开发环境只打印到控制台。
 */
import nodemailer from "nodemailer";

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT ?? 465);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const from = process.env.MAIL_FROM ?? user;
const isProduction = process.env.NODE_ENV === "production";

const transport =
  host && user && pass
    ? nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } })
    : null;

export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  if (!transport) {
    if (isProduction) throw new Error("邮件服务未配置（缺少 SMTP_HOST / SMTP_USER / SMTP_PASS）");
    console.info(`[mailer:dev] to=${to} subject=${subject}\n${text}`);
    return;
  }
  await transport.sendMail({ from, to, subject, text });
}
