export const AVATAR_STORAGE_KEY = "slq_avatar_data_url_v1";

const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_EDGE = 512;
const JPEG_QUALITY = 0.82;
const JPEG_QUALITY_FALLBACK = 0.65;
const MAX_STORED_CHARS = 1_400_000;

export function readAvatarFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AVATAR_STORAGE_KEY);
    if (!raw) return null;
    try {
      const v = JSON.parse(raw) as unknown;
      if (typeof v === "string" && v.startsWith("data:image/")) return v;
    } catch {
      if (raw.startsWith("data:image/")) return raw;
    }
  } catch {
    /* */
  }
  return null;
}

export function writeAvatarToStorage(dataUrl: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!dataUrl) localStorage.removeItem(AVATAR_STORAGE_KEY);
    else localStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(dataUrl));
  } catch {
    throw new Error("儲存失敗，圖片仍太大或瀏覽器空間不足，請換一張較小的圖片");
  }
}

export async function processAvatarFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("請選擇圖片檔案");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("檔案過大（請小於 8MB）");
  }
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("無法處理圖片");
    let edge = MAX_EDGE;
    for (let attempt = 0; attempt < 4; attempt++) {
      const bw = bitmap.width;
      const bh = bitmap.height;
      const scale = Math.min(1, edge / Math.max(bw, bh, 1));
      const w = Math.round(bw * scale);
      const h = Math.round(bh * scale);
      canvas.width = w;
      canvas.height = h;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(bitmap, 0, 0, w, h);
      const q = attempt >= 2 ? JPEG_QUALITY_FALLBACK : JPEG_QUALITY;
      let jpeg = canvas.toDataURL("image/jpeg", q);
      if (jpeg.length <= MAX_STORED_CHARS) return jpeg;
      edge = Math.round(edge * 0.72);
    }
    throw new Error("壓縮後仍過大，請換一張較簡單的圖片");
  } finally {
    bitmap.close?.();
  }
}
