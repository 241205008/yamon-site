// 使い方ガイド（#79、D53）のスクリーンショットを撮り直す。
// 開発サーバー（npm run dev）とデモデータ（npm run db:seed -w @yamon/api）で撮る。手順は同じフォルダの README.md
//
//   node scripts/guide-screenshots/capture.mjs            すべて撮る
//   node scripts/guide-screenshots/capture.mjs map home   名前に一致するものだけ撮る
//
// 本番の実データや個人情報を写さないため、localhost 以外の URL では動かない。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT_DIR = fileURLToPath(new URL('../../apps/web/public/guide-images/', import.meta.url));
const QUALITY = 75;
/** 画像の幅と高さ。画面が img の場所を先に取れるよう（読み込みでずれないよう）GuidePage が使う */
const SIZES_FILE = fileURLToPath(new URL('../../apps/web/src/guide/imageSizes.json', import.meta.url));

const host = new URL(BASE_URL).hostname;
if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) {
  console.error(`BASE_URL は開発サーバー（localhost）にしてください：${BASE_URL}`);
  process.exit(1);
}

/** README の「開発用のアカウント」（apps/api/src/seed.ts） */
const ACCOUNTS = {
  admin: 'admin@example.com',
  officer: 'officer@example.com',
  member: 'member@example.com',
  viewer: 'obog@example.com',
};
const PASSWORD = 'password123';
/** 撮るあいだ「位置を保護する」印を付けるデモの生き物（seed.ts。幹部が記録している） */
const PROTECTED_DEMO_CREATURE = 'ホタル';

/** phone：スマホ幅（iPhone 程度）。pc：パソコン幅。どちらも CSS の1ピクセルを画像の1ピクセルで撮る */
const DEVICES = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  pc: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
};

/** 撮る画面。target を返すとその要素だけ、返さなければ画面（viewport）全体を撮る */
const SHOTS = [
  // はじめに（ログイン前）
  {
    file: 'login.webp', role: null, device: 'phone',
    async run(page) {
      await page.goto('/login');
      await page.getByRole('button', { name: 'ログイン', exact: true }).waitFor();
    },
  },
  {
    file: 'register.webp', role: null, device: 'phone',
    async run(page, { api }) {
      // そのアドレスで登録済みなら（招待のリンクから登録して試したなど）、別のアドレスで招待する
      const invite = (email) => api('admin', 'POST', '/api/admin/invitations', { email, role: 'member' });
      const { url } = await invite('new-member@example.com').catch(() => invite(`new-member-${Date.now()}@example.com`));
      await page.goto(pathOf(url));
      await page.getByLabel('ユーザー名').waitFor();
    },
  },
  {
    file: 'reset-password.webp', role: null, device: 'phone',
    async run(page, { api }) {
      const { users } = await api('admin', 'GET', '/api/admin/users');
      const member = users.find((u) => u.email === ACCOUNTS.member);
      const { url } = await api('admin', 'POST', `/api/admin/users/${member.id}/password-reset`);
      await page.goto(pathOf(url));
      await page.getByText('新しいパスワード（確認）').waitFor();
    },
  },

  {
    file: 'account.webp', role: 'viewer', device: 'phone',
    async run(page) {
      await page.goto('/account');
      await page.getByRole('heading', { name: 'メールアドレスを変える' }).waitFor();
    },
  },

  // 部員・OB・OG 向け
  {
    file: 'home.webp', role: 'member', device: 'phone',
    async run(page) {
      await page.goto('/');
      await page.getByRole('heading', { name: '観察記録を追加' }).waitFor();
    },
  },
  {
    file: 'record-form.webp', role: 'member', device: 'phone',
    async run(page) {
      await page.goto('/');
      return card(page.getByRole('heading', { name: '観察記録を追加' }));
    },
  },
  {
    file: 'recent-records.webp', role: 'member', device: 'phone', maxHeight: 900,
    async run(page) {
      await page.goto('/');
      const heading = page.getByRole('heading', { name: '最近の記録' });
      await page.getByText('あなたの記録').first().waitFor();
      return card(heading);
    },
  },
  {
    file: 'event-form.webp', role: 'member', device: 'phone',
    async run(page) {
      await page.goto('/');
      await page.getByRole('button', { name: '新しい観察会を作成' }).click();
      return card(page.getByRole('heading', { name: '新しい観察会を作成' }));
    },
  },
  {
    file: 'event-list.webp', role: 'member', device: 'phone',
    async run(page) {
      await page.goto('/event-list');
      await page.getByRole('heading', { name: '開催された観察会' }).waitFor();
    },
  },
  {
    file: 'event-detail.webp', role: 'member', device: 'phone',
    async run(page) {
      await page.goto('/event-list');
      await page.locator('a[href^="/event-detail/"]').first().click();
      await page.getByRole('heading', { name: '観察記録一覧' }).waitFor();
    },
  },
  {
    // 専用ページ（#97）なので、上部の「ホーム画面に戻る」ごと画面全体を撮る
    file: 'creatures.webp', role: 'member', device: 'phone',
    async run(page) {
      await page.goto('/creatures');
      await page.getByText(/記録 \d+件/).first().waitFor();
    },
  },
  {
    file: 'map.webp', role: 'member', device: 'phone',
    async run(page) {
      await openMap(page);
    },
  },
  {
    file: 'locations.webp', role: 'member', device: 'phone',
    async run(page) {
      await page.goto('/locations');
      await page.locator('button[aria-pressed]').first().click();
      // 選んだ場所の生き物の一覧が出るまで待つ
      await page.getByText('場所を選択すると、そこで見られる生き物の一覧が表示されます').waitFor({ state: 'detached' });
      await page.waitForLoadState('networkidle');
    },
  },
  {
    file: 'protected-record.webp', role: 'member', device: 'phone',
    async run(page) {
      // 幹部が付けたホタルの記録（部員には場所が非公開）。ホームの最近の記録に出る
      await page.goto('/');
      return page.getByText('保護対象のため場所は非公開').locator('xpath=ancestor::article[1]');
    },
  },
  {
    file: 'viewer-home.webp', role: 'viewer', device: 'phone',
    async run(page) {
      await page.goto('/');
      await page.getByRole('heading', { name: '最近の記録' }).waitFor();
    },
  },

  // 幹部向け
  {
    file: 'creature-protect.webp', role: 'officer', device: 'phone',
    async run(page) {
      await page.goto('/creatures');
      await page.getByRole('button', { name: /を編集$/ }).first().click();
      await page.getByRole('button', { name: /名前・カテゴリを編集/ }).click();
      return page.getByRole('dialog');
    },
  },
  {
    file: 'officer-map.webp', role: 'officer', device: 'phone',
    async run(page) {
      await openMap(page);
    },
  },

  // 管理者向け（管理者画面はパソコンで使う想定なので、パソコン幅で撮る）
  {
    file: 'admin-invite.webp', role: 'admin', device: 'pc',
    async run(page) {
      await page.goto('/admin');
      await page.getByText('招待履歴').waitFor();
      await page.getByRole('button', { name: '招待する', exact: true }).click();
      await page.locator('#inv-email').fill('new-officer@example.com');
      return card(page.getByRole('heading', { name: '新規ユーザー招待' }));
    },
  },
  {
    file: 'admin-issued-link.webp', role: 'admin', device: 'pc',
    async run(page) {
      await page.goto('/admin');
      await page.getByRole('button', { name: '招待する', exact: true }).click();
      await page.locator('#inv-email').fill('new-officer@example.com');
      await page.getByRole('button', { name: '招待リンクを作る' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByText('招待リンクができました').waitFor();
      return dialog;
    },
  },
  {
    file: 'admin-users.webp', role: 'admin', device: 'pc',
    async run(page) {
      await page.goto('/admin');
      return card(page.getByRole('heading', { name: '登録済みユーザー' }));
    },
  },
  {
    file: 'admin-history.webp', role: 'admin', device: 'pc', maxHeight: 600,
    async run(page, { api }) {
      // 履歴が空だと説明にならないので、部員の役割を幹部にして戻す（デモデータは元のまま）
      const { users } = await api('admin', 'GET', '/api/admin/users');
      const member = users.find((u) => u.email === ACCOUNTS.member);
      await api('admin', 'PATCH', `/api/admin/users/${member.id}/role`, { role: 'officer' });
      await api('admin', 'PATCH', `/api/admin/users/${member.id}/role`, { role: 'member' });
      await page.goto('/admin');
      return card(page.getByRole('heading', { name: '操作履歴' }));
    },
  },
  {
    file: 'admin-locations.webp', role: 'admin', device: 'pc',
    async run(page) {
      await page.goto('/admin');
      return card(page.getByRole('heading', { name: '主な場所' }));
    },
  },
  {
    file: 'admin-map-data.webp', role: 'admin', device: 'pc',
    async run(page) {
      await page.goto('/admin');
      const heading = page.getByRole('heading', { name: '地図データ' });
      await page.getByText('今のデータ').waitFor();
      return card(heading);
    },
  },
];

/** 見出しを含む白いカード（rounded-xl） */
function card(heading) {
  return heading.locator('xpath=ancestor::*[contains(concat(" ", @class, " "), " rounded-xl ")][1]');
}

/** API が返す絶対 URL から、開発サーバーでのパスを取り出す */
function pathOf(url) {
  const u = new URL(url);
  return u.pathname + u.search;
}

/** マップを開き、航空写真に切り替える（地図データ .pmtiles がなくても背景が出るように） */
async function openMap(page) {
  await page.goto('/map');
  const toPhoto = page.getByRole('button', { name: '航空写真' });
  await toPhoto.click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
}

async function capture(page, file, target, maxHeight) {
  const cdp = await page.context().newCDPSession(page);
  let clip;
  if (target) {
    await target.first().scrollIntoViewIfNeeded();
    clip = await target.first().evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
    });
    // 周りに少し余白を付ける
    const pad = 8;
    clip = { x: Math.max(0, clip.x - pad), y: Math.max(0, clip.y - pad), width: clip.width + pad * 2, height: clip.height + pad * 2 };
    if (maxHeight) clip.height = Math.min(clip.height, maxHeight);
  }
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'webp',
    quality: QUALITY,
    ...(clip ? { clip: { ...clip, scale: 1 }, captureBeyondViewport: true } : {}),
  });
  writeFileSync(OUT_DIR + file, Buffer.from(data, 'base64'));
  await cdp.detach();
  const size = clip ?? page.viewportSize();
  return { width: Math.round(size.width), height: Math.round(size.height) };
}

async function main() {
  const only = process.argv.slice(2);
  const shots = only.length ? SHOTS.filter((s) => only.some((o) => s.file.includes(o))) : SHOTS;
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await launch();
  const contexts = new Map();

  /** 役割ごとにログインしたコンテキスト（Cookie を分ける）。null はログインしていない状態 */
  async function contextFor(role, device) {
    const key = `${role}:${device}`;
    if (!contexts.has(key)) {
      const ctx = await browser.newContext({ ...DEVICES[device], baseURL: BASE_URL, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
      if (role) {
        const res = await ctx.request.post('/api/auth/login', { data: { email: ACCOUNTS[role], password: PASSWORD } });
        if (!res.ok()) throw new Error(`${role} でログインできません（${res.status()}）。npm run db:seed -w @yamon/api を実行しましたか？`);
      }
      contexts.set(key, ctx);
    }
    return contexts.get(key);
  }

  /** ログインした役割で API を呼ぶ */
  async function api(role, method, path, data) {
    const ctx = await contextFor(role, 'pc');
    // 本文のない POST も JSON で送る（API は JSON 以外を 415 で断る）
    const res = await ctx.request.fetch(path, { method, data: data ?? (method === 'GET' ? undefined : {}) });
    if (!res.ok()) throw new Error(`${method} ${path} が失敗しました（${res.status()}）：${await res.text()}`);
    return res.json();
  }

  // 保護対象の生き物の見え方を写すため、撮っている間だけデモの「ホタル」に「位置を保護する」印を付ける（終わったら戻す）
  const { creatures } = await api('officer', 'GET', '/api/creatures');
  const hotaru = creatures.find((c) => c.name === PROTECTED_DEMO_CREATURE);
  const setProtected = (value) =>
    hotaru &&
    api('officer', 'PUT', `/api/creatures/${hotaru.id}`, {
      name: hotaru.name,
      category: hotaru.category,
      memo: hotaru.memo ?? '',
      locationProtected: value,
    });
  const sizes = existsSync(SIZES_FILE) ? JSON.parse(readFileSync(SIZES_FILE, 'utf8')) : {};

  try {
    await setProtected(true);
    for (const shot of shots) {
      const ctx = await contextFor(shot.role, shot.device);
      const page = await ctx.newPage();
      try {
        const target = await shot.run(page, { api });
        if (target) await target.first().waitFor();
        // フォントや画像の読み込み、アニメーションを待つ
        await page.waitForTimeout(300);
        sizes[shot.file] = await capture(page, shot.file, target, shot.maxHeight);
        console.log(`撮りました：${shot.file}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await setProtected(hotaru?.locationProtected ?? false);
    await browser.close();
    const sorted = Object.fromEntries(Object.entries(sizes).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(SIZES_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
  }
}

/** 入っている Chrome か Edge を使う（Playwright のブラウザのダウンロードは要らない） */
async function launch() {
  const channels = process.env.BROWSER_CHANNEL ? [process.env.BROWSER_CHANNEL] : ['chrome', 'msedge'];
  for (const channel of channels) {
    try {
      return await chromium.launch({ channel });
    } catch {
      // 次を試す
    }
  }
  throw new Error('Chrome か Edge が見つかりません。BROWSER_CHANNEL で指定してください');
}

await main();
