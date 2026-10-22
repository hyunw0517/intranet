"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// Light / Dark / System 선택. 최초 기본값은 Light.
// <html>에 dark 클래스를 붙이는 방식이며, 선택 값은 next-themes가 localStorage에 유지한다.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
