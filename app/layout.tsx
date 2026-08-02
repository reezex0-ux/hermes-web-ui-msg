import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hermes Web UI MSG",
  description: "Unofficial community web UI for Hermes Dashboard."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <header className="app-window-titlebar" aria-hidden="true">Hermes Web UI MSG</header>
        {children}
      </body>
    </html>
  );
}
