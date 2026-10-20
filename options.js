import { COMMON_SYM, DEFAULT_PRESETS, findPreset, normalizePreset, generate, poolSize, presetLabel } from "./generator.js";
import { loadSettings } from "./settings.js";
import { writePresets } from "./platform.js";

const $ = (id) => document.getElementById(id);
const CHECKS = ["upper", "lower", "digit", "sym", "each", "ambig", "alphaStart"];
const DG = "0123456789";
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

// 行のボタンのアイコン (Lucide 系の線画。色は currentColor でボタンの文字色に従う)
// 複製は Lucide の copy-plus。重なった四角だけだとクリップボードへのコピーに見えるので「+」付きにした
const DUP_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="15" x2="15" y1="12" y2="18"/><line x1="12" x2="18" y1="15" y2="15"/><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
const DEL_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;

let presets = [];
let editingId = "";

const editing = () => findPreset(presets, editingId);

async function save() {
  await writePresets(presets);
}

// onUndo を渡すと、メッセージの右に「元に戻す」を出す。押したら onUndo を呼び、
// 「元に戻しました」に差し替える (元に戻したことは元に戻せない。やり直しの履歴にはしない)
function toast(text, onUndo) {
  const el = $("status");
  const msg = document.createElement("span");
  msg.textContent = text;
  el.replaceChildren(msg);
  if (onUndo) {
    const undo = document.createElement("button");
    undo.className = "undo";
    undo.textContent = "元に戻す";
    undo.onclick = async () => {
      await onUndo();
      toast("元に戻しました");
    };
    el.append(undo);
  }
  el.classList.add("on");
  clearTimeout(toast.t);
  // 元に戻せる通知は押す間があるよう長めに出す
  toast.t = setTimeout(() => el.classList.remove("on"), onUndo ? 6000 : 1600);
}

// confirm() は使わず画面内で確認する
function ask(text, yesLabel, onYes) {
  $("confirmText").textContent = text;
  $("confirmYes").textContent = yesLabel;
  $("confirmYes").onclick = () => {
    $("confirmBox").hidden = true;
    onYes();
  };
  $("confirmBox").hidden = false;
}
$("confirmNo").onclick = () => ($("confirmBox").hidden = true);

function renderList() {
  const ul = $("presets");
  ul.replaceChildren();
  presets.forEach((p) => {
    const li = document.createElement("li");
    li.dataset.id = p.id;
    li.classList.toggle("editing", p.id === editingId);

    // つかむ場所をハンドルだけに限る (行全体を draggable にすると名前やボタンの操作が効かなくなる)
    const handle = document.createElement("span");
    handle.className = "drag-handle";
    handle.textContent = "⠿";
    handle.title = "ドラッグして並べ替え";
    handle.setAttribute("draggable", "true");

    const name = document.createElement("button");
    name.className = "name";
    name.textContent = presetLabel(p);
    name.onclick = () => selectForEdit(p.id);

    const dup = document.createElement("button");
    dup.className = "row-btn";
    dup.innerHTML = DUP_ICON;
    dup.title = "複製";
    dup.setAttribute("aria-label", `「${presetLabel(p)}」を複製`);
    dup.onclick = () => duplicate(p.id);

    const del = document.createElement("button");
    del.className = "row-btn danger";
    del.innerHTML = DEL_ICON;
    del.title = "削除";
    del.setAttribute("aria-label", `「${presetLabel(p)}」を削除`);
    // 最後の1件は消せない (ポップアップが空になる)
    del.disabled = presets.length <= 1;
    del.onclick = () => remove(p.id);

    li.append(handle, name, dup, del);
    ul.append(li);
  });
  $("editingName").textContent = presetLabel(editing());
}

// ドラッグしている行を、カーソルの下にある行の前に差し込む。null なら末尾
function rowAfter(container, y) {
  let closest = { offset: Number.NEGATIVE_INFINITY, element: null };
  for (const row of container.querySelectorAll("li:not(.dragging)")) {
    const box = row.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) closest = { offset, element: row };
  }
  return closest.element;
}

// DOM の data-id の並びから presets を組み直して保存する (ドラッグ後は描き直さない)
async function persistOrder() {
  const byId = new Map(presets.map((p) => [p.id, p]));
  const reordered = [...$("presets").children].map((li) => byId.get(li.dataset.id)).filter(Boolean);
  if (reordered.length !== presets.length) return; // 取りこぼしたら触らない
  if (reordered.every((p, i) => p === presets[i])) return;
  presets = reordered;
  await save();
}

// リスナーは行ではなくリスト側に置く — renderList() が行を作り直しても生き残るため
function enableDragReorder(listEl) {
  let dragging = null;

  listEl.addEventListener("dragstart", (event) => {
    const handle = event.target.closest(".drag-handle");
    if (!handle) return;
    dragging = handle.closest("li");
    dragging.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", dragging.dataset.id);
  });

  listEl.addEventListener("dragover", (event) => {
    if (!dragging) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const after = rowAfter(listEl, event.clientY);
    if (after == null) listEl.appendChild(dragging);
    else if (after !== dragging) listEl.insertBefore(dragging, after);
  });

  listEl.addEventListener("drop", (event) => {
    if (dragging) event.preventDefault();
  });

  listEl.addEventListener("dragend", () => {
    if (!dragging) return;
    dragging.classList.remove("dragging");
    dragging = null;
    void persistOrder();
  });
}
enableDragReorder($("presets"));

function writeForm(p) {
  // 名前なしのプリセットも、欄には自動の名前を文字として入れておく
  $("name").value = presetLabel(p);
  $("name").placeholder = presetLabel({ ...p, name: "" });
  $("lenNum").value = p.len;
  $("lenRange").value = p.len;
  CHECKS.forEach((k) => ($(k).checked = p[k]));
  $("symbols").value = p.symbols;
  $("symbols").disabled = !p.sym;
  $("symResetBtn").disabled = !p.sym;
}

function readForm() {
  const o = { id: editingId, name: $("name").value, len: $("lenNum").value, symbols: $("symbols").value };
  CHECKS.forEach((k) => (o[k] = $(k).checked));
  return normalizePreset(o);
}

// 記号にチェックがあっても使う記号が空だと、名前に「記号」と付くのに記号が入らない。
// 生成はできるので保存は止めず、警告だけ出す (複製したプリセットで気づかなかったことがある)
function renderSymWarn(p) {
  $("symWarn").textContent = p.sym && !p.symbols.trim() ? "使う記号が空なので、記号は入りません" : "";
}

function renderPreview(p) {
  try {
    const pw = generate(p);
    const bits = Math.round(p.len * Math.log2(poolSize(p)));
    $("pw").replaceChildren(
      ...[...pw].map((c) => {
        if (ALPHA.includes(c)) return c;
        const s = document.createElement("span");
        s.className = DG.includes(c) ? "d" : "s";
        s.textContent = c;
        return s;
      }),
    );
    $("meta").textContent = `${p.len} 文字 / 候補 ${poolSize(p)} 種 / 約 ${bits} bit`;
    $("err").textContent = "";
    return true;
  } catch (e) {
    $("pw").textContent = "—";
    $("meta").textContent = "";
    $("err").textContent = `${e.message}(この内容は保存されていません)`;
    return false;
  }
}

function selectForEdit(id) {
  editingId = id;
  writeForm(editing());
  renderList();
  renderSymWarn(editing());
  renderPreview(editing());
}

// 生成できる内容のときだけ保存する
async function onFormInput(event) {
  // 名前なしのプリセットの欄には古い自動名が入っている。そのまま読むと条件と合わない
  // 固定の名前として保存されてしまうので、名前欄以外の変更では読む前に空にしておく
  const followName = event?.target !== $("name") && !editing().name;
  if (followName) $("name").value = "";
  $("symbols").disabled = !$("sym").checked;
  $("symResetBtn").disabled = !$("sym").checked;
  const p = readForm();
  // 空欄のときに出る自動の名前は、文字種や文字数を変えるたびに追従させる
  $("name").placeholder = presetLabel({ ...p, name: "" });
  if (followName) $("name").value = presetLabel(p);
  renderSymWarn(p);
  if (!renderPreview(p)) return;
  presets[presets.findIndex((x) => x.id === editingId)] = p;
  renderList();
  await save();
}

$("lenRange").oninput = (event) => {
  $("lenNum").value = $("lenRange").value;
  onFormInput(event);
};
$("lenNum").oninput = (event) => {
  const v = Number($("lenNum").value);
  if (v >= 4 && v <= 128) {
    $("lenRange").value = v;
    onFormInput(event);
  }
};
// 空欄 (または自動の名前と同じ名前) で欄を離れたら、欄に自動の名前を入れる
$("name").onchange = () => {
  if (!editing().name) $("name").value = presetLabel(editing());
};
// 範囲外の数字を打ったまま離れたら、保存済みの値に戻す
$("lenNum").onchange = () => ($("lenNum").value = editing().len);
["name", "symbols"].forEach((k) => ($(k).oninput = onFormInput));
CHECKS.forEach((k) => ($(k).onchange = onFormInput));
// 複製したあとで元の記号が分からなくなったときに、初期プリセットの記号へ戻す。
// 手で絞った記号を上書きするので、通知の「元に戻す」で差し戻せるようにする
$("symResetBtn").title = `使う記号を ${COMMON_SYM} にする`;
$("symResetBtn").onclick = () => {
  const { id, symbols } = editing();
  if (symbols === COMMON_SYM) return;
  $("symbols").value = COMMON_SYM;
  onFormInput({ target: $("symbols") });
  toast("使う記号を初期値に戻しました", async () => {
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    p.symbols = symbols;
    await save();
    if (editingId === id) selectForEdit(id);
  });
};
$("regenBtn").onclick = () => renderPreview(readForm());

// 行のボタンからは確認なしで実行する。行に紐づく操作は添字ではなく id で引く
// (ドラッグ後は描き直さないので、描画時の添字は当てにならない)
async function duplicate(id) {
  const i = presets.findIndex((p) => p.id === id);
  if (i < 0) return;
  const src = presets[i];
  // 名前を付けていないプリセットは、複製も自動の名前のまま (設定を変えれば名前も変わる)
  const copy = { ...src, id: crypto.randomUUID(), name: src.name && `${src.name} のコピー` };
  presets.splice(i + 1, 0, copy);
  selectForEdit(copy.id);
  await save();
  toast(`「${presetLabel(src)}」を複製しました`);
}

async function remove(id) {
  const i = presets.findIndex((p) => p.id === id);
  if (i < 0 || presets.length <= 1) return;
  const [removed] = presets.splice(i, 1);
  const wasEditing = editingId === id;
  if (wasEditing) selectForEdit(presets[Math.min(i, presets.length - 1)].id);
  else renderList();
  await save();
  // 元に戻すときは、消したあとの編集を巻き戻さないよう、消した1件だけを元の位置へ差し戻す
  toast(`「${presetLabel(removed)}」を削除しました`, async () => {
    if (presets.some((p) => p.id === removed.id)) return;
    presets.splice(Math.min(i, presets.length), 0, removed);
    if (wasEditing) selectForEdit(removed.id);
    else renderList();
    await save();
  });
}

$("exportBtn").onclick = () => {
  $("io").value = JSON.stringify(presets, null, 1);
  $("io").select();
  toast("書き出しました。コピーして保管してください");
};

$("importBtn").onclick = () => {
  let list;
  try {
    const raw = JSON.parse($("io").value);
    if (!Array.isArray(raw) || !raw.length || !raw.every((x) => x && typeof x.name === "string" && x.len)) throw 0;
    list = raw.map(normalizePreset);
  } catch {
    toast("JSON の形式が正しくありません");
    return;
  }
  // id の重複は振り直す (同じ JSON を手で継ぎ足した場合など)
  const seen = new Set();
  for (const p of list) {
    if (seen.has(p.id)) p.id = crypto.randomUUID();
    seen.add(p.id);
  }
  ask(`今のプリセットを ${list.length} 件のプリセットで置き換えますか?`, "置き換える", async () => {
    presets = list;
    selectForEdit(presets[0].id);
    await save();
    toast(`${list.length} 件のプリセットを読み込みました`);
  });
};

$("resetBtn").onclick = () => {
  ask("プリセットをすべて初期状態に戻しますか?", "初期状態に戻す", async () => {
    presets = structuredClone(DEFAULT_PRESETS);
    selectForEdit(presets[0].id);
    await save();
    toast("初期プリセットに戻しました");
  });
};

({ presets } = await loadSettings());
selectForEdit(presets[0].id);
