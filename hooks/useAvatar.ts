"use client";

import { useState, useEffect, useCallback } from "react";
import { readAvatarFromStorage, writeAvatarToStorage, processAvatarFile } from "@/lib/avatar";

/** syncStatus：主頁登入後從雲端合併 localStorage 時帶入，以便重新讀取頭像 */
export function useAvatar(loaded: boolean, syncStatus?: "pending" | "local" | "synced") {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  const rehydrate = useCallback(() => {
    setDataUrl(readAvatarFromStorage());
  }, []);

  useEffect(() => {
    if (!loaded) return;
    rehydrate();
  }, [loaded, rehydrate]);

  useEffect(() => {
    if (syncStatus === "synced") rehydrate();
  }, [syncStatus, rehydrate]);

  const applyFile = useCallback(async (file: File) => {
    const out = await processAvatarFile(file);
    writeAvatarToStorage(out);
    setDataUrl(out);
  }, []);

  const clear = useCallback(() => {
    writeAvatarToStorage(null);
    setDataUrl(null);
  }, []);

  return { avatarDataUrl: dataUrl, applyFile, clear };
}
