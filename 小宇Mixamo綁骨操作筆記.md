# Blender 處理小宇模型 → Mixamo 綁骨 完整操作筆記

**目標**：把「小宇」的 `Kidboy1.fbx` 處理成 Mixamo 能接受的格式，Auto-Rigger 綁上標準骨架後，讓小安的 11 個動作 FBX 能直接套用。

---

## 第 0 步：安裝 Blender（免費）

1. 前往 Blender 官方網站：**https://www.blender.org/download/**（Windows 版）
2. 下載「Blender 4.x」安裝檔（約 200MB）
3. 安裝後，桌面/開始功能表會出現 Blender 圖示
4. 開啟 Blender，選「General」（一般）工作區
5. 確認標題列版本（本筆記以 **4.x** 為準，3.x 介面差異不大）

---

## 第 1 步：匯入 Kidboy1.fbx

1. 在 Blender 左上角選單：**File → Import → FBX (.fbx)**
2. 選擇檔案：
   `C:\Users\Administrator\Desktop\見習與實習\技能考\OPENCODE3D互動網站\小宇人物模型\Fbx_Kidboy1\Kidboy1.fbx`
3. 匯入面板右側，勾選：
   - ☑ **Automatic Bone Orientation**
   - ☑ **Apply Transform**
   - 其他保持預設
4. 按右上角 **Import FBX** 按鈕

> 匯入後畫面中央應該會出現小宇的模型（灰白色）。

---

## 第 2 步：確認是否有骨架（重要檢查）

1. 在右側 **Outliner（大綱視窗）**，檢查是否有「**Armature**」項目：
   - **沒有 Armature** → 表示純靜態網格，照第 3、4 步做
   - **有 Armature，但姿勢奇怪** → 也照第 3、4 步做（先把網格分離）
2. 在 3D 視圖按 **Z** 切到線框模式（Wireframe），確認模型外觀完整

---

## 第 3 步：把姿勢改為 T-Pose（或 A-Pose）

Mixamo 需要手臂「水平張開」的 T-Pose 才能辨識關節。如果小宇原本是自然垂手站立，就必須調整：

### 方法 A：直接旋轉手臂骨骼（最快，若模型有 Armature）
1. 點選右側 Outliner 的 **Armature**，進入 **Pose Mode**（3D 視圖上方下拉選單，或按 **Ctrl+Tab**）
2. 選取上臂骨（`LeftUpperArm`/`RightUpperArm` 或類似名稱）
3. 按 **R** 旋轉，讓手臂水平張開（沿身體側面旋轉約 90 度，直到手臂與地面平行）
4. 再選前臂骨（`LeftLowerArm`/`RightLowerArm`）微調，讓整個手臂呈一直線水平
5. 兩側手臂都調整好後，**此姿勢會是 Mixamo 要的 T-Pose**

### 方法 B：沒有骨骼時，直接編輯網格（若為純靜態網格）
1. 選取模型 mesh，**Tab** 進入 Edit Mode
2. **A** 全選 → 框選或刷選手臂部分
3. **R** 旋轉手臂頂點，讓手臂水平張開
4. 對稱處理左右手（可開 **X 軸鏡像**：Edit Mode → 工具列點對稱圖示）
5. 調整完按 **Tab** 回到 Object Mode

> 技巧：T-Pose 重點是「手臂與地面平行、與身體垂直」，Mixamo 能容忍 A-Pose（微微下垂），但完全下垂的姿勢最容易失敗。

---

## 第 4 步：合併所有網格為單一 Mesh（關鍵）

`Kidboy1.fbx` 有約 8 個分離網格，Mixamo 對多網格容易拒收，必須合併：

1. 在 3D 視圖，**先點選其中一個 mesh**
2. **Shift + 點選**其他所有 mesh（在 Outliner 按住 Shift 全部選取更保險）
3. 按 **Ctrl + J**（Join / 合併）→ 全部變成一個物件

> 檢查：選取後看左下角資訊列，應該只有「1 個選中的物件」。

---

## 第 5 步：確認尺寸與朝向（防止 Mixamo 拒絕）

Mixamo 需要模型「站立、正面朝前、身高合理」：

1. **身高**：選取模型 → **N** 開啟右側側邊欄 → 看 Transform 的 Scale
   - Mixamo 用「公分」，成人約 150~180。小宇是小孩，**把它縮放到約 120~140 公分**
   - 若模型太小（例如 1.2 單位），在 **Object Mode** 按 **S** 縮放，直到側邊欄 Y/Z 軸數值接近 120~140
   - 縮放後按 **Ctrl+A → Scale**（套用縮放）
2. **朝向**：模型要「面對 Mixamo 的 -Y 或 -Z 方向」
   - 若歪斜，選取模型按 **R** 旋轉，讓臉朝鏡頭外（正面朝外）
3. **地面**：確認腳底在 Y=0 地面，不要浮空或陷地

---

## 第 6 步：匯出 FBX（正確設定是成敗關鍵）

1. **File → Export → FBX (.fbx)**
2. 檔名建議：`小宇_Tpose.fbx`，存到專案外獨立資料夾（例如桌面新建「Mixamo輸出」）
3. **右側匯出選單，務必設定**：

   | 選項 | 設定 |
   |---|---|
   | **Include → Limit to** | ☑ **Selected Objects**（只匯出選取的模型） |
   | **Transform → Scale** | **1.00** |
   | **Transform → Apply Scalings** | **FBX All**（或選「-FBX Units Scale」） |
   | **Transform → Apply Transform** | ☑ 勾選 |
   | **Geometry → Apply Modifiers** | ☑ 勾選 |
   | **Geometry → Smoothing** | **Normals Only** |
   | **Armature → Primary Bone Axis** | **+Y** |
   | **Armature → Secondary Bone Axis** | **X**（若沒骨架則略過） |
   | **FBX Version** | **7.4 Binary**（若仍失敗改選 FBX 7.3 / 2013） |

4. 按 **Export FBX**

---

## 第 7 步：上傳 Mixamo

1. 前往 **https://www.mixamo.com**
2. 用 Adobe/Facebook/Google 帳號登入
3. 左側面板按 **Upload Character**
4. 選你剛匯出的 `小宇_Tpose.fbx`（或轉成 **.obj** 再上傳，相容性更好）
5. 若出現綠色/白色的自動標記點，**拖動標記點到正確關節位置**：
   - 手肘、膝蓋、骨盆、頭部、手掌中央、腳底
   - 微調後按 **Next**
6. 等它自動綁骨完成（通常幾秒~一分鐘）

### 失敗時的退路
- 若 FBX 一直失敗 → 在 Blender **File → Export → Wavefront (.obj)** 匯出 OBJ 再上傳
- 若還是失敗 → 回到第 4 步確認已合併、第 5 步確認姿勢與尺寸
- 若面數過高 → 選取模型，加 **Decimate Modifier**（Ratio 設 0.5 以下）再匯出

---

## 第 8 步：下載綁骨後的小宇 FBX（關鍵設定）

綁骨成功後：

1. 右上角 **Download** 按鈕
2. **Format 選 `.fbx`**
3. **Pose 選「T-Pose」**
4. **Skin 選「Without Skin」**（不包含皮膚，方便之後套用 Mixamo 標準骨架）
   - 或選 **"With Skin"**（含蒙皮）也可以，兩者骨架都是 mixamorig 標準
5. 按 **Download**

> 下載下來的 FBX，其骨架會是標準 `mixamorig:Hips`、`mixamorig:LeftArm`… 這套 84 根骨骼，與小安 `Aj.fbx` 完全相同。

---

## 第 9 步：放入專案並告知我

1. 將下載的小宇 FBX 放到：
   `C:\Users\Administrator\Desktop\見習與實習\技能考\OPENCODE3D互動網站\小宇人物模型\`
2. 把檔名改成好記的，例如 `小宇.fbx`
3. 跟我說一聲，我會幫你：
   - 修改 `js/ModelLoader.js` 的 `ANIM_FILES`，把 `model` 指向 `小宇.fbx`
   - 保留所有 11 個動作 FBX（`坐著.fbx`、`摸頭.fbx`、`握手.fbx` 等，這些都是小安骨架的動作，直接共用）
   - 若有貼圖遺失，把 `textures` 補齊並設定材質

---

## 常見問題速查

| 問題 | 解法 |
|---|---|
| Mixamo 說「Character not detected」 | 姿勢不是 T-Pose，回第 3 步 |
| Mixamo 說「Too many polygons」 | 加 Decimate 減面到 <100k |
| 上傳後模型歪斜/縮小 | 回第 5 步確認 Apply Transform、Scale 套用 |
| 下載後動畫對不上 | 確認下載時選 T-Pose + Without Skin；骨架必須是 mixamorig |
| 模型貼圖是黑色的 | 需要把 Character Creator 的貼圖檔（`Std_*.jpg`）放到 FBX 同層 `.fbm` 資料夾，或重新指定材質 |

---

*筆記完成。照第 0~9 步做完，把綁骨後的小宇 FBX 放好，我就能接手改程式碼。*