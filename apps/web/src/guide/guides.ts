import type { Permission, Role } from '@yamon/shared';

/**
 * 使い方ガイドの中身（#79、D53）。
 *
 * - ガイドは3つ（管理者・幹部・部員と OB・OG）。誰でも3つとも読める。最初に出すのは、ログインしている人の役割のガイド
 * - 作りは、LINE・PayPay・メルカリ・d払いなどの使い方ガイドを参考にした（D53）：
 *   役割を選ぶ → 「はじめての方へ」の3ステップ → 「〇〇する」の見出しごとに、前提・番号付きの手順・スクリーンショット・
 *   ポイントと注意・関連する項目 → よくある質問
 * - できることは docs/MVP.md 2章の権限の表（packages/shared/src/permissions.ts）と一致させる。権限を変えたらここも直す
 * - ボタンや画面の名前は「」で書く（画面の文言と同じにする）
 * - 画像は apps/web/public/guide-images/ に置く。撮り直しは scripts/guide-screenshots/README.md
 */

export const GUIDE_IDS = ['member', 'officer', 'admin'] as const;
export type GuideId = (typeof GUIDE_IDS)[number];

export type GuideImage = {
  /** apps/web/public/guide-images/ の中のファイル名（.webp） */
  file: string;
  /** 画面の何が写っているか（読み上げや、画像が出ないときのため） */
  alt: string;
  /** phone はスマホ幅で撮った縦長の画像、pc はパソコン幅で撮った横長の画像 */
  device: 'phone' | 'pc';
};

/** ほかのセクションへのリンク。guide を省くと同じガイド（または「はじめに」）の中 */
export type GuideRef = { id: string; guide?: GuideId };

export type GuideNote = { kind: 'point' | 'caution'; text: string };

export type GuideSection = {
  /** ページ内リンク（#id）に使う */
  id: string;
  /** 「〇〇する」の形で、1つのセクションに1つの目的 */
  title: string;
  /**
   * このセクションで説明する操作に要る権限。テストで、ガイドの役割がその権限を持つか
   * （幹部・管理者向けは、一つ下の役割が持たないか）を確かめる
   */
  permission?: Permission;
  /** 何ができるか（1〜2文） */
  lead: string;
  /** 前提（要る役割、どの画面から始めるか） */
  requires?: string;
  /** 番号付きの手順（1つに1つの操作） */
  steps?: string[];
  /** 手順の後に並べる補足（箇条書き） */
  details?: string[];
  image?: GuideImage;
  notes?: GuideNote[];
  related?: GuideRef[];
};

export type GuideFaq = { q: string; a: string; related?: GuideRef };

export type Guide = {
  id: GuideId;
  /** 役割を選ぶカードに出す名前 */
  label: string;
  /** 役割を選ぶカードの1行の説明 */
  summary: string;
  /** どの役割の人向けか */
  roles: Role[];
  lead: string;
  /** 「はじめての方へ」の3ステップ */
  quickStart: { label: string; ref: GuideRef }[];
  sections: GuideSection[];
  faq: GuideFaq[];
};

/** その役割の人に最初に出すガイド。ログインしていなければ部員・OB・OG 向け */
export function guideIdFor(role: Role | null | undefined): GuideId {
  if (role === 'admin') return 'admin';
  if (role === 'officer') return 'officer';
  return 'member';
}

export function isGuideId(value: string | null | undefined): value is GuideId {
  return (GUIDE_IDS as readonly (string | null | undefined)[]).includes(value);
}

/** 3つのガイドに共通の「はじめに」：ログイン前の画面（ログイン・招待からの登録・パスワード再設定）と、ログイン用のメールアドレスの変更 */
export const GETTING_STARTED: GuideSection[] = [
  {
    id: 'register',
    title: '招待リンクから登録する',
    lead: 'やもんサイトは招待制です。管理者（代表・副代表）から届いた招待リンクで、自分のアカウントを作ります。',
    requires: '管理者から LINE などで届いた招待リンク',
    steps: [
      '届いた招待リンクを開きます。',
      '表示されたメールアドレスと役割が、自分のものか確かめます（招待のときに決まっていて、変えられません）。',
      '「ユーザー名」と「パスワード」を入れ、確認のためにパスワードをもう一度入れます。',
      '「登録してはじめる」を押します。そのままログインした状態になります。',
    ],
    image: { file: 'register.webp', alt: '招待リンクを開いたときの新規登録の画面。メールアドレス、ユーザー名、パスワードの入力欄と「登録してはじめる」のボタン', device: 'phone' },
    notes: [
      { kind: 'caution', text: '招待リンクは48時間有効で、1回だけ使えます。期限が切れたら、管理者に作り直してもらってください。' },
      { kind: 'point', text: '登録の画面に、個人情報（メールアドレス・観察記録）の扱いが書いてあります。登録の前に確かめてください。' },
    ],
    related: [{ id: 'login' }],
  },
  {
    id: 'login',
    title: 'ログインする',
    lead: '2回目からは、メールアドレスとパスワードでログインします。',
    steps: [
      'やもんサイトを開きます（ログインしていなければ、ログインの画面になります）。',
      '登録したメールアドレスとパスワードを入れます。',
      '「ログイン」を押します。ホームが開きます。',
    ],
    image: { file: 'login.webp', alt: 'ログインの画面。メールアドレスとパスワードの入力欄と「ログイン」のボタン', device: 'phone' },
    notes: [
      { kind: 'point', text: 'ログインしたままでいられるのは最大8時間です。過ぎたら、もう一度ログインしてください。' },
      { kind: 'caution', text: '別の人の端末を借りたときは、使い終わったらホームの上の「ログアウト」を押してください。' },
    ],
    related: [{ id: 'password-reset' }],
  },
  {
    id: 'password-reset',
    title: 'パスワードを再設定する',
    lead: 'パスワードを忘れたときは、管理者から届く再設定のリンクで、新しいパスワードを決めます。',
    requires: '管理者に「パスワードを忘れた」と伝えて、再設定のリンクをもらう',
    steps: [
      '届いた再設定のリンクを開きます。',
      '新しいパスワードを入れ、確認のためにもう一度入れます。',
      '「パスワードを変更する」を押します。',
      'ログインの画面で、新しいパスワードでログインします。',
    ],
    image: { file: 'reset-password.webp', alt: '新しいパスワードを設定する画面。新しいパスワードを2回入れる欄と「パスワードを変更する」のボタン', device: 'phone' },
    notes: [
      { kind: 'caution', text: '再設定のリンクは1時間有効で、1回だけ使えます。' },
      { kind: 'point', text: 'サイトにメールの設定がある場合は、ログインの画面の「パスワードを忘れた方はこちら」から、自分でメールを申請することもできます。' },
    ],
    related: [{ id: 'login' }],
  },
  {
    id: 'change-email',
    title: 'ログイン用のメールアドレスを変える',
    lead: '卒業などで今のメールアドレス（大学のアドレスなど）が使えなくなるときは、個人のアドレスなどに変えます。記録・役割・パスワードはそのままです。',
    requires: 'ログインしていること。ホームの上の「アカウント」から始めます',
    steps: [
      'ホームの上の「アカウント」を押します。',
      '「新しいメールアドレス」と、確認のためにもう一度同じアドレスを入れます。',
      '「今のパスワード」を入れます。',
      '「メールアドレスを変更する」を押します。次からは、新しいアドレスと今までのパスワードでログインします。',
    ],
    image: { file: 'account.webp', alt: 'アカウントの画面。今のメールアドレスと、新しいメールアドレスを2回・今のパスワードを入れる欄と「メールアドレスを変更する」のボタン', device: 'phone' },
    notes: [
      { kind: 'caution', text: 'アドレスはログインに使うだけなので、確認のメールで確かめることはしません。打ち間違えると、そのアドレスでしかログインできなくなります。変えた後に「アカウント」で表示を確かめてください。' },
      { kind: 'point', text: 'メールアドレスを変えられるのは本人だけです（管理者も、ほかの人のアドレスは変えられません）。パスワードを忘れたときは、先に管理者に再設定のリンクをもらってください。' },
      { kind: 'point', text: 'ほかのメンバーが使っているアドレスにはできません。' },
    ],
    related: [{ id: 'login' }, { id: 'password-reset' }],
  },
];

/** 部員・OB・OG 向け（幹部・管理者も同じ操作ができる） */
const MEMBER_SECTIONS: GuideSection[] = [
  {
    id: 'home',
    title: 'ホームから各画面を開く',
    lead: 'ログインすると最初に開く画面です。上のボタンから、ほかの画面へ移ります。下のほうには最近の記録が10件並びます。',
    details: [
      '「観察会一覧」：これまでの観察会と、その記録',
      '「生き物管理」：登録されている生き物の一覧（ホームの中に開きます）',
      '「場所別の生き物」：主な場所ごとに、見られた生き物',
      '「マップを見る」：記録を地図のピンで見る',
      '「アカウント」：ログイン用のメールアドレスを変える',
      '「使い方」：このガイド',
    ],
    image: { file: 'home.webp', alt: 'ホームの画面。上にヘッダーのボタン、下に「新しい観察会を作成」のボタンと記録の追加フォーム', device: 'phone' },
    related: [{ id: 'add-record' }, { id: 'map' }],
  },
  {
    id: 'add-record',
    title: '観察記録を付ける（部員以上）',
    permission: 'records.create',
    lead: '見つけた生き物を、日時と場所といっしょに記録します。',
    requires: '役割が部員・幹部・管理者（OB・OG は記録を付けられません）。ホームの「観察記録を追加」から始めます',
    steps: [
      '「生き物の種類」で名前を検索して選びます。一覧にないときは「新しい生き物を登録」から、名前・カテゴリ・メモを入れてその場で登録できます。',
      '「場所の種類」を選びます。「主な場所」から選ぶ／「その他の場所」に名前を入れる／「場所を指定しない」のどれかです。',
      '座標を付けるときは、「マップで位置を選択」で地図を押すか、「現在位置を取得」でスマホの GPS を使います（付けなくても記録できます）。',
      '観察した日時と、メモ（任意）を入れます。',
      '「記録を追加」を押します。ホームの「最近の記録」に出ます。',
    ],
    image: { file: 'record-form.webp', alt: '観察記録を追加するフォーム。生き物の検索、場所の種類、日時、メモの欄', device: 'phone' },
    notes: [
      { kind: 'point', text: '観察会の中の記録は、観察会の詳細の画面から付けます。' },
      { kind: 'caution', text: '保護対象（🔒）の生き物を記録するときは、メモに場所が分かることを書かないでください。' },
    ],
    related: [{ id: 'event-detail' }, { id: 'protected' }, { id: 'edit-record' }],
  },
  {
    id: 'edit-record',
    title: '自分の記録を直す・消す（部員以上）',
    permission: 'records.editOwn',
    lead: '自分が付けた記録は、あとから直したり消したりできます。',
    requires: '役割が部員・幹部・管理者。直せるのは自分が付けた記録だけです',
    steps: [
      'ホームの「最近の記録」（観察会の記録は観察会の詳細）で、「あなたの記録」と付いた記録を探します。',
      '鉛筆のボタンを押すと、上のフォームに内容が入ります。',
      '直して「記録を更新」を押します。',
      '消すときは、ごみ箱のボタンを押し、確認で「OK」を押します。',
    ],
    image: { file: 'recent-records.webp', alt: '最近の記録の一覧。自分の記録に「あなたの記録」の表示と、鉛筆とごみ箱のボタンがある', device: 'phone' },
    notes: [
      { kind: 'caution', text: '消した記録は元に戻せません（ゴミ箱はありません）。' },
      { kind: 'point', text: 'ほかの人の記録は、管理者も直せません。間違いを見つけたら、記録した本人に伝えてください。' },
    ],
    related: [{ id: 'add-record' }],
  },
  {
    id: 'create-event',
    title: '観察会を作る（部員以上）',
    permission: 'events.create',
    lead: '観察会を作ると、その観察会で見つけた生き物をまとめて記録できます。',
    requires: '役割が部員・幹部・管理者。ホームの「新しい観察会を作成」から始めます',
    steps: [
      '「新しい観察会を作成」を押します。',
      '「観察会名」を入れて「次へ」を押します。',
      '場所を「主な場所」から選ぶか、名前を入れて「次へ」を押します（「現在位置を使用」で、今いる場所の座標も付けられます）。',
      '日時を入れて「観察会を作成」を押します。観察会の詳細の画面に移ります。',
    ],
    image: { file: 'event-form.webp', alt: '新しい観察会を作成するフォーム。観察会名の入力欄と「次へ」のボタン', device: 'phone' },
    related: [{ id: 'event-detail' }],
  },
  {
    id: 'event-list',
    title: '観察会の一覧を見る',
    lead: '観察会の数・記録の数・見られた生き物の種類の数と、これまでの観察会が並びます。',
    steps: ['ホームの「観察会一覧」を押します。', '見たい観察会を押すと、観察会の詳細の画面が開きます。'],
    image: { file: 'event-list.webp', alt: '観察会一覧の画面。観察会の数などの統計と、観察会の一覧', device: 'phone' },
    related: [{ id: 'event-detail' }],
  },
  {
    id: 'event-detail',
    title: '観察会の中で記録する・観察会を直す',
    lead: '観察会の情報と、その観察会で付けた記録が並びます。ここで観察会の中の記録を付けられます。',
    steps: [
      '「観察会一覧」から観察会を開きます（作った直後は自動で開きます）。',
      '「観察記録を追加」で記録を付けます（付け方はホームと同じです。部員以上）。',
      '観察会を作った本人は、情報の「編集」で観察会名・場所・日付・時間を直せます。「削除」もできます。',
    ],
    image: { file: 'event-detail.webp', alt: '観察会の詳細の画面。観察会の情報と、観察会の中の記録の一覧', device: 'phone' },
    notes: [{ kind: 'caution', text: '観察会を削除しても、中の記録は消えません。「観察会なし」の記録として残ります。' }],
    related: [{ id: 'add-record' }, { id: 'event-list' }],
  },
  {
    id: 'creatures',
    title: '生き物を調べる・直す',
    lead: '登録されている生き物の一覧です。カテゴリと記録の件数が見られます。部員以上は、名前などを直せます。',
    steps: [
      'ホームの「生き物管理」を押すと、一覧が開きます。',
      '「生き物を検索...」に名前を入れて絞り込みます。',
      '直すときは鉛筆のボタンを押し、名前・カテゴリ・メモを変えて「保存」を押します（部員以上）。',
      '消すときは、ごみ箱のボタンを押します（部員以上）。',
    ],
    image: { file: 'creatures.webp', alt: '生き物管理の一覧。生き物ごとにカテゴリと記録の件数、鉛筆とごみ箱のボタン', device: 'phone' },
    notes: [
      { kind: 'caution', text: '名前を変えると、その生き物の過去の記録すべてに反映されます。' },
      { kind: 'point', text: '記録が1件でもある生き物は削除できません。新しい生き物は、記録のフォームの「新しい生き物を登録」から登録します。' },
    ],
    related: [{ id: 'add-record' }],
  },
  {
    id: 'map',
    title: 'マップで記録を見る',
    lead: '座標のある記録が、地図のピンで表示されます。同じ地点の記録は1つのピンにまとまります。',
    steps: [
      'ホームの「マップを見る」を押します。',
      'ピンを押すと、生き物・場所・日時・記録者が見られます。',
      '「生き物フィルター」などで、生き物・観察月・時間帯を絞り込みます（スマホでは地図の下、パソコンでは地図の左に並びます）。',
      '地図の右上の「航空写真」で、国土地理院の航空写真に切り替えられます。',
    ],
    image: { file: 'map.webp', alt: 'マップの画面。航空写真の上に記録のピンが立ち、下に生き物の絞り込みが並ぶ', device: 'phone' },
    notes: [{ kind: 'point', text: '地図は愛知・岐阜・三重・滋賀の4県の範囲だけ動かせます。' }],
    related: [{ id: 'locations' }, { id: 'protected' }],
  },
  {
    id: 'locations',
    title: '場所ごとに見られた生き物を見る',
    lead: '主な場所ごとに、見られた生き物と、観察された回数が並びます。',
    steps: ['ホームの「場所別の生き物」を押します。', '見たい場所を押すと、その場所で見られた生き物が並びます。'],
    image: { file: 'locations.webp', alt: '場所別の生き物の画面。主な場所の一覧と、選んだ場所で見られた生き物と回数', device: 'phone' },
    related: [{ id: 'map' }],
  },
  {
    id: 'protected',
    title: '保護対象の生き物を記録する',
    lead: '絶滅危惧種など、生息地を知られたくない生き物には、幹部・管理者が「位置を保護」の印を付けています（生き物管理で 🔒 が付いています）。',
    details: [
      '部員と OB・OG には、保護対象の生き物の記録の場所が「🔒 保護対象のため場所は非公開」と表示され、マップにもピンが立ちません。生き物・日時・記録者・メモは見られます',
      '自分で付けた記録は、自分には正確な場所で表示されます',
    ],
    image: { file: 'protected-record.webp', alt: '保護対象の生き物の記録。場所の代わりに「保護対象のため場所は非公開」と表示される', device: 'phone' },
    notes: [
      { kind: 'caution', text: 'メモはほかの部員にも表示されます。場所が分かることは書かないでください。' },
      { kind: 'caution', text: '「主な場所」で記録すると、場所別の生き物の一覧にその場所の生き物として出ます。「その他の場所」か「場所を指定しない」で記録してください。' },
      { kind: 'caution', text: '観察会の中で記録すると、観察会の場所から大まかな場所が分かります。生息地を知られたくないときは、観察会に入れずにホームから記録してください。' },
    ],
    related: [{ id: 'add-record' }, { id: 'protect-creature', guide: 'officer' }],
  },
  {
    id: 'viewer',
    title: 'OB・OG として記録を見る',
    lead: 'OB・OG は、記録・観察会・マップ・場所別の生き物を見ることだけできます。記録や観察会の追加、生き物の登録・編集はできません（画面にボタンが出ません）。',
    image: { file: 'viewer-home.webp', alt: 'OB・OG でログインしたときのホーム。記録の追加フォームがなく、最近の記録だけが並ぶ', device: 'phone' },
    notes: [
      { kind: 'point', text: '卒業前に付けた記録はそのまま残ります。記録者は「OB/OG」と表示されます。' },
      { kind: 'point', text: '大学のメールアドレスが使えなくなる前に、「アカウント」でログイン用のアドレスを個人のアドレスなどに変えておくと安心です（使えなくなった後でも、今のパスワードが分かれば変えられます）。' },
      { kind: 'caution', text: '卒業前に付けた自分の記録も、直したり消したりはできません。直したいときは管理者に相談してください。' },
    ],
    related: [{ id: 'map' }, { id: 'event-list' }, { id: 'change-email' }],
  },
];

/** 幹部向け：部員の操作に加えてできること */
const OFFICER_SECTIONS: GuideSection[] = [
  {
    id: 'officer-basics',
    title: '部員と同じ操作をする',
    lead: '記録・観察会・生き物の操作は、部員と同じです。幹部は、それに加えて保護対象の生き物を扱えます。',
    notes: [{ kind: 'point', text: '幹部も、ほかの人の記録や、ほかの人が作った観察会は直せません。' }],
    related: [
      { id: 'add-record', guide: 'member' },
      { id: 'create-event', guide: 'member' },
      { id: 'creatures', guide: 'member' },
    ],
  },
  {
    id: 'protect-creature',
    title: '生き物に「位置を保護」の印を付ける',
    permission: 'creatures.protect',
    lead: '印を付けた生き物は、記録の場所が部員と OB・OG には非公開になり、マップにもピンが立たなくなります（記録した本人には表示されます）。',
    requires: '役割が幹部・管理者',
    steps: [
      'ホームの「生き物管理」を押します。',
      '印を付ける生き物の鉛筆のボタンを押します。',
      '「位置を保護する」にチェックを入れます。',
      '「保存」を押します。一覧の生き物に 🔒 が付きます。',
    ],
    image: { file: 'creature-protect.webp', alt: '生き物を編集する画面。「位置を保護する」のチェックと説明がある', device: 'phone' },
    notes: [
      { kind: 'point', text: '対象は、各県（愛知・岐阜・三重・滋賀）のレッドデータブックに絶滅危惧種として載っている生き物です。' },
      { kind: 'caution', text: '印を外すと、すぐに全員に場所が表示されます。外す前に、本当に外してよいか確かめてください。' },
    ],
    related: [{ id: 'exact-location' }, { id: 'protected', guide: 'member' }],
  },
  {
    id: 'exact-location',
    title: '保護対象の生き物の場所を確かめる',
    permission: 'locations.viewExact',
    lead: '幹部と管理者には、保護対象の生き物の記録も、マップ・記録の一覧に正確な場所で表示されます（部員と OB・OG には、場所が非公開になり、ピンも立ちません）。',
    requires: '役割が幹部・管理者',
    steps: ['ホームの「マップを見る」を押します。', '保護対象の生き物のピンも、ほかの記録と同じように表示されます。'],
    image: { file: 'officer-map.webp', alt: '幹部でログインしたときのマップ。保護対象の生き物の記録もピンで表示される', device: 'phone' },
    notes: [
      { kind: 'caution', text: '保護対象の生き物の場所を、サイトの外（SNS や LINE など）で広めないでください。' },
      { kind: 'point', text: '生息地で観察会を開くときは、観察会の場所を名前だけの「その他の場所」にすると、場所が伝わりにくくなります。' },
    ],
    related: [{ id: 'protect-creature' }],
  },
];

/** 管理者向け：幹部の操作に加えてできること（管理者画面） */
const ADMIN_SECTIONS: GuideSection[] = [
  {
    id: 'admin-basics',
    title: '部員・幹部と同じ操作をする',
    lead: '記録・観察会・生き物の操作は部員と、保護対象の生き物の扱いは幹部と同じです。管理者は、それに加えて次のことができます。',
    details: [
      'ほかの人が作った観察会も、編集・削除できます（観察会の詳細の画面）',
      'ホームの「管理者画面」から、メンバーの招待・管理、主な場所、地図データを扱えます',
    ],
    notes: [{ kind: 'point', text: 'ほかの人の観察記録は、管理者も直したり消したりできません。' }],
    related: [
      { id: 'add-record', guide: 'member' },
      { id: 'protect-creature', guide: 'officer' },
    ],
  },
  {
    id: 'admin-invite',
    title: 'メンバーを招待する',
    permission: 'users.manage',
    lead: '新しいメンバーに渡す招待リンクを作ります。',
    requires: '役割が管理者。ホームの「管理者画面」から始めます',
    steps: [
      'ホームの「管理者画面」を押します。',
      '「新規ユーザー招待」の「招待する」を押します。',
      '相手のメールアドレスと役割を入れます。',
      '「招待リンクを作る」を押します。リンクが表示されます（次の「招待リンク・再設定リンクを渡す」）。',
    ],
    image: { file: 'admin-invite.webp', alt: '管理者画面の「新規ユーザー招待」。メールアドレスと役割の入力欄と「招待リンクを作る」のボタン', device: 'pc' },
    notes: [
      { kind: 'point', text: 'リンクは48時間有効で、1回だけ使えます。「招待履歴」で状態が見られ、期限が切れたリンクは作り直し、間違えて送ったリンクは取り消せます。' },
    ],
    related: [{ id: 'admin-link' }, { id: 'register' }],
  },
  {
    id: 'admin-link',
    title: '招待リンク・再設定リンクを渡す',
    permission: 'users.manage',
    lead: '招待リンクやパスワード再設定のリンクを作ると、リンクと案内の文が表示されます。',
    steps: [
      '「文をコピーする」を押します。',
      'LINE などに貼り付けて、本人に送ります（メールの設定があれば、メールでも届きます）。',
      '送ったら「閉じる」を押します。',
    ],
    image: { file: 'admin-issued-link.webp', alt: '招待リンクができたときの画面。リンクと案内の文、「文をコピーする」のボタン', device: 'pc' },
    notes: [
      { kind: 'caution', text: 'リンクはこのときだけ表示されます。閉じた後にリンクが分からなくなったら、作り直してください（前のリンクは使えなくなります）。' },
    ],
    related: [{ id: 'admin-invite' }, { id: 'admin-users' }],
  },
  {
    id: 'admin-users',
    title: 'メンバーの役割や状態を変える',
    permission: 'users.manage',
    lead: '管理者画面の「登録済みユーザー」で、メンバーごとに次の操作ができます。',
    requires: '役割が管理者',
    details: [
      '役割の変更：管理者／幹部／部員／OB・OG から選ぶと、すぐに変わります。卒業した人は「OB・OG」にします（記録を見ることだけできるようになります）。ログイン用のメールアドレスは、本人が「アカウント」で変えます（管理者は変えられません）',
      '「再設定リンク」：パスワードを忘れた人に、パスワード再設定のリンク（1時間有効）を作って渡します',
      '「無効化」：一時的にログインできなくします。「有効化」で元に戻せます',
      '「退会処理」：名前とメールアドレスを削除します。記録は残り、記録者は「退会済みユーザー」になります',
    ],
    image: { file: 'admin-users.webp', alt: '管理者画面の「登録済みユーザー」。役割の選択、「無効化」「再設定リンク」「退会処理」のボタン', device: 'pc' },
    notes: [
      { kind: 'caution', text: '「退会処理」は元に戻せません。' },
      { kind: 'caution', text: '最後の1人の管理者は、降格・無効化・退会させられません。自分を管理者以外にすると、管理者画面に入れなくなります。' },
      {
        kind: 'point',
        text: '「保守担当」と付いた人は、サイトの保守（不具合の修正・更新）を担当する開発者です。保守を続けられるよう、開発者のアカウントは、ほかの管理者からは変えられません（役割の変更・無効化・退会処理・再設定リンクの発行ができず、ボタンも出ません）。開発者が替わるときは、引き継ぎ資料の手順で設定を変えます。',
      },
    ],
    related: [{ id: 'admin-link' }, { id: 'admin-history' }],
  },
  {
    id: 'admin-history',
    title: '操作履歴を確かめる',
    permission: 'users.manage',
    lead: '役割の変更・無効化・有効化・退会処理・再設定リンクの発行と、本人によるメールアドレスの変更を、誰がいつ行ったかが、管理者画面の「操作履歴」に並びます。',
    notes: [{ kind: 'point', text: 'メールアドレスの変更は、変えたことだけが残ります（前後のアドレスは残しません）。今のアドレスは「登録済みユーザー」で確かめられます。' }],
    image: { file: 'admin-history.webp', alt: '管理者画面の操作履歴。誰がいつ、誰の役割を変えたかが並ぶ', device: 'pc' },
    related: [{ id: 'admin-users' }],
  },
  {
    id: 'admin-locations',
    title: '主な場所を追加・編集する',
    permission: 'mainLocations.manage',
    lead: '記録や観察会で選ぶ「主な場所」を、管理者画面の「主な場所」で管理します。',
    requires: '役割が管理者',
    steps: [
      '「場所を追加」を押します（直すときは、場所の鉛筆のボタン）。',
      '名前を入れ、座標を地図で選ぶか、緯度・経度を入れます（4県の範囲の中だけ）。',
      '「保存」を押します。',
    ],
    image: { file: 'admin-locations.webp', alt: '管理者画面の主な場所の一覧。場所の追加、編集、「使わないにする」のボタン', device: 'pc' },
    notes: [
      { kind: 'caution', text: '名前を変えると、その場所の過去の記録・観察会の表示にも反映されます。' },
      { kind: 'point', text: '記録がある場所は削除できません。使わなくなった場所は「使わないにする」で選択肢から外します（過去の記録の表示には残ります）。' },
    ],
    related: [{ id: 'locations', guide: 'member' }],
  },
  {
    id: 'admin-map-data',
    title: '地図データを更新する',
    permission: 'mapData.update',
    lead: 'マップの背景の地図を、最新の OpenStreetMap のデータに入れ替えます。',
    requires: '役割が管理者',
    steps: ['管理者画面の「地図データ」で「地図データを更新」を押します。', '数分待ちます。その間も、今の地図が表示されます。'],
    image: { file: 'admin-map-data.webp', alt: '管理者画面の地図データ。今のデータの日付と「地図データを更新」のボタン', device: 'pc' },
    notes: [{ kind: 'point', text: '新しい道や建物が地図に出ていないときに押してください（年に1回程度で十分です）。' }],
    related: [{ id: 'map', guide: 'member' }],
  },
];

export const GUIDES: Guide[] = [
  {
    id: 'member',
    label: '部員・OB・OG',
    summary: '記録を付ける・見る',
    roles: ['member', 'viewer'],
    lead: '記録を付ける・見るための基本の使い方です。OB・OG の方は、見ることだけできます。',
    quickStart: [
      { label: '招待リンクから登録する', ref: { id: 'register' } },
      { label: '観察記録を付ける', ref: { id: 'add-record' } },
      { label: 'マップで記録を見る', ref: { id: 'map' } },
    ],
    sections: MEMBER_SECTIONS,
    faq: [
      { q: 'パスワードを忘れました', a: '管理者に伝えると、パスワード再設定のリンクが届きます。', related: { id: 'password-reset' } },
      { q: '招待リンクを開いても登録できません', a: '期限（48時間）が切れたか、すでに使われたリンクです。管理者に作り直してもらってください。', related: { id: 'register' } },
      { q: '記録を間違えて付けました', a: '自分の記録なら、鉛筆のボタンで直すか、ごみ箱のボタンで消せます。', related: { id: 'edit-record' } },
      { q: '場所が「非公開」になっている記録があります', a: '保護対象の生き物の記録です。生息地を守るため、部員と OB・OG には場所を出していません。', related: { id: 'protected' } },
      { q: 'しばらく使っていたら、ログインの画面に戻りました', a: 'ログインしたままでいられるのは最大8時間です。もう一度ログインしてください。', related: { id: 'login' } },
      { q: '卒業して、大学のメールアドレスが使えなくなります', a: '「アカウント」で、ログイン用のメールアドレスを個人のアドレスなどに変えてください。記録・役割・パスワードはそのままです。', related: { id: 'change-email' } },
      { q: '記録を付けるボタンがありません', a: 'OB・OG は見ることだけできます。役割が違うと思うときは、管理者に相談してください。', related: { id: 'viewer' } },
    ],
  },
  {
    id: 'officer',
    label: '幹部',
    summary: '保護対象の生き物を扱う',
    roles: ['officer'],
    lead: '幹部は、部員の操作に加えて、保護対象の生き物（絶滅危惧種など）を扱えます。',
    quickStart: [
      { label: '部員と同じ操作をする', ref: { id: 'officer-basics' } },
      { label: '「位置を保護」の印を付ける', ref: { id: 'protect-creature' } },
      { label: '保護対象の場所を確かめる', ref: { id: 'exact-location' } },
    ],
    sections: OFFICER_SECTIONS,
    faq: [
      { q: 'どの生き物に印を付ければいいですか', a: '各県のレッドデータブックに絶滅危惧種として載っている生き物です。迷ったら、ほかの幹部や管理者と相談してください。', related: { id: 'protect-creature' } },
      { q: '印を付けると、前の記録はどうなりますか', a: '前の記録も含めて、すぐに部員と OB・OG には場所が非公開になります。', related: { id: 'protect-creature' } },
      { q: 'ほかの人の記録を直したいです', a: '幹部も、ほかの人の記録は直せません。記録した本人に伝えてください。', related: { id: 'edit-record', guide: 'member' } },
    ],
  },
  {
    id: 'admin',
    label: '管理者',
    summary: 'メンバー・場所・地図を管理する',
    roles: ['admin'],
    lead: '管理者（代表・副代表）は、部員・幹部の操作に加えて、管理者画面でメンバーや場所・地図を管理します。',
    quickStart: [
      { label: 'メンバーを招待する', ref: { id: 'admin-invite' } },
      { label: '招待リンクを渡す', ref: { id: 'admin-link' } },
      { label: 'メンバーの役割を変える', ref: { id: 'admin-users' } },
    ],
    sections: ADMIN_SECTIONS,
    faq: [
      { q: '招待リンクの期限が切れたと言われました', a: '「招待履歴」で、その招待のリンクを作り直して、もう一度渡してください。', related: { id: 'admin-invite' } },
      { q: '部員が卒業しました', a: '「登録済みユーザー」で、その人の役割を「OB・OG」にします。記録はそのまま残ります。大学のメールアドレスが使えなくなる人には、「アカウント」でログイン用のアドレスを変えるよう伝えてください。', related: { id: 'admin-users' } },
      { q: '部員がパスワードを忘れました', a: '「登録済みユーザー」の「再設定リンク」でリンクを作り、本人に渡します。', related: { id: 'admin-link' } },
      { q: '「保守担当」の人のボタンがありません', a: '保守を担当する開発者のアカウントは、保守を続けられるよう、ほかの管理者からは変えられません。', related: { id: 'admin-users' } },
      { q: '代表が交代します', a: '新しい代表を「管理者」にし、前の代表を「OB・OG」にします。管理者は2人以上いるようにしてください（最後の1人は降格できません）。', related: { id: 'admin-users' } },
    ],
  },
];

export function findGuide(id: GuideId): Guide {
  return GUIDES.find((g) => g.id === id)!;
}

/** リンク先のセクション（「はじめに」と、指定のガイド）を探す。見つからなければ undefined */
export function findSection(ref: GuideRef, current: GuideId): { guide: GuideId; section: GuideSection } | undefined {
  const guide = ref.guide ?? current;
  const section = [...GETTING_STARTED, ...findGuide(guide).sections].find((s) => s.id === ref.id);
  return section && { guide, section };
}

/** すべてのガイドで使っている画像のファイル名（テストで、画像があるかを確かめる） */
export function allGuideImages(): string[] {
  const sections = [...GETTING_STARTED, ...GUIDES.flatMap((g) => g.sections)];
  return [...new Set(sections.flatMap((s) => (s.image ? [s.image.file] : [])))];
}
