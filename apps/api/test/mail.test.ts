import { once } from 'node:events';
import net from 'node:net';
import type { SendMailOptions, SentMessageInfo, TransportOptions } from 'nodemailer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryMailer, createSmtpMailer, mailerFromEnv, trySend, type SmtpOptions } from '../src/mail';

/**
 * nodemailer を本物のまま使い、createTransport に渡した設定を記録する。
 * useStream のときだけ、SMTP の代わりにメッセージを組み立てて返す streamTransport に差し替え、送った内容を確かめる
 */
const state = vi.hoisted(() => ({
  useStream: false,
  options: [] as unknown[],
  sent: [] as { mail: SendMailOptions; info: SentMessageInfo }[],
}));
vi.mock('nodemailer', async (importOriginal) => {
  const real = await importOriginal<typeof import('nodemailer')>();
  return {
    ...real,
    createTransport: (options: TransportOptions) => {
      state.options.push(options);
      if (!state.useStream) return real.createTransport(options);
      const transport = real.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
      return {
        async sendMail(mail: SendMailOptions) {
          const info = await transport.sendMail(mail);
          state.sent.push({ mail, info });
          return info;
        },
      };
    },
  };
});

afterEach(() => {
  state.useStream = false;
  state.options.length = 0;
  state.sent.length = 0;
  vi.restoreAllMocks();
});

const smtp: SmtpOptions = {
  host: '127.0.0.1',
  port: 465,
  user: 'circle@example.com',
  pass: 'app-password',
  from: 'やもんサイト <circle@example.com>',
};

/** STARTTLS を出さない SMTP サーバー（受け取ったコマンドを記録する） */
async function startPlainSmtpServer() {
  const commands: string[] = [];
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
    socket.write('220 fake ESMTP\r\n');
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      for (let i = buffer.indexOf('\r\n'); i >= 0; i = buffer.indexOf('\r\n')) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        commands.push(line);
        const verb = line.split(' ')[0]?.toUpperCase();
        if (verb === 'EHLO' || verb === 'HELO') socket.write('250-fake\r\n250 AUTH PLAIN LOGIN\r\n');
        else if (verb === 'QUIT') socket.end('221 bye\r\n');
        else socket.write('502 not implemented\r\n');
      }
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as net.AddressInfo;
  return {
    port,
    commands,
    async close() {
      for (const socket of sockets) socket.destroy();
      server.close();
      await once(server, 'close');
    },
  };
}

describe('createSmtpMailer', () => {
  it('465 番は最初から TLS、それ以外は STARTTLS を必須にして、認証の情報を渡す', async () => {
    await createSmtpMailer(smtp);
    await createSmtpMailer({ ...smtp, port: 587 });
    expect(state.options).toEqual([
      expect.objectContaining({
        host: '127.0.0.1',
        port: 465,
        secure: true,
        requireTLS: false,
        auth: { user: 'circle@example.com', pass: 'app-password' },
      }),
      expect.objectContaining({ port: 587, secure: false, requireTLS: true }),
    ]);
  });

  it('差出人・宛先・件名・本文を組み立てて送る（日本語の表示名も壊さない）', async () => {
    state.useStream = true;
    const mailer = await createSmtpMailer(smtp);
    await mailer.send({ to: 'member@example.com', subject: '招待のお知らせ', text: '下のリンクから登録してください。' });

    expect(state.sent).toHaveLength(1);
    const { mail, info } = state.sent[0]!;
    expect(mail).toEqual({
      from: 'やもんサイト <circle@example.com>',
      to: 'member@example.com',
      subject: '招待のお知らせ',
      text: '下のリンクから登録してください。',
    });
    expect(info.envelope).toEqual({ from: 'circle@example.com', to: ['member@example.com'] });
    const raw = (info.message as Buffer).toString('utf8');
    expect(raw).toMatch(/^From: =\?UTF-8\?.+\?= <circle@example\.com>$/m);
    expect(raw).toMatch(/^To: member@example\.com$/m);
    expect(raw).toMatch(/^Subject: =\?UTF-8\?.+\?=$/m);
  });

  it('宛先の表示名にまぎれたアドレスには送らない（GHSA-8c8m-p3m8-cjg8 など、addressparser の修正）', async () => {
    state.useStream = true;
    const mailer = await createSmtpMailer(smtp);
    await mailer.send({ to: '"a;evil@example.net" <member@example.com>', subject: 's', text: 't' });
    await mailer.send({ to: 'member@example.com (x (y) evil@example.net)', subject: 's', text: 't' });
    expect(state.sent.map(({ info }) => info.envelope.to)).toEqual([['member@example.com'], ['member@example.com']]);
  });

  it('STARTTLS できないサーバーには、認証の情報も宛先も送らずに失敗する', async () => {
    const server = await startPlainSmtpServer();
    try {
      const mailer = await createSmtpMailer({ ...smtp, port: server.port });
      await expect(mailer.send({ to: 'member@example.com', subject: 's', text: 't' })).rejects.toThrow();
      expect(server.commands.some((c) => /^EHLO /i.test(c))).toBe(true);
      expect(server.commands.some((c) => /^(AUTH|MAIL|RCPT|DATA)\b/i.test(c))).toBe(false);
    } finally {
      await server.close();
    }
  });
});

describe('mailerFromEnv', () => {
  it('SMTP_USER・SMTP_PASS がなければ送らない（undefined）', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(mailerFromEnv({})).resolves.toBeUndefined();
    await expect(mailerFromEnv({ SMTP_USER: 'circle@example.com' })).resolves.toBeUndefined();
    expect(state.options).toHaveLength(0);
  });

  it('設定があれば、既定は Gmail の 465 番で、差出人はサークルのアドレス', async () => {
    const mailer = await mailerFromEnv({ SMTP_USER: 'circle@example.com', SMTP_PASS: 'app-password' });
    expect(mailer).toBeDefined();
    expect(state.options).toEqual([expect.objectContaining({ host: 'smtp.gmail.com', port: 465, secure: true })]);

    state.useStream = true;
    const streamed = await mailerFromEnv({ SMTP_USER: 'circle@example.com', SMTP_PASS: 'app-password' });
    await streamed!.send({ to: 'member@example.com', subject: 's', text: 't' });
    expect(state.sent[0]!.mail.from).toBe('やもんサイト <circle@example.com>');
  });

  it('SMTP_PORT が正しくなければ起動時にエラーにする', async () => {
    await expect(mailerFromEnv({ SMTP_USER: 'u', SMTP_PASS: 'p', SMTP_PORT: 'abc' })).rejects.toThrow('SMTP_PORT');
    await expect(mailerFromEnv({ SMTP_USER: 'u', SMTP_PASS: 'p', SMTP_PORT: '70000' })).rejects.toThrow('SMTP_PORT');
  });
});

describe('trySend', () => {
  it('送れたら true、送り方がない・送れなかったら false（失敗はログに出す）', async () => {
    const { mailer, sent } = createMemoryMailer();
    const message = { to: 'member@example.com', subject: 's', text: 't' };
    await expect(trySend(mailer, message)).resolves.toBe(true);
    expect(sent).toEqual([message]);
    await expect(trySend(undefined, message)).resolves.toBe(false);

    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = { send: () => Promise.reject(new Error('down')) };
    await expect(trySend(failing, message)).resolves.toBe(false);
    expect(error).toHaveBeenCalled();
  });
});
