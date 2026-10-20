import { generate, presetLabel } from "./generator.js";
import { loadSettings } from "./settings.js";
import { VERSION, onPresetsChanged, openEditor } from "./platform.js";

const $ = (id) => document.getElementById(id);
// これより長いパスワードは表示だけ省略する (コピーは全文)
const SHOW_MAX = 32;

// Lucide 系の線画。色は currentColor でボタンの文字色に従う
const svg = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
// rotate-cw (丸に矢印)
const REGEN_ICON = svg('<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>');
// settings (歯車)
const GEAR_ICON = svg('<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>');
// copy (重なった四角)。オプション画面の「複製」はこれと見分けるため copy-plus にしてある
const COPY_ICON = svg('<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>');
const CHECK_ICON = svg('<polyline points="20 6 9 17 4 12"/>');
const FAIL_ICON = svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>');

function render(presets) {
  $("list").replaceChildren(
    ...presets.map((p) => {
      const li = document.createElement("li");

      const label = document.createElement("div");
      label.className = "label";
      label.textContent = presetLabel(p);

      const row = document.createElement("div");
      row.className = "row";
      const pw = document.createElement("code");
      pw.className = "pw";
      const copy = document.createElement("button");
      copy.className = "icon-btn copy";
      copy.innerHTML = COPY_ICON;
      copy.title = "コピー";
      copy.setAttribute("aria-label", `「${presetLabel(p)}」のパスワードをコピー`);

      let value = "";
      try {
        value = generate(p);
        pw.textContent = value.length > SHOW_MAX ? `${value.slice(0, SHOW_MAX)}…` : value;
      } catch (e) {
        // オプション画面は生成できない条件を保存しないので、通常は来ない
        pw.textContent = e.message;
        pw.classList.add("err");
        copy.disabled = true;
      }

      // ポップアップはフォーカスを持っているので navigator.clipboard がそのまま使える
      copy.onclick = async () => {
        clearTimeout(copy.timer);
        try {
          await navigator.clipboard.writeText(value);
          copy.innerHTML = CHECK_ICON;
          copy.title = "コピーしました";
          copy.classList.add("done");
        } catch {
          copy.innerHTML = FAIL_ICON;
          copy.title = "コピーできませんでした";
          copy.classList.add("failed");
        }
        copy.timer = setTimeout(() => {
          copy.innerHTML = COPY_ICON;
          copy.title = "コピー";
          copy.classList.remove("done", "failed");
        }, 1500);
      };

      row.append(pw, copy);
      li.append(label, row);
      return li;
    }),
  );
}

let { presets } = await loadSettings();
render(presets);
onPresetsChanged(async () => {
  ({ presets } = await loadSettings());
  render(presets);
});
$("version").textContent = `v${VERSION}`;
$("regen").innerHTML = REGEN_ICON;
$("openOptions").innerHTML = GEAR_ICON;
$("regen").onclick = () => render(presets);
$("openOptions").onclick = openEditor;
