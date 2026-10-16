import {
  keepPreviousData,
  QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  CreatureInput,
  CreatureView,
  EventInput,
  EventListResponse,
  EventView,
  LocationStatsResponse,
  MainLocationInput,
  MainLocationView,
  RecordInput,
  RecordPage,
  RecordView,
  TimeOfDay,
} from '@yamon/shared';
import { ApiError, apiFetch } from './api';

/**
 * 生き物・観察会・観察記録のデータ（#13）。正本は API の DB で、TanStack Query でキャッシュする。
 * 書き込んだら、観察まわりのキャッシュ（キーの先頭が 'obs'）をまとめて読み直す。
 * 件数は多くないので、どの一覧に影響するかを細かく分けるより、取りこぼしがない方を選ぶ
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 他の端末での変更も、画面に戻ってきたときに読み直す
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // 入力の誤り・ログイン切れ・権限がない・見つからないときは、やり直しても結果は変わらない
      retry: (count, error) =>
        count < 2 && !(error instanceof ApiError && [400, 401, 403, 404].includes(error.status)),
    },
  },
});

const OBS = 'obs';
const keys = {
  creatures: [OBS, 'creatures'] as const,
  mainLocations: [OBS, 'main-locations'] as const,
  events: [OBS, 'events'] as const,
  event: (id: string) => [OBS, 'events', id] as const,
  records: (eventId: string | null, limit: number) => [OBS, 'records', { eventId, limit }] as const,
  map: (filter: MapFilter) => [OBS, 'map', filter] as const,
  locationStats: [OBS, 'stats', 'locations'] as const,
};

export function useCreatures() {
  return useQuery({
    queryKey: keys.creatures,
    queryFn: () => apiFetch<{ creatures: CreatureView[] }>('/api/creatures').then((r) => r.creatures),
  });
}

export function useMainLocations() {
  return useQuery({
    queryKey: keys.mainLocations,
    queryFn: () => apiFetch<{ locations: MainLocationView[] }>('/api/main-locations').then((r) => r.locations),
  });
}

export function useEvents() {
  return useQuery({ queryKey: keys.events, queryFn: () => apiFetch<EventListResponse>('/api/events') });
}

export function useEvent(id: string) {
  return useQuery({
    queryKey: keys.event(id),
    queryFn: () => apiFetch<EventView>(`/api/events/${encodeURIComponent(id)}`),
  });
}

/** 記録一覧（新しい順）。サーバー側でページングし、fetchNextPage で続きを読む */
export function useRecordPages({ eventId = null, limit }: { eventId?: string | null; limit: number }) {
  return useInfiniteQuery({
    queryKey: keys.records(eventId, limit),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const q = new URLSearchParams({ limit: String(limit) });
      if (eventId) q.set('eventId', eventId);
      if (pageParam) q.set('cursor', pageParam);
      return apiFetch<RecordPage>(`/api/records?${q}`);
    },
    getNextPageParam: (last) => last.nextCursor,
  });
}

export interface MapFilter {
  creatureId: string | null;
  month: number | null;
  timeOfDay: TimeOfDay | null;
}

export function useMapRecords(filter: MapFilter) {
  return useQuery({
    queryKey: keys.map(filter),
    queryFn: () => {
      const q = new URLSearchParams();
      if (filter.creatureId) q.set('creatureId', filter.creatureId);
      if (filter.month) q.set('month', String(filter.month));
      if (filter.timeOfDay) q.set('timeOfDay', filter.timeOfDay);
      return apiFetch<{ records: RecordView[] }>(`/api/records/map?${q}`).then((r) => r.records);
    },
    // 絞り込みを変えている間も、前のピンを出したままにする
    placeholderData: keepPreviousData,
  });
}

export function useLocationStats() {
  return useQuery({ queryKey: keys.locationStats, queryFn: () => apiFetch<LocationStatsResponse>('/api/stats/locations') });
}

// ---------------------------------------------------------------------------
// 書き込み
// ---------------------------------------------------------------------------

/** 書き込みの後、観察まわりのキャッシュをすべて読み直す */
function useObsMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => client.invalidateQueries({ queryKey: [OBS] }),
  });
}

export const useCreateRecord = () =>
  useObsMutation((input: RecordInput) => apiFetch<RecordView>('/api/records', { method: 'POST', body: input }));

export const useUpdateRecord = () =>
  useObsMutation(({ id, input }: { id: string; input: RecordInput }) =>
    apiFetch<RecordView>(`/api/records/${id}`, { method: 'PUT', body: input }),
  );

export const useDeleteRecord = () =>
  useObsMutation((id: string) => apiFetch<void>(`/api/records/${id}`, { method: 'DELETE' }));

export const useCreateCreature = () =>
  useObsMutation((input: CreatureInput) => apiFetch<CreatureView>('/api/creatures', { method: 'POST', body: input }));

export const useUpdateCreature = () =>
  useObsMutation(({ id, input }: { id: string; input: CreatureInput }) =>
    apiFetch<CreatureView>(`/api/creatures/${id}`, { method: 'PUT', body: input }),
  );

export const useDeleteCreature = () =>
  useObsMutation((id: string) => apiFetch<void>(`/api/creatures/${id}`, { method: 'DELETE' }));

export const useCreateMainLocation = () =>
  useObsMutation((input: MainLocationInput) =>
    apiFetch<MainLocationView>('/api/main-locations', { method: 'POST', body: input }),
  );

export const useUpdateMainLocation = () =>
  useObsMutation(({ id, input }: { id: string; input: MainLocationInput }) =>
    apiFetch<MainLocationView>(`/api/main-locations/${id}`, { method: 'PUT', body: input }),
  );

export const useDeleteMainLocation = () =>
  useObsMutation((id: string) => apiFetch<void>(`/api/main-locations/${id}`, { method: 'DELETE' }));

export const useCreateEvent = () =>
  useObsMutation((input: EventInput) => apiFetch<EventView>('/api/events', { method: 'POST', body: input }));

/** 画面に出すエラーの文。API のエラーはそのまま、それ以外は fallback */
export function errorMessage(error: unknown, fallback = '処理に失敗しました'): string {
  return error instanceof ApiError ? error.message : fallback;
}
