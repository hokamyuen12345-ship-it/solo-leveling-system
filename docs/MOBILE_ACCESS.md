# 手機版開啟網頁 — 詳細步驟

本專案已設定好 **viewport**（`app/layout.tsx`）與 **768px 以下版面**（主版面改為單欄、Analytics 四格改為 2×2），在手機瀏覽器上可正常使用。  
要「在手機上打開這個網頁」有兩種做法：

---

## 方法一：同一個 Wi‑Fi 下，用手機開「開發版」（本機）

適合：在自家或辦公室，電腦和手機連**同一個 Wi‑Fi**，想快速在手機上測試。

### 步驟 1：讓開發伺服器對區域網路開放

在專案資料夾執行（多加 `--hostname 0.0.0.0`）：

```bash
cd /Users/hokamyuentommy/Documents/solo-leveling-system
npm run dev -- --hostname 0.0.0.0
```

或：

```bash
npx next dev --hostname 0.0.0.0
```

這樣 Next.js 會監聽「所有網路介面」，手機才能用電腦的 IP 連進來。

### 步驟 2：查電腦的區域網路 IP（Mac）

- 打開 **系統設定** → **網路** → 選你正在用的 Wi‑Fi → 點 **詳細資訊**，看 **IP 位址**。  
  或  
- 終端機執行：
  ```bash
  ipconfig getifaddr en0
  ```
  會得到類似 `192.168.1.100` 的數字。

### 步驟 3：在手機瀏覽器開啟

1. 手機連上**同一個 Wi‑Fi**（和電腦一樣）。
2. 打開 **Safari** 或 **Chrome**。
3. 網址列輸入：
   ```text
   http://你的電腦IP:3000
   ```
   例如：`http://192.168.1.100:3000`
4. 前往。

若電腦防火牆有擋「傳入連線」，需允許本機 3000 port 或 Node/Next.js。

**注意**：關掉終端機或停止 `npm run dev` 後，手機就無法再連；下次要用手機開，需再執行一次步驟 1。

---

## 方法二：部署到網路後，用手機開「正式網址」（推薦）

適合：希望**隨時隨地**用手機開，不限制是否同 Wi‑Fi。

做法就是：把網站部署到 **Vercel**，拿到一個固定網址（例如 `https://solo-leveling-system-xxx.vercel.app`），之後用手機瀏覽器開這個網址即可。

**完整三步驟**（把程式碼推到 GitHub → 在 Vercel 匯入並 Deploy → 用手機開網址）已寫在專案根目錄的 **`DEPLOY.md`**，請直接照裡面的「方法二」做即可。

簡要流程：

1. **第一階段**：專案推到 GitHub（若尚未推送）。
2. **第二階段**：到 [vercel.com](https://vercel.com) 用 GitHub 登入 → **Add New → Project** → 選你的 repo → **Deploy**。
3. **第二階段完成後**：Vercel 會給你一個網址。
4. **第三階段**：手機打開瀏覽器，網址列貼上該 Vercel 網址，即可開啟。

之後更新程式碼只要 `git push`，Vercel 會自動重新部署，同一網址在手機重新整理就能看到最新版。

---

## 已為手機做的設定（你不需要再改）

| 項目 | 說明 |
|------|------|
| **viewport** | `app/layout.tsx` 已設定 `width: device-width`, `initialScale: 1`，手機不會整頁縮小。 |
| **主版面** | 寬度 ≤ 768px 時，左側 Profile / 右側任務區改為**單欄**由上到下排列。 |
| **Analytics 四格** | 寬度 ≤ 768px 時改為 **2×2**，不會擠在一行。 |

---

## 常見問題

| 問題 | 說明 |
|------|------|
| 方法一：手機打不開 `http://192.168.x.x:3000` | 確認手機和電腦同 Wi‑Fi；確認終端機是跑 `npm run dev -- --hostname 0.0.0.0`；檢查電腦防火牆是否允許 3000 port。 |
| 方法二：要付費嗎？ | Vercel 個人免費方案即可，不需付費。 |
| 可以自訂網域嗎？ | 可以。部署後在 Vercel 專案 **Settings → Domains** 綁定自己的網域。 |

---

**總結**：  
- **只在同 Wi‑Fi 快速測**：用方法一（`npm run dev -- --hostname 0.0.0.0` + 電腦 IP:3000）。  
- **要隨時用手機開**：用方法二，照 **`DEPLOY.md`** 部署到 Vercel，用手機開 Vercel 給的網址即可。
