# PLS OSCE 3D 虛擬互動網站 — 系統規格與改版指南

> 版本基準：`20260803i`（2026-08-03）
> 專案路徑：`C:\Users\Administrator\Desktop\見習與實習\技能考\OPENCODE3D互動網站`
> 線上網址：https://hunter163703-debug.github.io/PLS-OSCE-version1-3D/
> Repo：https://github.com/hunter163703-debug/PLS-OSCE-version1-3D
> 適用個案：3D 模擬病人「小安」（學前兒童）

---

## 目錄

1. 系統總覽
2. 檔案結構與模組職責
3. 版面配置（UI）
4. 測驗流程
5. 3D 人物與動畫系統
6. 圖卡系統與座標
7. 麥克風／語音辨識機制
8. 語音輸出（小安說話）機制
9. 腳本狀態機（逐題觸發條件）
10. 計時器
11. 結束提示
12. Cache busting（版本號）機制
13. **改版指南（版本二／版本三 SOP）**
14. Git 與 GitHub 發布

---

## 1. 系統總覽

- 純前端網站：Three.js r160（unpkg CDN，importmap）+ 原生 ES Module，**無建構工具**
- 語音辨識：瀏覽器內建 Web Speech API（`zh-TW`，連續辨識）
- 語音輸出：優先播放**真人錄音 MP3**，其次 SpeechSynthesis TTS，最後備援 `小安.MP3`
- 設計原則：高對比、16pt 字級、一屏無捲動、臨床考試無干擾
- 本機測試：`python -m http.server 8000` → `http://127.0.0.1:8000/index.html`
- 部署：GitHub Pages（HTTPS，麥克風權限可用）

---

## 2. 檔案結構與模組職責

```
OPENCODE3D互動網站/
├── index.html                  版面骨架、進度樹、結束遮罩、importmap、版本號入口
├── calibrate.html              圖卡 UV 座標校準工具（獨立頁面）
├── css/
│   └── style.css               高對比 UI、一屏佈局、計時器/閃爍動畫、finger icon
├── js/
│   ├── main.js                 主程式：模組組裝、Speech 引擎、計時器、UI 事件、渲染迴圈
│   ├── SceneSetup.js           Three.js 場景、相機、燈光、圖卡平面、指認標記(marker)
│   ├── ModelLoader.js          FBX 載入、AnimationMixer、Crossfade、動畫佇列
│   ├── InteractionLogic.js     腳本狀態機：語音→動作/口語/指圖卡、進度追蹤
│   └── VoicePlayer.js          語音輸出：腳本 MP3 優先 → TTS → 備援 MP3（佇列）
├── 模擬病人：3D 模擬人物小安/    小安.fbx + 11 個動畫 FBX
├── 測驗題本圖片檔/              封面.JPG、圖卡一.png、圖卡二.png、圖卡三.png、圖卡四.JPG、圖卡五.JPG
├── 小安腳本語音(口語回應使用)/   12 個真人錄音 MP3
├── 小安.MP3                    4.7 秒備援音檔
├── 將此 OSCE 腳本更改為 Markdown 格式產出給我.md   版本一腳本原文
├── 進度筆記與工作日誌.md         開發日誌（本文件為系統規格，兩者相輔）
└── 分鏡參考/                   動畫補製參考圖
```

---

## 3. 版面配置（UI）

```
┌────────────────────────────────────────────────────────────┐
│ 頂欄 #topbar（黑底）                                        │
│  ├ 左 #topbar-left：H1 標題 + #timerBox（計時器列）          │
│  └ 右 #statusBadge（黃底：小安狀態）                         │
├──────────────────────────────────┬─────────────────────────┤
│ #stage（左，佔 2/3）              │ #panel（右，佔 1/3）      │
│  ├ <canvas> 3D 人物（佔上 60%）   │  ├ 麥克風/語音（按鈕+狀態）│
│  ├ #cardOverlay 圖卡（下 40%）    │  ├ 考生輸入語音 #userText │
│  │   ├ <img id="cardImg">        │  ├ 圖卡控制（一/二/四）   │
│  │   └ #fingerIcon 👆            │  ├ 測驗進度 #progress     │
│  ├ #caption 字幕                  │  └ 重置腳本狀態按鈕        │
│  └ #bubble 對話雲（右上白氣泡）    │                          │
├──────────────────────────────────┴─────────────────────────┤
│ #examEndOverlay 結束提示遮罩（全屏蓋住）                      │
└────────────────────────────────────────────────────────────┘
```

- `body` 為 flex column，`#layout` 以 `flex:1;min-height:0` 填滿剩餘高度（頂欄高度自適應）
- 全域隱藏捲動條；`--min:16pt` 最小字級
- 右側進度樹：`.phase`（階段）→ `.sub-item`（題目），`data-q` 對應 `InteractionLogic` 的題目鍵名；狀態 class：`active`（當前階段）/ `current`（當前題）/ `done`（完成題）

---

## 4. 測驗流程

```
開啟網站（顯示「封面」＋ 3D 小安坐姿）
  → 考生手動啟動麥克風
  → 考生第一次口語輸入 ⇒ 計時器啟動（見 §10）
  → 分測驗二練習題（拍拍手/摸摸頭/握握手，無需圖卡）
  → 第1題（複合指令：點頭，無需圖卡）
  → 【考生手動按「圖卡一」】第2~15題（語言理解）
  → 【考生手動按「圖卡二」】第28題：朗讀故事×2 → 五題問答
  → 【考生手動按「圖卡四」】分測驗四：第16題、第17題
  → 第17題語音播畢 → 停頓 2 秒 → 顯示結束提示遮罩
```

**重要設計**：初始圖卡為「封面」；`state.currentCard` 決定哪些題目可觸發（圖卡一題群只在 `currentCard==='圖卡一'` 時匹配，圖卡四題群同理），避免跨卡誤觸。

---

## 5. 3D 人物與動畫系統

### 5.1 模型

- `小安.fbx`：載入後縮放至身高 `1.55`（世界單位），置中、腳底抬高 `0.15`、Z 軸後移 `-0.55`
- 相機：`main.js` 依 bounding box 動態計算——斜上方俯視、聚焦上半身（畫面高度涵蓋 55% 身高），確保臉部/胸口入鏡
- 黑色材質自動修正為 `0x888888`；metalness 上限 0.2

### 5.2 動畫對照表（`ModelLoader.js` → `ANIM_FILES`）

| 動畫 key | FBX 檔案 | 用途 |
|----------|----------|------|
| `sit` | 坐著.fbx | 預設坐姿（LoopRepeat，開場即播） |
| `clap` | 拍拍手.fbx | 練習題一 |
| `touchHead` | 摸頭.fbx | 練習題二 |
| `handshake` | 握手.fbx | 練習題三 |
| `nod` | 點點頭.fbx | 第1題、故事第二次聽完、靜默回應 |
| `yes` | 是.fbx | 贊同（備用） |
| `point` | 指.fbx | 指圖卡物品（播一次後移動 marker） |
| `speak` | 說話.fbx | 口語回答時（loop，約 2.2~2.8 秒後回坐姿） |
| `distract` | 分心-站.fbx | 第14題（loop）、故事第一次聽完 |
| `greet` | 打招呼.fbx | 打招呼指令 |
| `shakeHead` | 搖頭.fbx | 第14/16題「沒有了/不說話」、無效追問 |

### 5.3 播放機制（`ModelManager.play(name, {once, loop, onDone, fade})`）

- Crossfade：Three.js 原生 `fadeIn()/fadeOut()`（fade 預設 0.35s）
- `once:true` 動畫結束自動 crossfade 回 `sit` 並觸發 `onDone`
- 動畫播放中接到新指令 → 進佇列，前動作完成後依序執行
- `sequence(steps)`：支援多動作序列（如「先點頭再…」）

---

## 6. 圖卡系統與座標

### 6.1 圖卡檔案（`main.js` → `CARD_FILES`）

`封面.JPG`、`圖卡一.png`、`圖卡二.png`、`圖卡三.png`、`圖卡四.JPG`、`圖卡五.JPG`
面板按鈕僅提供：圖卡一、圖卡二、圖卡四（依腳本需求增減）。

### 6.2 座標定義（重要）

- `CARD_ITEMS`（`InteractionLogic.js`）使用**完整圖片 UV**：左下 `(0,0)` → 右上 `(1,1)`
- 3D 圖卡平面紋理**裁切下方 12%**（`tex.repeat=(1,0.88)`、`offset=(0,0.12)`，遮掉題本說明欄）
- 換算分工：
  - 3D marker（`SceneSetup.showPointMarker`）：`vPlane = (v - 0.12) / 0.88` → 平面局部座標 → `localToWorld` → marker 面向相機、閃爍
  - HTML 👆（`main.js showFingerTap`）：以 `#cardImg` 實際渲染矩形直接映射（`x=left+u*W`、`y=top+(1-v)*H`），顯示 1.5 秒
- 指多物（`_pointToItems`）：point 動畫只播一次，之後依序移動 marker＋👆，每物停留 1500ms、間隔 400ms

### 6.3 目前座標（版本一，已校準）

```js
'圖卡一': 蘋果[0.226,0.816] 手套[0.502,0.833] 香蕉[0.766,0.813]
         牛奶[0.491,0.488] 報紙[0.496,0.166] 杯子[0.755,0.188] 手錶[0.238,0.188]
'圖卡四': 背書包[0.663,0.073]
```

### 6.4 校準工具 `calibrate.html`

選圖卡 → 表格點物品 → 點擊圖片中心（可重複修正）→ 複製產生的 `CARD_ITEMS` JS → 貼給 OpenCode 寫回。新增物品只需在 `CARDS` 常數加一行。

---

## 7. 麥克風／語音辨識機制（`main.js` Speech 模組）

### 7.1 三旗標設計

| 旗標 | 意義 |
|------|------|
| `desiredOn` | **考生意圖**：手動開= true，手動關= false（`listening` getter 回傳此值） |
| `paused` | 小安說話中的暫停（防回音），不影響考生意圖 |
| `active` | 辨識引擎實際運行中 |

### 7.2 行為規則

- 手動開關：右側「啟動/停止麥克風」按鈕
- 小安說話：`voice.onSpeakStart → Speech.pauseAuto()`（狀態列顯示「小安說話中（暫停收音）」，按鈕不變）
- 小安說完：`voice.onSpeakEnd → Speech.resumeAuto()`，**只要考生沒手動關閉，保證自動恢復**
- 引擎自然結束（`onend`）：150ms 後自動重啟（`desiredOn && !paused` 時）
- 錯誤處理（`onerror`）：僅 `not-allowed`/`service-not-allowed`/`audio-capture` 真正關閉；`no-speech`（約 5 秒靜音）、`aborted` 視為暫時性，自動重啟
- 防重複：同一句 final transcript 只觸發一次 `onResultCb`
- interim + final 即時顯示於右側 `#userText`

---

## 8. 語音輸出機制（`VoicePlayer.js`）

### 8.1 優先順序

1. **腳本 MP3**（`SCRIPT_VOICES` 映射表，真人錄音）：文字去除標點後**完全比對** key
2. **TTS**：SpeechSynthesis zh-TW（rate 1.02 / pitch 1.06 模擬兒童）
3. **備援**：`小安.MP3`（4.7 秒固定音檔）

### 8.2 佇列機制

`speak()` 推入 `_queue`，前一句 `onended/onend` 後才播下一句（杜絕搶話中斷）。`busy` getter 供結束提示判斷是否播完。建構時預載全部腳本 MP3。

### 8.3 目前腳本 MP3（12 個）

`媽媽`、`看大象`、`看大象2`（第二次「看大象」自動切換）、`坐車車`、`爸爸`、`揹書包`、`妹妹揹`、`早上的時候`、`在家裡`、`鞋子`、`沒有`、`起床了妹妹穿衣服刷牙揹書包`

> 新增句子：把 MP3 放進 `小安腳本語音(口語回應使用)/`，並在 `SCRIPT_VOICES` 加一行 `'句子文字': '路徑.mp3'`。

---

## 9. 腳本狀態機（`InteractionLogic.js`）

### 9.1 核心機制

- `handleUtterance(text)`：`_busy` 鎖防重入；比對字串前先 `去空白 + toLowerCase`
- **判斷順序即正義**：條件「具體」的題目必須排在「寬鬆」題目之前（血淚教訓：題目4 曾攔截 5/6/8/10 題，題目2 曾攔截 13 題，故事優先層曾攔截 16/17 題）
- 頂層優先序：① 故事問答（已聽過故事且非圖卡四）→ ② 故事朗讀偵測 → ③ 第1題 → ④ 練習題 → ⑤ 圖卡一題群 → ⑥ 圖卡二/三 → ⑦ 圖卡四題群 → 未匹配（小安靜默）
- `setPhase(phase, q)`：標記進度樹 + 檢查全部完成；`_finishExam()`：第17題直接結束
- 追問狀態：`askedFoodAll/foodProgress`、`yellowAsked/yellowProgress`（`reset()` 全數歸零）

### 9.2 逐題觸發條件與反應（版本一）

| 題目 | 觸發關鍵詞（AND 以 + 表示） | 小安反應 |
|------|----------------------------|----------|
| 練習1 | 拍拍手/拍手 | clap 動畫 |
| 練習2 | 摸摸頭/摸頭 | touchHead 動畫 |
| 練習3 | 握握手/握手 | handshake 動畫 |
| Q1 | （先/然後/再）+點頭+（閉眼/閉起來） | nod 動畫 |
| Q2 | 手套+（哪/指/出來/看看） | point → 指「手套」 |
| Q3 | 飛機 / 有沒有+圖 | 口語「沒有。」(MP3) |
| Q4 | （蘋果/香蕉/牛奶）+（哪/在/指出/指） | 依序指 香蕉→牛奶→杯子 |
| Q5 | 手錶+香蕉+（指/出） | 依序指 手錶→香蕉→牛奶 |
| Q6 | （不要指/不要）+（蘋果/杯子）+牛奶 | 指 牛奶 |
| Q7 | 杯子+上面 | 指 杯子 |
| Q8 | 蘋果+下面 | 指 蘋果 |
| Q9 | 水果+（全部/指出/出來/指） | 依序指 蘋果→香蕉 |
| Q10 | 猴子 / 沒有+（香蕉/蘋果） / 如果 | 指 蘋果 |
| Q11 | 紅色 / 顏色+紅 | 依序指 報紙→蘋果→香蕉 |
| Q12 | 黃色 / 顏色+黃 | 指 牛奶（不說話）；追問「還有呢」→ 指 香蕉 |
| Q13 | 手套+報紙+中間 | 指 手套 |
| Q14 | 食物+（全部/指出/出來/指） | distract 5 秒 → 指 蘋果；追問 → 指 香蕉、牛奶；再追問 → 搖頭 |
| Q15 | （戴/帶/穿）+（手上/手） | 依序指 手套→手錶 |
| Q28 朗讀 | 故事關鍵詞（動物園/小明/媽媽/火車站/爸爸…） | 第1次：靜默3秒→distract；第2次：nod |
| Q28-Q1 | 誰+（去玩/玩/一起） | 口語「媽媽。」(MP3) |
| Q28-Q2 | 去哪/哪裡/地方 | 口語「看大象。」(MP3) |
| Q28-Q3 | 坐/車/交通工具 | 口語「坐車車。」(MP3) |
| Q28-Q4 | 誰+（火車站/送/開車） | 口語「爸爸。」(MP3) |
| Q28-Q5 | 怎麼 / 去+車站 | 口語「看大象。」（第2次自動換看大象2.mp3） |
| Q16 | 圖卡四+（做什麼/說說/揹書包…） | 口語「揹書包。」+ 👆 指背書包 |
| Q16 追問 | 誰+揹書包 → 「妹妹揹。」；什麼時候 → 「早上的時候。」；哪裡/地方 → 「在家裡。」；東西 → 「鞋子。」；事情+做 → 搖頭不語 | （皆 MP3） |
| Q17 | **必須含「小美」**+（說/做什麼/從頭到尾/再） | 口語「起床了，妹妹穿衣服，刷牙，揹書包。」(MP3) → 結束 |

### 9.3 進度樹題目鍵名（`data-q`）

`練習題一~三`、`語言理解題目一~十五`、`語言理解題目二十八`、`口語表達題目一~二`
`PHASE_TOTALS`：練習題 3、語言理解 16、口語表達 2。

---

## 10. 計時器（`main.js` → `examTimer`）

- 位置：頂欄左側、H1 下方（`#timerBox`）
- 啟動：考生**第一次口語輸入**（`Speech.onResult` 觸發 `examTimer.start()`，僅一次）
- 顯示：`mm:ss / 10:00`（每秒更新）
- 8:00 → 右側**黃底閃爍**「還剩 2 分鐘」（`timerBlink` 0.9s）
- 10:00 → **紅底閃爍**「施測時間已到，請離場」並停止計時（不關麥克風）
- 「重置腳本狀態」按鈕歸零

---

## 11. 結束提示

- 觸發：第17題 `_finishExam()`（或全部階段完成）
- 時機：等 `voice.busy === false`（最後一句播完）→ **再延遲 2 秒**（考生記錄時間）→ 顯示遮罩
- 文字：「施測尚未結束，請接續完成紙本題目當中黑色框框的部分，共計有 12 個位置要填寫，請仔細確認！」
- `examEndScheduled` 防重複；重置按鈕會歸零並隱藏遮罩

---

## 12. Cache busting（版本號）機制

- `index.html` 引用：`css/style.css?v=YYYYMMDDx`、`js/main.js?v=...`
- `main.js` 內部 import：`SceneSetup/ModelLoader/InteractionLogic/VoicePlayer.js?v=...`（四支同版號）
- Console 開頭印 `[Main] 版本：YYYYMMDDx` 供現場確認
- **每次改動 JS/CSS 後全數遞增版號**（a→b→c…），測試時 `Ctrl+F5` 強制重整

---

## 13. 改版指南（版本二／版本三 SOP）⭐

### 13.1 你需要準備給 OpenCode 的東西

1. **新版腳本**（Markdown 或逐題文字：考生說法 + 小安動作/口語回應 + 使用圖卡）
2. **新錄音 MP3**（若有新口語句子，命名規則同現有：以句子文字命名）
3. **新圖卡圖片**（若題本圖卡不同；同圖卡則免）
4. **新動畫 FBX**（若腳本需要現有 11 個以外的動作）
5. 差異說明：題數、計時長度、結束提示文字是否不同

### 13.2 OpenCode 會調整的位置

| 改動 | 檔案 | 位置 |
|------|------|------|
| 題目觸發關鍵詞與反應 | `js/InteractionLogic.js` | `handleUtterance` 題群區塊（遵守「具體優先」排序） |
| 口語句子 → MP3 映射 | `js/VoicePlayer.js` | `SCRIPT_VOICES` |
| 圖卡物品座標 | `js/InteractionLogic.js` | `CARD_ITEMS`（用 `calibrate.html` 校準） |
| 圖卡檔案/按鈕 | `js/main.js` + `index.html` | `CARD_FILES`、圖卡控制按鈕 |
| 題數與進度樹 | `js/InteractionLogic.js` + `index.html` | `PHASE_TOTALS`、`.phase/.sub-item`、`data-q` |
| 結束條件與提示文字 | `js/InteractionLogic.js` + `index.html` | `_finishExam` 觸發點、`#examEndOverlay` |
| 計時長度/提醒點 | `js/main.js` | `examTimer` 的 `TOTAL_SEC`/`WARN_SEC` |
| 新動畫 | `js/ModelLoader.js` | `ANIM_FILES` |
| 版號遞增 | `index.html` + `js/main.js` | 全部 `?v=` |

### 13.3 建議做法

- **另開資料夾或 repo branch** 複製整個專案再改（保留版本一可回溯）
- 流程：貼腳本 → 我改狀態機 → 你校準圖卡座標 → 補錄音 → 逐題實機測試 → 版號遞增 → push 發布

### 13.4 驗收測試清單

- [ ] Console 顯示新版號；`Ctrl+F5` 後無 404、無 SyntaxError
- [ ] 初始畫面正確（封面 or 新版本指定圖卡）
- [ ] 每一題：說出考生指令 → 動畫/口語/指圖卡/對話雲正確
- [ ] 寬鬆關鍵詞題目不攔截後面的題目（用「易混淆句」測試）
- [ ] 麥克風：小安說話暫停→說完自動恢復；靜音 10 秒仍保持聆聽
- [ ] 計時器：首次口語啟動、提醒點閃爍、結束點停止
- [ ] 結束提示在末題語音播完 + 緩衝後出現
- [ ] GitHub Pages 線上版同步驗證

---

## 14. Git 與 GitHub 發布

- Repo：`hunter163703-debug/PLS-OSCE-version1-3D`（public），分支 `main`
- `.gitignore`：`測試影片1.mp4`、`Thumbs.db`、`desktop.ini`
- 更新流程：`git add -A` → `git commit` → `git push`（Pages 1~3 分鐘自動更新）
- 對 OpenCode 說「**推到 GitHub**」即可（已全域安裝 `connect-github` 技能）
- 新版本建議：另建 repo（如 `PLS-OSCE-version2-3D`）或同 repo 開 `version-2` branch + Pages 子路徑
