import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCurrentPosition } from './geo';

/** navigator.geolocation を、指定した結果を返す偽物に差し替える */
function stubGeolocation(result: { lat: number; lng: number } | { code: number }) {
  vi.stubGlobal('navigator', {
    geolocation: {
      getCurrentPosition: (ok: PositionCallback, ng: PositionErrorCallback) => {
        if ('lat' in result) ok({ coords: { latitude: result.lat, longitude: result.lng } } as GeolocationPosition);
        else ng({ code: result.code, PERMISSION_DENIED: 1 } as GeolocationPositionError);
      },
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getCurrentPosition', () => {
  it('4県の中の位置はそのまま返す', async () => {
    stubGeolocation({ lat: 35.1347, lng: 136.9759 });
    await expect(getCurrentPosition()).resolves.toEqual({ lat: 35.1347, lng: 136.9759 });
  });

  it('範囲外の位置は使わずにエラーにする', async () => {
    stubGeolocation({ lat: 35.6812, lng: 139.7671 });
    await expect(getCurrentPosition()).rejects.toThrow('範囲外');
  });

  it('許可されなかったときは設定の確認を促す', async () => {
    stubGeolocation({ code: 1 });
    await expect(getCurrentPosition()).rejects.toThrow('許可されていません');
  });
});
