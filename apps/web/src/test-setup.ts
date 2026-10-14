// Node 25 の組み込み localStorage が jsdom のものを隠してしまうため、jsdom 側に差し替える
declare const jsdom: { window: Window };
Object.defineProperty(globalThis, 'localStorage', {
  value: jsdom.window.localStorage,
  configurable: true,
});
