/**
 * メール送信（D22・D34）。送り方はこのインターフェースの裏に隠し、Gmail（SMTP）と Resend などを差し替えられるようにする。
 * ルートは c.get('mailer') で受け取る。テストでは送ったメールを配列にためる mailer を渡す
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** 開発用：実際には送らず、ログに出す（招待やパスワード再設定のリンクを、ログからコピーして開ける） */
export const consoleMailer: Mailer = {
  async send({ to, subject, text }) {
    console.log(`[mail] To: ${to}\n[mail] Subject: ${subject}\n${text}\n[mail] ----`);
  },
};

/** 送信の設定がない本番：送らずにエラーにする（リンクをログに残さない） */
export const unconfiguredMailer: Mailer = {
  async send() {
    throw new Error('メール送信が設定されていません（SMTP_USER・SMTP_PASS）');
  },
};

export interface SmtpOptions {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

/** サークルの Gmail から SMTP（アプリパスワード）で送る（D22） */
export async function createSmtpMailer(options: SmtpOptions): Promise<Mailer> {
  const { createTransport } = await import('nodemailer');
  const transport = createTransport({
    host: options.host,
    port: options.port,
    // 465 は最初から TLS。587 は STARTTLS（暗号化に切り替えられなければ送らない）
    secure: options.port === 465,
    requireTLS: options.port !== 465,
    auth: { user: options.user, pass: options.pass },
  });
  return {
    async send({ to, subject, text }) {
      await transport.sendMail({ from: options.from, to, subject, text });
    },
  };
}

/** 環境変数から送り方を決める（src/index.ts から呼ぶ） */
export async function mailerFromEnv(env: NodeJS.ProcessEnv, isProduction: boolean): Promise<Mailer> {
  const { SMTP_USER: user, SMTP_PASS: pass } = env;
  if (user && pass) {
    return createSmtpMailer({
      host: env.SMTP_HOST ?? 'smtp.gmail.com',
      port: Number(env.SMTP_PORT ?? 465),
      user,
      pass,
      from: env.MAIL_FROM ?? `やもんサイト <${user}>`,
    });
  }
  if (isProduction) {
    console.warn('SMTP_USER・SMTP_PASS がないため、メールを送れません（招待・パスワード再設定は失敗します）');
    return unconfiguredMailer;
  }
  return consoleMailer;
}

/** 送ったメールをためるだけの mailer（テスト用） */
export function createMemoryMailer() {
  const sent: MailMessage[] = [];
  const mailer: Mailer = {
    async send(message) {
      sent.push(message);
    },
  };
  return { mailer, sent };
}
