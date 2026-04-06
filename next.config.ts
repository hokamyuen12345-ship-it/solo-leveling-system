import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** 與自訂 webpack 並存時 Next 16 要求聲明（production build 預設仍用 Turbopack） */
  turbopack: {},
  /** 開發時關閉 webpack 磁碟 cache，減少 iCloud/同步資料夾底下 .next 寫入競態導致 manifest / pack 損毀 */
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
