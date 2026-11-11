import { AlertTriangle, ChevronRight, CircleHelp, Lightbulb, ListChecks, ShieldCheck, Sprout, Users } from 'lucide-react';
import { useEffect, type ComponentType, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { BackBar, Card, PageBackground } from '../components/ui';
import imageSizes from '../guide/imageSizes.json';
import {
  GETTING_STARTED,
  GUIDES,
  findGuide,
  findSection,
  guideIdFor,
  isGuideId,
  type Guide,
  type GuideId,
  type GuideNote,
  type GuideRef,
  type GuideSection,
} from '../guide/guides';
import { useCurrentUser } from '../lib/auth';

const GUIDE_ICONS: Record<GuideId, ComponentType<{ className?: string }>> = {
  member: Sprout,
  officer: ShieldCheck,
  admin: Users,
};

/**
 * 使い方ガイド（#79、D53）。ログインしていなくても読める（招待された人が登録の前に読めるように）。
 * 最初はログインしている人の役割のガイドを出し、上のカードでほかの役割のガイドに切り替えられる（?for=member|officer|admin）。
 * 作りは LINE・PayPay・メルカリ・d払いなどの使い方ガイドを参考にした（D53）
 */
export function GuidePage() {
  const user = useCurrentUser();
  const [params] = useSearchParams();
  const requested = params.get('for');
  const mine = guideIdFor(user?.role);
  const guide = findGuide(isGuideId(requested) ? requested : mine);
  const { hash } = useLocation();

  // 「/guide#map」のようにセクションを指して開いたとき、描いた後にそこへ移る（最初の読み込みではブラウザが先に探して見つけられない）
  useEffect(() => {
    if (hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
  }, [hash, guide.id]);

  return (
    <PageBackground>
      <BackBar to={user ? '/' : '/login'} label={user ? 'ホーム画面に戻る' : 'ログインに戻る'} title="使い方" />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <RolePicker current={guide.id} mine={user ? mine : null} />

        <Card className="p-6">
          <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">{guide.label}向けの使い方</h2>
          <p className="mt-2 leading-relaxed text-gray-700">{guide.lead}</p>
          <QuickStart guide={guide} />
          <Toc guide={guide} />
        </Card>

        <GroupHeading>はじめに（ログイン・登録）</GroupHeading>
        {GETTING_STARTED.map((s) => (
          <SectionCard key={s.id} section={s} current={guide.id} />
        ))}

        <GroupHeading>{`${guide.label}向け`}</GroupHeading>
        {guide.sections.map((s) => (
          <SectionCard key={s.id} section={s} current={guide.id} />
        ))}

        <Faq guide={guide} />

        <p className="text-center text-sm text-gray-600">
          ここにないことや、画面がおかしいときは、管理者（代表・副代表）に相談してください。
        </p>
      </main>
    </PageBackground>
  );
}

/** 役割を選ぶカード（PayPay・d払いの「利用者で分ける」入口にならう） */
function RolePicker({ current, mine }: { current: GuideId; mine: GuideId | null }) {
  return (
    <nav aria-label="ガイドの種類">
      <p className="mb-2 text-sm text-gray-600">あなたの役割を選んでください</p>
      <div className="grid grid-cols-3 gap-2">
        {GUIDES.map((g) => {
          const active = g.id === current;
          const Icon = GUIDE_ICONS[g.id];
          return (
            <Link
              key={g.id}
              to={`/guide?for=${g.id}`}
              replace
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center gap-1 rounded-xl border-2 bg-white px-2 py-3 text-center shadow-sm transition-colors ${
                active ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-700 hover:border-blue-300'
              }`}
            >
              <Icon className="h-6 w-6" />
              <span className="text-sm font-bold">{g.label}</span>
              <span className="text-[11px] leading-tight text-gray-500 sm:text-xs">{g.summary}</span>
              {g.id === mine && <span className="text-xs text-blue-600">（あなた）</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** 「はじめての方へ」の3ステップ（d払い・PayPay のはじめてガイドにならう） */
function QuickStart({ guide }: { guide: Guide }) {
  return (
    <section aria-labelledby="quick-start" className="mt-5 rounded-xl bg-green-50 p-4">
      <h3 id="quick-start" className="mb-3 font-bold text-green-900">
        はじめての方へ：まずはこの3ステップ
      </h3>
      <ol className="grid gap-2 sm:grid-cols-3">
        {guide.quickStart.map((q, i) => (
          <li key={q.ref.id}>
            <RefLink
              to={q.ref}
              current={guide.id}
              className="flex h-full items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-gray-800 shadow-sm hover:bg-green-100"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-600 text-sm font-bold text-white">
                {i + 1}
              </span>
              {q.label}
            </RefLink>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Toc({ guide }: { guide: Guide }) {
  const groups: { title: string; items: { id: string; title: string }[] }[] = [
    { title: 'はじめに', items: GETTING_STARTED },
    { title: `${guide.label}向け`, items: guide.sections },
    { title: 'こまったとき', items: [{ id: 'faq', title: 'よくある質問' }] },
  ];
  return (
    <div className="mt-5 grid gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2">
      {groups.map((g) => (
        <div key={g.title}>
          <p className="mb-1 text-sm font-bold text-gray-500">{g.title}</p>
          <ul className="space-y-1 text-sm">
            {g.items.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-blue-600 hover:underline">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function GroupHeading({ children }: { children: string }) {
  return <h2 className="border-l-4 border-green-600 pt-2 pl-3 text-lg font-bold text-gray-900">{children}</h2>;
}

/** 1つの目的の説明：前提 → 手順（番号付き）と画面 → ポイント・注意 → 関連する項目（LINE・メルカリの説明ページにならう） */
function SectionCard({ section, current }: { section: GuideSection; current: GuideId }) {
  const { image } = section;
  const phone = image?.device === 'phone';
  const size = image ? (imageSizes as Record<string, { width: number; height: number }>)[image.file] : undefined;
  return (
    <section
      id={section.id}
      aria-labelledby={`${section.id}-title`}
      className="scroll-mt-20 rounded-xl bg-white p-6 shadow-md"
    >
      <h3 id={`${section.id}-title`} className="text-xl font-bold text-gray-900">
        {section.title}
      </h3>
      <p className="mt-2 leading-relaxed text-gray-700">{section.lead}</p>
      {section.requires && (
        <p className="mt-3 flex gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
          <span>
            <span className="font-bold">前提：</span>
            {section.requires}
          </span>
        </p>
      )}

      {(section.steps || section.details || image) && (
        <div className={`mt-4 ${phone ? 'gap-6 sm:flex sm:items-start' : ''}`}>
          <div className="min-w-0 flex-1 space-y-3 leading-relaxed text-gray-700">
            {section.steps && <Steps steps={section.steps} />}
            {section.details && (
              <ul className="list-disc space-y-1.5 pl-5">
                {section.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
          </div>
          {image && (
            <figure className={phone ? 'mx-auto mt-4 w-full max-w-[260px] shrink-0 sm:mt-0' : 'mt-4'}>
              {/* 幅と高さを書いて、読み込む前から場所を取る（読み込みで下の内容がずれない）。スマホ幅の画像は枠の幅に縮め、パソコン幅の画像は撮った大きさより広げない */}
              <img
                src={`/guide-images/${image.file}`}
                alt={image.alt}
                width={size?.width}
                height={size?.height}
                loading="lazy"
                className={`rounded-lg border border-gray-200 shadow-sm ${phone ? 'h-auto w-full' : 'mx-auto block h-auto max-w-full'}`}
              />
            </figure>
          )}
        </div>
      )}

      {section.notes && (
        <div className="mt-4 space-y-2">
          {section.notes.map((n) => (
            <Note key={n.text} note={n} />
          ))}
        </div>
      )}
      {section.related && <Related refs={section.related} current={current} />}
    </section>
  );
}

function Steps({ steps }: { steps: string[] }) {
  return (
    // role="list"：list-style をなくした ol を、Safari の読み上げでも番号付きの一覧として扱わせる
    <ol role="list" className="space-y-3">
      {steps.map((s, i) => (
        <li key={s} className="flex gap-3">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white"
          >
            {i + 1}
          </span>
          <span className="pt-0.5">{s}</span>
        </li>
      ))}
    </ol>
  );
}

function Note({ note }: { note: GuideNote }) {
  const caution = note.kind === 'caution';
  const Icon = caution ? AlertTriangle : Lightbulb;
  return (
    <p
      className={`flex gap-2 rounded-lg px-3 py-2 text-sm ${
        caution ? 'border border-amber-200 bg-amber-50 text-amber-900' : 'bg-blue-50 text-blue-900'
      }`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        <span className="font-bold">{caution ? '注意：' : 'ポイント：'}</span>
        {note.text}
      </span>
    </p>
  );
}

/** 関連する項目（PayPay の説明ページの末尾にならう） */
function Related({ refs, current }: { refs: GuideRef[]; current: GuideId }) {
  return (
    <div className="mt-4 border-t border-gray-100 pt-3">
      <p className="mb-1 text-sm font-bold text-gray-500">関連する項目</p>
      <ul className="space-y-1 text-sm">
        {refs.map((r) => {
          const found = findSection(r, current);
          if (!found) return null;
          return (
            <li key={`${found.guide}-${r.id}`}>
              <RefLink to={r} current={current} className="inline-flex items-center gap-0.5 text-blue-600 hover:underline">
                <ChevronRight className="h-4 w-4 shrink-0" />
                {found.section.title}
                {found.guide !== current && (
                  <span className="text-gray-500">（{findGuide(found.guide).label}向け）</span>
                )}
              </RefLink>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** よくある質問（各社のガイドの末尾にならう）。押すと答えが開く */
function Faq({ guide }: { guide: Guide }) {
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 rounded-xl bg-white p-6 shadow-md">
      <h3 id="faq-title" className="mb-2 flex items-center gap-2 text-xl font-bold text-gray-900">
        <CircleHelp className="h-5 w-5 text-blue-600" />
        よくある質問
      </h3>
      <div className="divide-y divide-gray-100">
        {guide.faq.map((f) => (
          <details key={f.q} className="group py-3">
            <summary className="flex cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden gap-2 font-bold text-gray-900">
              <span className="text-blue-600">Q.</span>
              <span className="flex-1">{f.q}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-open:rotate-90" />
            </summary>
            <p className="mt-2 pl-6 text-gray-700">
              {f.a}
              {f.related && (
                <>
                  {' '}
                  <RefLink to={f.related} current={guide.id} className="text-blue-600 hover:underline">
                    くわしく見る
                  </RefLink>
                </>
              )}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}

/** 同じガイドの中なら #id、ほかのガイドなら ?for=…#id へのリンク */
function RefLink({
  to,
  current,
  className,
  children,
}: {
  to: GuideRef;
  current: GuideId;
  className?: string;
  children: ReactNode;
}) {
  const guide = to.guide ?? current;
  if (guide === current) {
    return (
      <a href={`#${to.id}`} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link to={`/guide?for=${guide}#${to.id}`} className={className}>
      {children}
    </Link>
  );
}
