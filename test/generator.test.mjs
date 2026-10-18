// generator.js は chrome API に触れないので Node から直接読める。
// node --test test/
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PRESETS as PRESETS, COMMON_SYM, findPreset, normalizePreset, generate, poolSize, presetLabel } from "../generator.js";

const N = 300;
const has = (pw, set) => [...pw].some((c) => set.includes(c));

for (const p of PRESETS) {
  test(`${presetLabel(p)}: 長さ・文字種・ルールを守る`, () => {
    const allowed =
      (p.upper ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ" : "") +
      (p.lower ? "abcdefghijklmnopqrstuvwxyz" : "") +
      (p.digit ? "0123456789" : "") +
      (p.sym ? p.symbols : "");
    for (let i = 0; i < N; i++) {
      const pw = generate(p);
      assert.equal(pw.length, p.len);
      for (const c of pw) assert.ok(allowed.includes(c), `${c} は許可されていない`);
      if (p.each) {
        if (p.upper) assert.ok(has(pw, "ABCDEFGHIJKLMNOPQRSTUVWXYZ"));
        if (p.lower) assert.ok(has(pw, "abcdefghijklmnopqrstuvwxyz"));
        if (p.digit) assert.ok(has(pw, "0123456789"));
        if (p.sym) assert.ok(has(pw, p.symbols));
      }
      if (p.ambig) assert.ok(!has(pw, "0O1lI"));
      if (p.alphaStart) assert.match(pw[0], /[A-Za-z]/);
    }
  });
}

test("プリセット id は一意", () => {
  assert.equal(new Set(PRESETS.map((p) => p.id)).size, PRESETS.length);
});

test("findPreset: 未知の id は先頭プリセットに戻す", () => {
  assert.equal(findPreset(PRESETS, "nope"), PRESETS[0]);
  assert.equal(findPreset(PRESETS, undefined), PRESETS[0]);
  assert.equal(findPreset(PRESETS, "pin6").len, 6);
});

test("既定のプリセット (max32) は一般的な記号をすべて使う", () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i++) for (const c of generate(findPreset(PRESETS, "max32"))) seen.add(c);
  for (const c of COMMON_SYM) assert.ok(seen.has(c), `${c} が一度も出ない`);
});

test("使える文字がないとエラー", () => {
  assert.throws(() => generate({ len: 8, upper: false, lower: false, digit: false, sym: true, symbols: "" }));
  assert.throws(() => generate({ len: 2, upper: true, lower: true, digit: true, sym: false, each: true }));
});

test("normalizePreset: Web 版の書き出し (id なし) を読める", () => {
  const web = { name: " 標準 20 ", len: 20, upper: true, lower: true, digit: true, sym: true, symbols: "!@#", exclude: "", each: true, ambig: false, alphaStart: false };
  const p = normalizePreset(web);
  assert.match(p.id, /^[0-9a-f-]{36}$/);
  assert.equal(p.name, "標準 20");
  assert.equal(generate(p).length, 20);
});

test("normalizePreset: 壊れた値を安全な値にそろえる", () => {
  const p = normalizePreset({ id: "x", name: "", len: "999", upper: 1 });
  assert.equal(p.id, "x");
  assert.equal(p.name, "");
  assert.equal(p.len, 128);
  assert.equal(p.upper, true);
  assert.equal(p.symbols, "");
  assert.equal(normalizePreset({ len: 1 }).len, 4);
  assert.equal(normalizePreset({ len: "abc" }).len, 16);
});

test("初期プリセットは normalizePreset しても変わらない", () => {
  for (const p of PRESETS) assert.deepEqual(normalizePreset(p), p);
});

test("除外する文字は使わない", () => {
  const p = { ...findPreset(PRESETS, "max32"), exclude: "^&" };
  assert.equal(poolSize(p), 26 * 2 + 10 + COMMON_SYM.length - 2);
  for (let i = 0; i < N; i++) assert.ok(!/[\^&]/.test(generate(p)));
});

test("presetLabel: 名前が空なら文字種と文字数から作る", () => {
  const labels = PRESETS.map(presetLabel);
  assert.deepEqual(labels, [
    "英大小数字記号32",
    "英大小数字記号20",
    "英大小数字24",
    "英大小数字記号16",
    "英大小数字12",
    "数字6",
  ]);
  const base = normalizePreset({ len: 8 });
  assert.equal(presetLabel({ ...base, upper: true }), "英大8");
  assert.equal(presetLabel({ ...base, lower: true, sym: true }), "英小記号8");
  assert.equal(presetLabel(base), "文字種なし8");
});

test("presetLabel: 名前を付けていればそれを使う", () => {
  assert.equal(presetLabel({ ...PRESETS[0], name: "会社用" }), "会社用");
});

test("normalizePreset: 自動の名前と同じ名前は空にする", () => {
  const base = { ...PRESETS[0], id: "x" };
  assert.equal(normalizePreset({ ...base, name: "英大小数字記号32" }).name, "");
  assert.equal(normalizePreset({ ...base, name: " 英大小数字記号32 " }).name, "");
  // 条件と合わない自動名風の名前は、ユーザーが付けた名前として残す
  assert.equal(normalizePreset({ ...base, name: "英大小数字記号20" }).name, "英大小数字記号20");
  assert.equal(normalizePreset({ ...base, name: "会社用" }).name, "会社用");
});
