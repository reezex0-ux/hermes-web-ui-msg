import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hermes Workspace",
  description: "A source-of-truth preserving workspace shell for Hermes and connected tools."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <header className="app-window-titlebar" aria-hidden="true">Hermes Workspace</header>
        {children}
      </body>
    </html>
  );
}
