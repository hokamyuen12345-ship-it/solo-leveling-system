import type { ReactNode } from "react";
import "./ielts.css";
import { IeltsSfxProvider } from "./ielts-sfx-provider";

export default function IeltsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <IeltsSfxProvider />
      {children}
    </>
  );
}
