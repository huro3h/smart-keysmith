// 拡張のロジックを共用して Web 版を dist/ に組み立てる。node build.mjs
// - generator.js / settings.js / popup.js / options.js は拡張のものをそのまま使う
// - platform.js だけ Web 版 (localStorage・編集欄の開け閉め) に差し替える
// - HTML と CSS は Web 版のもの (index.html / web.css)。一覧と編集欄を 1 ページに並べる
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = dirname(fileURLToPath(import.meta.url));
const ROOT = join(WEB, "..");
const DIST = join(WEB, "dist");
const { version } = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
const read = (dir, f) => readFileSync(join(dir, f), "utf8");

// popup.js / options.js は拡張の HTML の id を前提にしている。index.html に足りない id があれば失敗させる
const ids = (html) => new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const have = ids(read(WEB, "index.html"));
const missing = ["popup.html", "options.html"].flatMap((f) => [...ids(read(ROOT, f))].filter((id) => !have.has(id)).map((id) => `${f}#${id}`));
if (missing.length) throw new Error(`index.html に無い id があります: ${missing.join(", ")}`);

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST);
for (const f of ["generator.js", "settings.js", "popup.js", "options.js"]) cpSync(join(ROOT, f), join(DIST, f));
for (const f of ["index.html", "web.css", "_headers"]) cpSync(join(WEB, f), join(DIST, f));
cpSync(join(ROOT, "icons/icon.svg"), join(DIST, "favicon.svg"));

const platform = read(WEB, "platform.js");
if (!platform.includes('"__VERSION__"')) throw new Error("platform.js: __VERSION__ が見つかりません");
writeFileSync(join(DIST, "platform.js"), platform.replace('"__VERSION__"', JSON.stringify(version)));

console.log(`dist/ に Web 版 ${version} を作りました`);
