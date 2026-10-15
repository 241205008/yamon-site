import { useMemo } from 'react';
import type { Creature, Database, ObservationRecord } from './types';

export function useCreatureMap(db: Database): Map<string, Creature> {
  return useMemo(() => new Map(db.creatures.map((c) => [c.id, c])), [db.creatures]);
}

/** 新しい順（日付→時刻→作成日時） */
export function compareRecordsDesc(a: ObservationRecord, b: ObservationRecord): number {
  return (
    b.date.localeCompare(a.date) ||
    b.time.localeCompare(a.time) ||
    b.createdAt.localeCompare(a.createdAt)
  );
}

export function hasCoords(r: { lat: number | null; lng: number | null }): r is { lat: number; lng: number } {
  return r.lat !== null && r.lng !== null;
}
