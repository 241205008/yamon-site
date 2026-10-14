import { Pencil, Trash2 } from 'lucide-react';
import { getTimeOfDay, monthOf } from '@yamon/shared';
import type { Creature, ObservationRecord } from '../lib/types';
import { CategoryBadge } from './ui';

export function RecordCard({
  record,
  creature,
  isMine,
  showTimeOfDay = false,
  isEditing = false,
  onEdit,
  onDelete,
}: {
  record: ObservationRecord;
  creature: Creature | undefined;
  isMine: boolean;
  showTimeOfDay?: boolean;
  isEditing?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article
      className={`rounded-lg border p-4 transition-colors ${
        isEditing ? 'border-blue-400 bg-blue-50/50' : 'border-gray-200 hover:bg-gray-50'
      }`}
    >
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold text-gray-900">{creature?.name ?? '（削除された生き物）'}</h3>
            {creature && <CategoryBadge category={creature.category} />}
            {record.locationType === 'none' && (
              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">場所未指定</span>
            )}
          </div>
          {record.locationType !== 'none' && (
            <p className="mt-1 text-sm text-gray-600">📍 {record.locationName}</p>
          )}
          <p className="mt-1 text-sm text-gray-500">
            {record.date} {record.time}
            {showTimeOfDay && ` (${getTimeOfDay(record.time)})`}
          </p>
          {record.memo && (
            <p className="mt-2 rounded border border-yellow-200 bg-yellow-50 px-2 py-1.5 text-sm whitespace-pre-wrap text-gray-700">
              💬 {record.memo}
            </p>
          )}
          {isMine && <p className="mt-1 text-xs text-blue-600">あなたの記録</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-3">
          <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs text-green-800">
            {monthOf(record.date)}月
          </span>
          {isMine && (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={onEdit}
                className="rounded p-1.5 text-blue-600 hover:bg-blue-50"
                aria-label="編集"
                title="編集"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="rounded p-1.5 text-red-600 hover:bg-red-50"
                aria-label="削除"
                title="削除"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
