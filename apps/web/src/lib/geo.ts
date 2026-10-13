/** navigator.geolocation を Promise にしたもの。失敗理由は日本語メッセージで返す */
export function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('このブラウザは現在位置の取得に対応していません'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
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
