import { Info } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { BackBar, Card, PageBackground } from '../components/ui';
import {
  GETTING_STARTED,
  GUIDES,
  findGuide,
  guideIdFor,
  isGuideId,
  type GuideBlock,
  type GuideSection,
} from '../guide/guides';
import { useCurrentUser } from '../lib/auth';

/**
 * 使い方ガイド（#79、D53）。ログインしていなくても読める（招待された人が登録の前に読めるように）。
 * 最初はログインしている人の役割のガイドを出し、上のタブでほかの役割のガイドに切り替えられる（?for=member|officer|admin）
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
      <BackBar to={user ? '/' : '/login'} label={user ? 'ホームに戻る' : 'ログインに戻る'} title="使い方" />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <nav aria-label="ガイドの種類" className="flex flex-wrap gap-2">
          {GUIDES.map((g) => {
            const active = g.id === guide.id;
            return (
              <Link
                key={g.id}
                to={`/guide?for=${g.id}`}
                replace
                aria-current={active ? 'page' : undefined}
                className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                  active
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400 hover:text-blue-700'
                }`}
              >
                {g.label}向け
                {g.id === mine && user && <span className="ml-1 text-xs opacity-80">（あなた）</span>}
              </Link>
            );
          })}
        </nav>

        <Card className="p-6">
          <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">{guide.label}向けの使い方</h2>
          <p className="mt-2 leading-relaxed text-gray-700">{guide.lead}</p>
          <Toc
            groups={[
              { title: 'はじめに', sections: GETTING_STARTED },
              { title: `${guide.label}向け`, sections: guide.sections },
            ]}
          />
        </Card>

        <h2 className="pt-2 text-lg font-bold text-gray-900">はじめに（ログイン・登録）</h2>
        {GETTING_STARTED.map((s) => (
          <SectionCard key={s.id} section={s} />
        ))}

        <h2 className="pt-2 text-lg font-bold text-gray-900">{guide.label}向け</h2>
        {guide.sections.map((s) => (
          <SectionCard key={s.id} section={s} />
        ))}

        <p className="text-center text-sm text-gray-600">
          分からないことや、画面がおかしいときは、管理者（代表・副代表）に相談してください。
        </p>
      </main>
    </PageBackground>
  );
}

function Toc({ groups }: { groups: { title: string; sections: GuideSection[] }[] }) {
  return (
    <div className="mt-4 grid gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2">
      {groups.map((g) => (
        <div key={g.title}>
          <p className="mb-1 text-sm font-bold text-gray-500">{g.title}</p>
          <ul className="space-y-1 text-sm">
            {g.sections.map((s) => (
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

function SectionCard({ section }: { section: GuideSection }) {
  const { image } = section;
  const phone = image?.device === 'phone';
  return (
    <section
      id={section.id}
      aria-labelledby={`${section.id}-title`}
      className="scroll-mt-20 rounded-xl bg-white p-6 shadow-md"
    >
        <h3 id={`${section.id}-title`} className="mb-4 text-xl font-bold text-gray-900">
          {section.title}
        </h3>
        <div className={phone ? 'gap-6 sm:flex sm:items-start' : ''}>
          {image && (
            <figure className={phone ? 'mx-auto mb-4 w-full max-w-[260px] shrink-0 sm:mx-0 sm:mb-0' : 'mb-4'}>
              {/* スマホ幅の画像は2倍の解像度で撮っているので幅いっぱいに、パソコン幅の画像は撮った大きさより広げない */}
              <img
                src={`/guide-images/${image.file}`}
                alt={image.alt}
                loading="lazy"
                className={`rounded-lg border border-gray-200 shadow-sm ${phone ? 'w-full' : 'mx-auto block h-auto max-w-full'}`}
              />
            </figure>
          )}
          <div className="min-w-0 space-y-3 leading-relaxed text-gray-700">
            {section.body.map((b, i) => (
              <Block key={i} block={b} />
            ))}
          </div>
      </div>
    </section>
  );
}

function Block({ block }: { block: GuideBlock }) {
  if (typeof block === 'string') return <p>{block}</p>;
  if ('list' in block) {
    return (
      <ul className="list-disc space-y-1.5 pl-5">
        {block.list.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }
  return (
    <p className="flex gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      {block.note}
    </p>
  );
}
