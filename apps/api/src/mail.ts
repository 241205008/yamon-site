/**
 * メール送信（D22・D36・D46）。送り方はこのインターフェースの裏に隠し、Gmail（SMTP）と Resend などを差し替えられるようにする。
 * ルートは c.get('mailer') で受け取る。設定（SMTP）がなければ undefined で、招待・再設定のリンクは管理者画面にだけ出す。
 * テストでは送ったメールを配列にためる mailer を渡す
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/**
 * 送れるならメールを送り、送れたかを返す。送り方がない・送れなかったときは false。
 * リンクは管理者画面に出ているので、送れなくても操作は失敗にしない。失敗はログにだけ出す
 */
export async function trySend(mailer: Mailer | undefined, message: MailMessage): Promise<boolean> {
  if (!mailer) return false;
  try {
    await mailer.send(message);
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

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

/** 環境変数から送り方を決める（src/index.ts から呼ぶ）。SMTP の設定がなければ送らない（undefined） */
export async function mailerFromEnv(env: NodeJS.ProcessEnv): Promise<Mailer | undefined> {
  const { SMTP_USER: user, SMTP_PASS: pass } = env;
  if (user && pass) {
    const port = Number(env.SMTP_PORT ?? 465);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      throw new Error(`SMTP_PORT が正しいポート番号ではありません：${env.SMTP_PORT}`);
    }
    return createSmtpMailer({
      host: env.SMTP_HOST ?? 'smtp.gmail.com',
      port,
      user,
      pass,
      from: env.MAIL_FROM ?? `やもんサイト <${user}>`,
    });
  }
  console.log('SMTP_USER・SMTP_PASS がないため、メールは送りません（招待・パスワード再設定のリンクは管理者画面に出ます）');
  return undefined;
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
