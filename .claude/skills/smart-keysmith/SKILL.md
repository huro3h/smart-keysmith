---
name: smart-keysmith
description: smart-keysmith(プリセットごとのランダムパスワードをポップアップに一覧表示してコピーする Chrome 拡張 MV3)を直すとき・機能を足すときに使う。1クリックコピーをやめた経緯、プリセットと自動の名前の持ち方、生成アルゴリズム、E2E での確認方法とハマった点。
---

# smart-keysmith

## 経緯

もとは claude.ai のアーティファクト「Passgen プリセット」(Web ページ)だった。ページを開くのが
面倒なので拡張にした。最初の名前は Passgen だったが、ありきたりなので Smart Keysmith
(鍵職人。プリセットの条件どおりに鍵を作る)に改名した(2026-10-18、1.0.0 リリース前)。
生成アルゴリズムと初期プリセットは Web 版からそのまま移植している(`generator.js`)。プリセットの編集と JSON の書き出し/読み込みはオプション画面に持ってきた。
Web 版の書き出し(`id` なしの配列)をそのまま読めるのは移行のため。

最初は**アイコン1クリックで「使用中」のプリセットをコピーする**作りだった(popup なし、
`action.onClicked` → offscreen document で `execCommand("copy")`、右クリックメニューでプリセット切り替え、
バッジで結果表示)。ユーザーの要望で**ポップアップに全プリセットのパスワードを並べ、横のボタンで
コピーする**形に変えた。そのとき「使用中」の概念・右クリックメニュー・background・offscreen は
すべて消した(`presetId` も保存しない)。戻すときの落とし穴:

- `default_popup` があると `action.onClicked` は発火しない。
- service worker には `navigator.clipboard` がない。offscreen document でも `writeText` は
  フォーカスがなくて失敗するので、textarea + `execCommand("copy")`(`clipboardWrite` 権限)が要る。
- アクションの右クリックメニューは上位 6 件まで(`ACTION_MENU_TOP_LEVEL_LIMIT`)。7 件目以降は
  **エラーにならず黙って表示されない**(Brave Nightly で確認)。

## ファイル構成

| ファイル | 役割 |
| --- | --- |
| `generator.js` | 生成ロジック・`DEFAULT_PRESETS`・`normalizePreset`・`presetLabel`。chrome API に触れない(Node でテストできる) |
| `settings.js` | `loadSettings()`。`platform.js` から読んで正規化する。ポップアップとオプション画面で共用 |
| `popup.html` / `popup.js` / `popup.css` | 全プリセットのパスワード一覧とコピーボタン |
| `options.html` / `options.js` / `options.css` | プリセットの編集画面(`options_ui`, タブで開く) |
| `platform.js` | 拡張に依存する処理 (chrome.storage / manifest の version / オプション画面を開く)。Web 版は `web/platform.js` に差し替わる |
| `web/` | Web 版。下の「Web 版」 |
| `test/generator.test.mjs` | `node --test test/` |

権限は `storage` だけ。background はない。

## ポップアップ

- 開くたびに全プリセットで生成し直す(生成したパスワードはどこにも保存しない)。
- 見た目: 左上に「Smart Keysmith」を小さめのグレーで出し、その右に `chrome.runtime.getManifest().version` を
  薄く添える(manifest の version を上げれば自動で変わる)。右上に「すべて再生成」(rotate-cw)・
  「プリセットを編集」(歯車 settings)をアイコンだけで並べる。コピーボタンも copy アイコンだけで、
  押したら 1.5 秒チェック(失敗時は ×)に変える。アイコンはすべて Lucide 系の線画を `popup.js` に定数で持ち、
  `title` / `aria-label` を付ける。オプション画面の「複製」(copy-plus)とはここで見分けている。
- コピーは `navigator.clipboard.writeText`。ポップアップはフォーカスを持つので権限なしで通る。
- **33 文字以上は先頭 32 文字 + 「…」で表示**(`SHOW_MAX`)。コピーは全文なので、表示文字列ではなく
  生成した値をクロージャで持ってそれを書き込む。表示を選択してコピーすると省略形になってしまうので
  `.pw` に `user-select: all` は付けない。
- オプション画面は生成できない条件を保存しないので、ポップアップで `generate` が throw するのは
  壊れたデータのときだけ。その行はエラー文を出してコピーボタンを無効にする。

## プリセットと保存

- `chrome.storage.local` の `presets`(配列。ポップアップにこの順で並ぶ)だけ。未保存なら
  `DEFAULT_PRESETS` を使う。読むときは必ず `loadSettings()` を通す(`normalizePreset` で欠けた項目を埋める)。
- 初期プリセットの id は `max32` などの固定文字列、追加分は `crypto.randomUUID()`。
- オプション画面は**入力のたびに即保存**(debounce なし。タブを閉じた直後でも取りこぼさない)。
  ただし `generate` が throw する条件(文字種ゼロなど)のときは保存せず、エラーを出すだけ。
  文字数欄に範囲外を打っている途中は保存しない。欄から離れたら保存済みの値に戻す。
- 並べ替えはドラッグ&ドロップ。`smart-reload` / `yt-quick-filter` と同じ作り:
  `draggable` は行頭のハンドル `⠿` だけ(行全体にすると名前ボタンが押せなくなる)、
  リスナーはリスト (`#presets`) 側、ドラッグ後は描き直さず DOM の `data-id` の並びから
  `presets` を組み直して保存する (`persistOrder()`)。行に紐づく操作は添字ではなく
  プリセットのオブジェクト / id で引くこと(描き直さないので描画時の添字は古くなる)。
- **表示名は必ず `presetLabel(p)` を通す**(ポップアップ・一覧・見出し・確認文・名前欄)。
  `name` が空なら「英大小数字記号32」のように文字種と文字数から作るので、設定を変えると名前も追従する。
  Web 版の「最強 32」のような名前が分かりにくいという要望で、初期プリセットはすべて `name: ""` にした。
  名前を付けていないプリセットは、条件を編集したときに名前も追従させる。これが要件。
- **自動の名前と同じ文字列は `name: ""` として持つ**(`normalizePreset`)。手で同じ名前を打った場合や、
  読み込んだ JSON に入っていた場合も追従するようにするため。条件と合わない自動名風の名前
  (32 文字なのに「…20」など)はユーザーが付けた名前として残す。
- 名前欄には、名前なしでも自動の名前を**文字として**入れておく(placeholder ではない。空欄で保存しても
  自動の名前で保存されたように見せる、というユーザーの要望)。そのため `onFormInput` では、名前欄以外の
  変更かつ名前なしのとき、**読む前に欄を空にしてから**読み、読んだあとに新しい自動名を入れ直す。
  空にしないと、欄に残った古い自動名が条件と合わない固定の名前として保存されてしまう。
  空欄のまま欄を離れたとき(`change`)も自動の名前を入れ直す。
- 名前付きを複製すると「〜 のコピー」、名前なしを複製すると名前なしのまま(同じ表示名が並ぶが、
  設定を変えれば分かれる)。
- **複製・削除は行の右端のアイコンボタン**(SVG を `DUP_ICON` / `DEL_ICON` に定数で持つ。
  `title` と `aria-label` を付ける。削除は `simple_memo` と同じゴミ箱。複製は Lucide の copy-plus —
  重なった四角だけだとクリップボードへのコピーに見えるとユーザーに言われ、4 候補を比較して選んでもらった)。**確認なしで実行**し、削除は toast の「元に戻す」で取り消す
  (ユーザーの要望)。toast の作りは `yt-quick-filter` の `showToast(message, onUndo)` に合わせた:
  元に戻したら「元に戻しました」に差し替え、取り消しの取り消しはしない。元に戻せる toast は 6 秒、
  普通の toast は 1.6 秒。
- 元に戻すのは**消した1件を元の位置へ差し戻すだけ**(配列ごとのスナップショット復元にしない)。削除のあとに
  別の編集をしてから「元に戻す」を押しても、その編集を巻き戻さないため。消した行が編集中だったなら、
  戻した行をまた編集中にする。最後の1件の削除ボタンは無効(ポップアップが空になる)。
- 記号にチェックがあるのに使う記号が空(空白だけを含む)だと、名前に「記号」と付くのに記号が入らない。
  記号なしのプリセットを複製して記号を足したときに気づかなかったことがあるので、記号欄の下に警告
  (`renderSymWarn`)を出す。生成はできるので保存は止めない(ユーザーの要望:弾くまではしない)。
- 「使う記号」の右端の「初期値に戻す」ボタンは、使う記号を `COMMON_SYM` にする(複製したあと元の記号を
  思い出せないことがあるという要望)。手で絞った記号を上書きするので、削除と同じく確認なしで実行して
  toast の「元に戻す」で差し戻す。差し戻しは押したときのプリセット id で引く(別のプリセットに移っていても
  そのプリセットだけ戻す)。記号にチェックがないときは記号欄と一緒に無効。
- 読み込み・初期化の確認は `confirm()` ではなく画面内の確認欄で出す。

## 生成アルゴリズム(Web 版と同一)

- 初期プリセットの記号は `COMMON_SYM`(`!@#$%&*-_+=?`)まで。Web 版の「最強 32」(初期プリセットの先頭)は ASCII 記号
  32 種すべてを使っていたが、引用符・`\`・括弧・`<>` などを弾くサイトが多く、使いにくかったので絞った
  (ユーザーの要望)。さらに `^` も弾くサイトがあるので外した(2026-10-20)。`+ = ? .` は
  ユーザーの感覚では多くのサイトで通る。強さは長さで稼ぐ(32 文字で約 199 bit)。

- `rand(n)` は Uint32 の棄却法で剰余の偏りを消している。`Math.random` に置き換えない。
- `each`(各文字種を最低1文字)は、位置をシャッフルして文字種ごとに別の位置へ1文字ずつ
  上書きする。`alphaStart` で先頭を英字に上書きした結果、文字種が欠けることがあるので
  最後に検査して引き直す。

## Web 版 (web/)

`smart-keysmith.huro3h.com`。Cloudflare Workers の静的アセットだけ (Worker のコードなし)。
huro3h.com のゾーンは `huro3h@gmail.com account` (`wrangler whoami` の 1 つ目) にあり、custom domain で
DNS と証明書は自動で付く。`wrangler.jsonc` は account_id が入るので git 管理外、`wrangler.example.jsonc` を追跡する。

- UI は claude.ai のアーティファクト版 (ユーザーが作ったもの) に合わせた 1 ページ構成: 上にポップアップと同じ
  パスワード一覧、歯車で下に編集欄 (#settings) を開け閉めする (遷移しない。開いているかは localStorage に覚える)。
  一番下に「仕組み」の details。アーティファクトは公開範囲がプランで絞られるおそれがあるので自分のドメインで運用する。
- ロジックは拡張と共用する。拡張に依存するのは `platform.js` だけ(保存先・`onPresetsChanged`・`VERSION`・`openEditor`)。
  **新しく chrome API を使うときは `platform.js` に足し、`web/platform.js` にも同じ名前で実装する**。
  編集欄で保存すると `onPresetsChanged` で一覧を描き直す (拡張では chrome.storage.onChanged)。
- HTML と CSS は Web 版専用 (`web/index.html` / `web/web.css`)。拡張の popup.css と options.css は `.pw` などが
  ぶつかるので読まない。`index.html` の id は popup.html / options.html と同じにする。**`build.mjs` は拡張の HTML の
  id が index.html に全部あるか検査する**ので、拡張のフォームに欄を足したら index.html にも足す。
  共用 JS が付けるクラスを変えたら web.css も合わせる。
- スマホ: HTML5 のドラッグはタッチでは始まらない (iOS は長押しが要る) ので、`enableDragReorder` に
  Pointer Events (`pointerType !== "mouse"`) で指を追う経路を足した。マウスは HTML5 のまま。ハンドルに
  `touch-action: none` が要る (web.css。無いと指の動きがスクロールに取られる)。行を DOM で動かすと
  ポインターキャプチャが外れることがあるので move / up は window で受ける。`(pointer: coarse)` で当たり判定を広げた。
  確認は `hasTouch` / `isMobile` のコンテキストで CDP の `Input.dispatchTouchEvent` を送る。iPhone の Chrome と Safari の
  実機で確認済み (2026-10-20)。
- iPhone の Chrome (WKWebView) は中身が画面より短いとバウンスせず、引っ張ってリロードが効かない。編集欄を閉じた
  一覧は画面より短いので、`(pointer: coarse)` で body を `calc(100lvh + 1px)` にしている (実機で直ったことを確認)。
- ファビコンは `icons/icon.svg` をビルドでそのままコピーする (拡張のアイコンを直せば Web 版も変わる)。
  iPhone のホーム画面用の `web/apple-touch-icon.png` (180px) は、iOS が透明部分を黒く塗るので白地に鍵を 7 割で置いた
  `web/apple-touch-icon.svg` から `rsvg-convert` で書き出して追跡している。鍵の形や色を変えたらこちらも直して書き出し直す。
- バージョン表示は manifest.json の version をビルドで埋め込む。拡張を上げたら `npm run deploy` し直す。
- `web/_headers` の CSP は `connect-src 'none'`・inline script なし。共用コードに inline script や
  外部読み込みを入れると Web 版で動かなくなる。
- 確認は `npm run dev` (wrangler dev) に Playwright で。`localhost` は clipboard 権限を `grantPermissions` で付けられる。

## E2E で確認するとき

`browser-testing` skill の Recipe B(Playwright + Brave Nightly)で読み込む。

- background がないので service worker から拡張 id を取れない。**未パッケージ拡張の id は
  ディレクトリの絶対パスの SHA-256 の先頭 32 桁(hex)を `a`〜`p` に写したもの**なので、Node 側で計算する。
- オプション画面もポップアップも `chrome-extension://<id>/options.html` / `popup.html` を普通のタブで
  開けばそのまま動く。storage はその拡張ページの `page.evaluate(() => chrome.storage.local.get(null))` で読める。
- **ツールバーアイコンのクリックは Playwright から押せない**ので、ポップアップが開くこと自体は手動で確認する。
- 歯車を押したときに**オプション画面のタブがもう開いていると、Chrome は新しいタブを開かずにそのタブを
  前に出すだけ**。新しいタブが開くのを待つテストは、先にオプション画面のタブを閉じておく。
- ドラッグは `page.dragAndDrop('#presets li:nth-child(3) .drag-handle', ...)` で本物の HTML5 ドラッグが起きる。
- コピー結果は `pbpaste` で読む(実機の OS クリップボードに入る = 自分のクリップボードを上書きする)。
  `grantPermissions` で `chrome-extension://` の origin に clipboard-read を付けようとすると
  "Permission can't be granted to opaque origins" で失敗する。ポップアップのタブは `bringToFront()` してから
  コピーボタンを押す(フォーカスがないと `writeText` が失敗する)。

## README のスクリーンショット

`docs/popup.png`(380px 幅の body)と `docs/options.png`(720px 幅のフルページ)。どちらも
**新しいプロファイルの初期プリセットのまま**、`deviceScaleFactor: 2` で撮る(公開リポジトリなので、
テストで作ったプリセット名などを写さない)。拡張ページを普通のタブで開けば撮れるので、E2E と同じ
読み込み方で `popup.html` は `locator('body').screenshot()`、`options.html` は `fullPage: true`。
見た目を変えたら撮り直す。

## アイコン

`icons/icon.svg`(鍵の線画)から `rsvg-convert` で 16/32/48/128 を書き出す。

色はワークスペース標準の `#1A73E8` ではなく**ターコイズの `#0FA3B1`**(ユーザーの個人的な好み)。
`#0FA3B1` / `#00B5B8` / `#0E8C99` を明るい・暗いツールバーに並べて比べ、両方で見やすい
(コントラスト比 白地 3.0 / 暗地 4.0)`#0FA3B1` を選んでもらった。ポップアップやオプション画面の
アクセント色(`#1a73e8`)はアイコンとは別で、変えていない。
