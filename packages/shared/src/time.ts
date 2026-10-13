import type { TimeOfDay } from './master';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 端末のタイムゾーンに関係なく、JST の日付・時刻を返す（toISOString の UTC ずれ対策） */
function jstParts(now: Date) {
  const d = new Date(now.getTime() + JST_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
  };
}

export function todayJst(now: Date = new Date()): string {
  return jstParts(now).date;
}

export function nowTimeJst(now: Date = new Date()): string {
  return jstParts(now).time;
}

/** ISO 文字列を JST の "YYYY-MM-DD" にする */
export function isoToJstDate(iso: string): string {
  return todayJst(new Date(iso));
}

/** ISO 文字列を JST の "YYYY-MM-DD HH:MM" にする */
export function isoToJstDateTime(iso: string): string {
  const p = jstParts(new Date(iso));
  return `${p.date} ${p.time}`;
}

export function monthOf(date: string): number {
  return Number(date.slice(5, 7));
}

/**
 * 06:00–11:59 朝 / 12:00–16:59 昼 / 17:00–19:59 夕方 / 20:00–05:59 夜
 */
export function getTimeOfDay(time: string): TimeOfDay {
  const hour = Number(time.slice(0, 2));
  if (hour >= 6 && hour < 12) return '朝';
  if (hour >= 12 && hour < 17) return '昼';
  if (hour >= 17 && hour < 20) return '夕方';
  return '夜';
}

/** 残り時間を "MM:SS" で返す（0 未満は 00:00） */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
