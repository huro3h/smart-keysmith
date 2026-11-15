// 書き出しを、一度選んだファイルへの上書きにする(git で管理しているフォルダに置いて差分を見るため)。
//
// 書き出し先は初回に保存ダイアログ(File System Access API の showSaveFilePicker)で選び、
// そのファイルのハンドルを IndexedDB に覚えておく(ブラウザ・プロフィールごと)。
// 拡張だけで使う(platform.js の EXPORT_FILE)。Web 版と、showSaveFilePicker が無いブラウザ(Brave など)では
// これまでどおりテキスト欄に出すだけにする。

const DB_NAME = "export-file";
const STORE = "handles";
const HANDLE_KEY = "exportFile";
const FILE_NAME = "smart-keysmith-settings.json";

export const canPickFile = typeof window.showSaveFilePicker === "function";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// 覚えている書き出し先のハンドル。なければ null
export async function loadExportHandle() {
  try {
    return (await withStore("readonly", (store) => store.get(HANDLE_KEY))) ?? null;
  } catch {
    return null;
  }
}

// 保存ダイアログで書き出し先を選ぶ。キャンセルなら null
async function pickHandle(current) {
  try {
    const handle = await window.showSaveFilePicker({
      id: DB_NAME, // 前回選んだフォルダから開く
      suggestedName: current ? current.name : FILE_NAME,
      ...(current ? { startIn: current } : {}),
      types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
    });
    await withStore("readwrite", (store) => store.put(handle, HANDLE_KEY));
    return handle;
  } catch (e) {
    if (e?.name === "AbortError") return null;
    throw e;
  }
}

// text を書き出し先に上書きする。ボタンを押した処理の中で呼ぶ(ダイアログと許可の確認にクリックが要る)。
// choose なら覚えている書き出し先を使わずに選び直す。
// 戻り値: { name } 書き出したファイル名 / null キャンセル。canPickFile が false なら呼ばない。
// ファイルが消された・移動されたなどで書けなければ例外(選び直してもらう)。
export async function exportToFile(text, { choose = false } = {}) {
  const current = await loadExportHandle();
  let handle = choose ? null : current;
  // 書き込みの許可はブラウザを再起動すると確認し直しになる。断られたら選び直してもらう
  if (handle && (await handle.queryPermission({ mode: "readwrite" })) !== "granted") {
    if ((await handle.requestPermission({ mode: "readwrite" })) !== "granted") handle = null;
  }
  if (!handle) {
    handle = await pickHandle(current);
    if (!handle) return null;
  }
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
  return { name: handle.name };
}
