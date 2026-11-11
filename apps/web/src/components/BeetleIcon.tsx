/** カブトムシを上から見た絵（羽を閉じた姿）。サイトのロゴに使う（#97）。色は currentColor、ほかのアイコン（lucide）と同じ線の太さ */
export const BEETLE_PATHS = [
  // 長い角（先が二又）
  'M12 6.4V2.4',
  'M12 2.6 10.3 1.1',
  'M12 2.6 13.7 1.1',
  // 頭
  'M10.3 7.8a1.7 1.3 0 0 1 3.4 0',
  // 胸（幅の広い前胸背板）と、小さい胸の角
  'M7.4 11c0-2.3 2-3.5 4.6-3.5s4.6 1.2 4.6 3.5Z',
  'M12 9.6V8.4',
  // 背中（閉じた羽、縦に長い）と、羽の合わせ目
  'M12 11c-2.9 0-4.6 2.2-4.6 5.8 0 3.7 2 6.5 4.6 6.5s4.6-2.8 4.6-6.5c0-3.6-1.7-5.8-4.6-5.8Z',
  'M12 11v12.2',
  // 脚（左右に3本ずつ）
  'M8.2 9.6 5.9 8.3l-.7-2',
  'M15.8 9.6l2.3-1.3.7-2',
  'M7.5 13.6 4.8 13.2l-1 2.1',
  'M16.5 13.6l2.7-.4 1 2.1',
  'M7.7 17.8 5.2 19.3l-.4 2.3',
  'M16.3 17.8l2.5 1.5.4 2.3',
];

export function BeetleIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {BEETLE_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
