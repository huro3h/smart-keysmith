import { DEFAULT_PRESETS, normalizePreset } from "./generator.js";

// chrome.storage.local
//   presets: プリセットの配列 (未保存なら DEFAULT_PRESETS)。ポップアップにこの順で並ぶ
export async function loadSettings() {
  const { presets } = await chrome.storage.local.get("presets");
  const list =
    Array.isArray(presets) && presets.length
      ? presets.map(normalizePreset)
      : structuredClone(DEFAULT_PRESETS);
  return { presets: list };
}
