import { isoToJstDateTime, type IssuedLink } from '@yamon/shared';
import { Check, Copy } from 'lucide-react';
import { useRef, useState } from 'react';
import { Modal } from './ui';

export type IssuedLinkKind = 'invitation' | 'passwordReset';

const TEXT: Record<IssuedLinkKind, { title: string; message: (url: string, until: string) => string }> = {
  invitation: {
    title: '招待リンクができました',
    message: (url, until) =>
      [
        'やもんサイト（生き物観察記録）への招待です。',
        '次のリンクを開き、名前とパスワードを設定して登録してください。',
        `有効期限：${until}まで（1回だけ使えます）`,
        url,
      ].join('\n'),
  },
  passwordReset: {
    title: '再設定リンクができました',
    message: (url, until) =>
      [
        'やもんサイトのパスワード再設定のリンクです。',
        '次のリンクを開き、新しいパスワードを設定してください。',
        `有効期限：${until}まで（1回だけ使えます）`,
        url,
      ].join('\n'),
  },
};

/**
 * 管理者が発行したリンク（招待・パスワード再設定）を見せる（D46）。リンクはこのときだけ受け取れるので、
 * LINE などにそのまま貼れる文をコピーしてもらう。閉じた後は「作り直す」しかない
 */
export function IssuedLinkModal({
  kind,
  to,
  link,
  onClose,
}: {
  kind: IssuedLinkKind;
  /** 渡す相手（名前やメールアドレス） */
  to: string;
  link: IssuedLink;
  onClose: () => void;
}) {
  const text = TEXT[kind];
  const message = text.message(link.url, isoToJstDateTime(link.expiresAt));
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied('ok');
    } catch {
      // クリップボードが使えないブラウザでは、文を選んだ状態にして手で写してもらう
      areaRef.current?.select();
      setCopied('failed');
    }
  };

  return (
    <Modal open onClose={onClose} title={text.title}>
      <div className="space-y-4">
        <p className="text-sm text-gray-700">
          <span className="font-bold break-all">{to}</span> に、次の文を LINE などで送ってください。
        </p>
        <label htmlFor="issued-link-message" className="sr-only">
          送る文
        </label>
        <textarea
          id="issued-link-message"
          ref={areaRef}
          readOnly
          value={message}
          rows={6}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-lg border border-gray-300 bg-gray-50 p-3 text-sm break-all text-gray-900"
        />
        <button
          type="button"
          onClick={() => void copy()}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 py-2.5 text-white hover:bg-purple-700"
        >
          {copied === 'ok' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied === 'ok' ? 'コピーしました' : '文をコピーする'}
        </button>
        {copied === 'failed' && (
          <p role="alert" className="text-sm text-red-700">
            自動でコピーできませんでした。上の文を選んだので、長押しまたは Ctrl+C でコピーしてください。
          </p>
        )}
        {link.mailSent && <p className="text-sm text-green-700">同じリンクを、相手にメールでも送りました。</p>}
        <p className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
          このリンクは今だけ表示されます。閉じた後にリンクが分からなくなったら、作り直してください（前のリンクは使えなくなります）。
          リンクを知っている人はだれでも使えるので、本人にだけ送ってください。
        </p>
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200">
            閉じる
          </button>
        </div>
      </div>
    </Modal>
  );
}
