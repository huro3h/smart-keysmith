// パスワード生成とプリセットの正規化。chrome API に触れないので Node からテストできる。
// アルゴリズムと初期プリセットは以前の Web 版 (Passgen プリセット) と同じ。

const UP = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LO = "abcdefghijklmnopqrstuvwxyz";
const DG = "0123456789";
// 多くのサイトで通る記号。引用符・バックスラッシュ・括弧・<> などは弾くサイトがあるので入れない
export const COMMON_SYM = "!@#$%^&*-_=+?";
const AMBIG = "0O1lI";
export const MIN_LEN = 4;
export const MAX_LEN = 128;

// name が空のプリセットは presetLabel() が文字種と文字数から名前を作る (「英大小数字記号32」など)
export const DEFAULT_PRESETS = [
  { id: "max32", name: "", len: 32, upper: true, lower: true, digit: true, sym: true, symbols: COMMON_SYM, exclude: "", each: true, ambig: false, alphaStart: false },
  { id: "std20", name: "", len: 20, upper: true, lower: true, digit: true, sym: true, symbols: COMMON_SYM, exclude: "", each: true, ambig: false, alphaStart: false },
  { id: "nosym24", name: "", len: 24, upper: true, lower: true, digit: true, sym: false, symbols: "", exclude: "", each: true, ambig: false, alphaStart: false },
  { id: "max16", name: "", len: 16, upper: true, lower: true, digit: true, sym: true, symbols: "!@#$%&*-_", exclude: "", each: true, ambig: false, alphaStart: true },
  { id: "bank12", name: "", len: 12, upper: true, lower: true, digit: true, sym: false, symbols: "", exclude: "", each: true, ambig: true, alphaStart: true },
  { id: "pin6", name: "", len: 6, upper: false, lower: false, digit: true, sym: false, symbols: "", exclude: "", each: false, ambig: false, alphaStart: false },
];

// 未知の id (削除済みなど) は先頭に戻す
export function findPreset(presets, id) {
  return presets.find((p) => p.id === id) ?? presets[0];
}

// 保存値・読み込んだ JSON (Web 版の書き出しを含む。Web 版には id がない) を正規の形にそろえる
export function normalizePreset(x) {
  const len = Math.round(Number(x?.len));
  const p = {
    id: typeof x?.id === "string" && x.id ? x.id : crypto.randomUUID(),
    name: String(x?.name ?? "").trim(),
    len: Number.isFinite(len) ? Math.min(MAX_LEN, Math.max(MIN_LEN, len)) : 16,
    upper: !!x?.upper,
    lower: !!x?.lower,
    digit: !!x?.digit,
    sym: !!x?.sym,
    symbols: String(x?.symbols ?? ""),
    exclude: String(x?.exclude ?? ""),
    each: !!x?.each,
    ambig: !!x?.ambig,
    alphaStart: !!x?.alphaStart,
  };
  // 自動の名前と同じ文字列は「名前なし」として持つ (条件を変えたら名前も追従させるため)
  if (p.name === presetLabel({ ...p, name: "" })) p.name = "";
  return p;
}

// 表示名。名前を付けていなければ、選んだ文字種と文字数から作る
export function presetLabel(p) {
  if (p.name) return p.name;
  const alpha = p.upper && p.lower ? "英大小" : p.upper ? "英大" : p.lower ? "英小" : "";
  const kinds = [alpha, p.digit && "数字", p.sym && "記号"].filter(Boolean);
  return `${kinds.join("") || "文字種なし"}${p.len}`;
}

const uniq = (s) => [...new Set(s)].join("");

function filt(set, o) {
  const ex = (o.exclude ?? "") + (o.ambig ? AMBIG : "");
  return uniq([...set].filter((c) => !ex.includes(c) && c !== " ").join(""));
}

// 0..n-1 を偏りなく返す (剰余の偏りを棄却法で避ける)
function rand(n) {
  const lim = Math.floor(0x100000000 / n) * n;
  const b = new Uint32Array(1);
  do crypto.getRandomValues(b);
  while (b[0] >= lim);
  return b[0] % n;
}

const pick = (s) => s[rand(s.length)];

// 生成できない条件ならメッセージ付きで throw する。オプション画面の検証にも使う
function prepare(o) {
  const groups = [];
  if (o.upper) groups.push(filt(UP, o));
  if (o.lower) groups.push(filt(LO, o));
  if (o.digit) groups.push(filt(DG, o));
  if (o.sym) groups.push(filt(o.symbols, o));
  const g = groups.filter((x) => x.length);
  if (!g.length) throw new Error("使える文字がありません。文字種か記号を選んでください");
  const alpha = filt((o.upper ? UP : "") + (o.lower ? LO : ""), o);
  if (o.alphaStart && !alpha) throw new Error("先頭英字には大文字か小文字が必要です");
  if (o.each && g.length > o.len) throw new Error("文字数が少なすぎて全文字種を含められません");
  return { g, pool: uniq(g.join("")), alpha };
}

// 候補の文字数 (エントロピー表示用)
export function poolSize(o) {
  return prepare(o).pool.length;
}

export function generate(o) {
  const { g, pool, alpha } = prepare(o);
  const a = Array.from({ length: o.len }, () => pick(pool));
  if (o.each) {
    // 各文字種を異なる位置へ確実に入れる (先頭英字なら先頭は避ける)
    const pos = [...Array(o.len).keys()].filter((i) => !(o.alphaStart && i === 0));
    for (let i = pos.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [pos[i], pos[j]] = [pos[j], pos[i]];
    }
    g.forEach((set, k) => {
      if (k < pos.length) a[pos[k]] = pick(set);
    });
  }
  if (o.alphaStart) a[0] = pick(alpha);
  // 先頭を英字で上書きしたせいで欠けた文字種があれば引き直す
  if (o.each && !g.every((set) => a.some((c) => set.includes(c)))) return generate(o);
  return a.join("");
}
