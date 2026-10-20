// Web 版の platform.js。ビルドで拡張の platform.js と差し替える
// localStorage
//   smart-keysmith.presets: プリセットの配列 (JSON)。一覧にこの順で並ぶ
//   smart-keysmith.settingsOpen: 編集欄を開いていれば "1"
// localStorage は使えないことがある (プライベートモードやサイトデータのブロック)。そのときは保存しないだけで動かす

const KEY = "smart-keysmith.presets";
const OPEN_KEY = "smart-keysmith.settingsOpen";
const listeners = [];
const $ = (id) => document.getElementById(id);

export async function readPresets() {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return undefined;
  }
}

export async function writePresets(presets) {
  try {
    localStorage.setItem(KEY, JSON.stringify(presets));
  } catch {}
  for (const callback of listeners) callback();
}

// 編集欄で保存するたびに、上の一覧を描き直す
export function onPresetsChanged(callback) {
  listeners.push(callback);
}

// ビルドで manifest.json の version に置き換える
export const VERSION = "__VERSION__";

// 編集欄 (#settings) は一覧の下にあり、歯車で開け閉めする (ページは遷移しない)
const scrollBehavior = () => (matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

function setSettingsOpen(open) {
  $("settings").hidden = !open;
  $("openOptions").setAttribute("aria-pressed", String(open));
  try {
    localStorage.setItem(OPEN_KEY, open ? "1" : "");
  } catch {}
}

export function openEditor() {
  const open = $("settings").hidden;
  setSettingsOpen(open);
  if (open) $("settings").scrollIntoView({ behavior: scrollBehavior(), block: "start" });
}

// 閉じたらページ先頭 (パスワード一覧) に戻し、フォーカスを歯車に返す
$("closeSettings").onclick = () => {
  setSettingsOpen(false);
  scrollTo({ top: 0, behavior: scrollBehavior() });
  $("openOptions").focus({ preventScroll: true });
};

let wasOpen = false;
try {
  wasOpen = !!localStorage.getItem(OPEN_KEY);
} catch {}
setSettingsOpen(wasOpen);
