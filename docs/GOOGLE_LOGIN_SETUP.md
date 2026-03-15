# 改用 Google 登入設定

專案已改為只顯示「Sign in with Google」。完成下列設定後即可用 Google 帳號登入，電腦與手機用同一 Google 帳號即會同步紀錄。

---

## 1. 在 Google Cloud 建立 OAuth 憑證

1. 打開 **https://console.cloud.google.com/**，登入你的 Google 帳號。
2. 上方選一個專案，或「選取專案」→「新增專案」→ 取名（例如 `solo-leveling`）→ 建立。
3. 左側選單（≡）→ **API 和服務** → **憑證**。
4. 若第一次使用，先設定 **OAuth 同意畫面**：
   - 點「設定 OAuth 同意畫面」→ 使用者類型選 **外部** → 建立。
   - 應用程式名稱填 `Solo Leveling`，使用者支援電子郵件選你的信箱 → 儲存並繼續 → 範圍可略過 → 儲存並繼續。
5. 回到 **憑證** → **+ 建立憑證** → **OAuth 用戶端 ID**。
6. 應用程式類型選 **網頁應用程式**，名稱填例如 `Solo Leveling Web`。
7. **已授權的重新導向 URI** → 點 **+ 新增**，貼上 Supabase 的 Callback URL：
   - 到 Supabase 後台 → **Authentication** → **Providers** → **Google**，畫面上會顯示 **Callback URL**（格式：`https://你的專案ID.supabase.co/auth/v1/callback`）。
   - 把這串完整複製，貼到 Google 的「已授權的重新導向 URI」。
8. 按 **建立**，會顯示 **用戶端 ID** 和 **用戶端密碼**，複製下來（或稍後到「憑證」列表再查看）。

---

## 2. 在 Supabase 啟用 Google

1. 打開 **Supabase 後台** → 你的專案。
2. 左側 **Authentication** → **Providers** → 點 **Google**。
3. **Enable Sign in with Google** 打開。
4. **Client ID**：貼上 Google 的「用戶端 ID」。
5. **Client Secret**：貼上 Google 的「用戶端密碼」。
6. 按 **Save**。

---

## 3. 測試

- 在 App（localhost 或 Vercel 網址）點 **Sign in with Google**。
- 選擇你的 Google 帳號完成登入。
- 電腦與手機用同一 Google 帳號登入，進度會同步。
