import { isInTokai } from '@yamon/shared';

/**
 * navigator.geolocation を Promise にしたもの。失敗理由は日本語メッセージで返す。
 * 地図の範囲（東海3県）の外の位置は記録に使えないため、失敗として扱う（D28）
 */
export function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('このブラウザは現在位置の取得に対応していません'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        if (isInTokai(lat, lng)) resolve({ lat, lng });
        else reject(new Error('現在位置が東海3県の範囲外のため使えません。マップで位置を選択してください'));
      },
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? '位置情報の利用が許可されていません。ブラウザの設定を確認してください'
              : '現在位置を取得できませんでした',
          ),
        ),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}
