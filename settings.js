import { DEFAULT_PRESETS, normalizePreset } from "./generator.js";
import { readPresets } from "./platform.js";

// 未保存なら DEFAULT_PRESETS
export async function loadSettings() {
  const presets = await readPresets();
  const list =
    Array.isArray(presets) && presets.length
      ? presets.map(normalizePreset)
      : structuredClone(DEFAULT_PRESETS);
  return { presets: list };
}
