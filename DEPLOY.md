# 方法二：完整實行步驟（部署到 Vercel，用手機開網站）

## 這個方法在做什麼？

- **目標**：把「Solo Leveling Equation」這個網站放到網路上，得到一個**固定網址**（例如 `https://solo-leveling-xxx.vercel.app`）。
- **好處**：之後用手機、任何電腦，只要在瀏覽器輸入這個網址就能開啟，不需要在同一 Wi‑Fi 或 localhost。
- **做法**：用 **Vercel** 免費代管你的 Next.js 專案，約 2～5 分鐘可完成。

---

## 事前準備（只需要一次）

- 一個 **GitHub 帳號**（若沒有可到 [github.com](https://github.com) 免費註冊）
- 一個 **Vercel 帳號**（可用 GitHub 登入，等於不用多註冊）

---

## 第一階段：把專案放到 GitHub

這樣 Vercel 才能從 GitHub 拉程式碼來建置與部署。

### 1. 在 GitHub 建立一個新倉庫（Repository）

1. 登入 [github.com](https://github.com)。
2. 右上角點 **+** → **New repository**。
3. **Repository name** 填：`solo-leveling-system`（或你喜歡的名稱）。
4. 選擇 **Public**，**不要**勾選 "Add a README file"。
5. 點 **Create repository**。
6. 建立後會看到一個網址，長得像：  
   `https://github.com/你的帳號名稱/solo-leveling-system.git`  
   先複製或記住這個網址，下一步會用到。

### 2. 在本機專案資料夾用終端機推送到 GitHub

1. 打開 **終端機**（Terminal），進入你的專案資料夾，例如：
   ```bash
   cd /Users/hokamyuentommy/Documents/solo-leveling-system
   ```
2. 確認目前已在正確資料夾後，依序執行下面指令（把 `你的帳號名稱` 換成你的 GitHub 使用者名稱）：

   **若這個資料夾還沒用過 Git 連到任何遠端：**
   ```bash
   git remote add origin https://github.com/你的帳號名稱/solo-leveling-system.git
   git branch -M main
   git add .
   git commit -m "Prepare for deploy"
   git push -u origin main
   ```

   **若已經有 `origin` 且就是你的 GitHub 網址，只需推送：**
   ```bash
   git add .
   git commit -m "Prepare for deploy"
   git push -u origin main
   ```

3. 若有提示輸入 GitHub 帳號密碼，請用 **Personal Access Token** 當密碼（GitHub 已不支援用帳密推程式碼，需在 GitHub → Settings → Developer settings → Personal access tokens 建立一個 token）。

完成後，到 [github.com/你的帳號名稱/solo-leveling-system](https://github.com) 應該能看到你的程式碼。

---

## 第二階段：在 Vercel 部署

### 3. 登入 Vercel 並從 GitHub 匯入專案

1. 打開瀏覽器，前往 [https://vercel.com](https://vercel.com)。
2. 點 **Sign Up** 或 **Log In**，選擇 **Continue with GitHub**，依畫面授權 Vercel 讀取你的 GitHub。
3. 登入後，在 Vercel 首頁點 **Add New…** → **Project**。
4. 在 **Import Git Repository** 區塊中，找到 **solo-leveling-system**（或你剛建立的 repo 名稱），點右側 **Import**。
5. 若沒看到你的 repo，點 **Adjust GitHub App Permissions**，把對應的組織或帳號權限打開後再回到這頁重選。

### 4. 設定專案（通常不用改）

1. **Project Name**：可維持 `solo-leveling-system` 或改成你喜歡的名稱（會影響網址前段）。
2. **Framework Preset**：應自動顯示 **Next.js**，保持不變。
3. **Root Directory**：維持 **./** 即可。
4. **Build and Output Settings**：不用改，直接使用預設。

### 5. 開始部署

1. 點下方 **Deploy** 按鈕。
2. 等待約 1～2 分鐘，畫面會顯示建置進度（Building…）。
3. 完成後會出現 **Congratulations** 或 **Visit**，點 **Visit** 會打開你剛部署好的網站。

此時你已經有一個網址，格式類似：

- `https://solo-leveling-system-xxxx.vercel.app`  
  或  
- `https://你設的專案名稱.vercel.app`

**請把這個網址複製或加入書籤。**

---

## 第三階段：用手機開啟網站

1. 拿出手機，打開 **Safari / Chrome / 其他瀏覽器**。
2. 在網址列貼上你剛才複製的 Vercel 網址（例如 `https://solo-leveling-system-xxxx.vercel.app`）。
3. 按下前往。

網站應會正常載入，之後只要用同一個網址，隨時都能在手機或電腦開啟。

---

## 之後若要更新網站內容

1. 在本機專案裡修改程式碼。
2. 在專案資料夾執行：
   ```bash
   git add .
   git commit -m "更新說明"
   git push
   ```
3. 推送到 GitHub 後，Vercel 會自動重新建置並更新你的網址內容，約 1～2 分鐘後重新整理網頁即可看到更新。

---

## 常見問題簡答

| 問題 | 說明 |
|------|------|
| 沒有 GitHub 怎麼辦？ | 到 [github.com](https://github.com) 免費註冊，再從「第一階段」開始。 |
| 不想用 GitHub，可以嗎？ | 可以改用 **方式 B**：在本機執行 `npx vercel login` 登入後，再執行 `npx vercel`，從本機直接部署，不需 GitHub。 |
| 網址可以自訂嗎？ | 在 Vercel 專案 **Settings → Domains** 可綁自己的網域；若用 Vercel 預設網址，會是 `專案名.vercel.app`。 |
| 要付費嗎？ | 個人小專案用 Vercel 免費方案即可，不需付費。 |

---

**總結**：  
第一階段把程式碼推到 GitHub → 第二階段在 Vercel 用「Import」選這個 repo 並 Deploy → 第三階段用手機瀏覽器打開 Vercel 給你的網址。照這三個階段做，就是完整的方法二實行方式。
