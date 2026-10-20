// 拡張と Web 版で違うところだけをここに置く。Web 版はビルドで web/platform.js に差し替わる
// chrome.storage.local
//   presets: プリセットの配列。ポップアップにこの順で並ぶ

export async function readPresets() {
  return (await chrome.storage.local.get("presets")).presets;
}

export async function writePresets(presets) {
  await chrome.storage.local.set({ presets });
}

// オプション画面での変更をポップアップに反映する (Web 版は一覧と編集欄が同じページにある)
export function onPresetsChanged(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.presets) callback();
  });
}

export const VERSION = chrome.runtime.getManifest().version;

export function openEditor() {
  chrome.runtime.openOptionsPage();
}
