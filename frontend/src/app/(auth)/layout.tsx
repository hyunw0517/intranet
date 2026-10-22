// 로그인·회원가입 등 인증 화면 레이아웃 (사이드바 없이 가운데 정렬)
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-sidebar px-4 py-10">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
