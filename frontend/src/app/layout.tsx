import type { Metadata } from "next";
import localFont from "next/font/local";
import { AppProviders } from "@/providers/app-providers";
import "./globals.css";

const pretendard = localFont({
  src: "../../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  variable: "--font-pretendard",
  weight: "45 920",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Intranet",
    template: "%s | Intranet",
  },
  description: "사내 인트라넷",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // next-themes가 hydration 전에 <html> class를 바꾸므로 경고를 억제한다.
    <html lang="ko" className={`${pretendard.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
