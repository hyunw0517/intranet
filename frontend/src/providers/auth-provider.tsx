"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import * as authApi from "@/services/api/auth";
import type { ChangePasswordInput, RegisterInput } from "@/services/api/auth";
import { fetchMe } from "@/services/api/users";
import type { CurrentUser } from "@/types/user";
import {
  refreshAccessToken,
  setAccessToken,
  setSessionExpiredHandler,
} from "@/services/api-client";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  status: AuthStatus;
  user: CurrentUser | null;
  login: (empNo: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (input: ChangePasswordInput) => Promise<void>;
  setUser: (user: CurrentUser) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// 로그인 상태를 앱 전체가 공유한다.
// - 앱 시작(새로고침) 시: 쿠키의 refresh token으로 access token 재발급 → 내 정보 조회
// - access token은 api-client의 메모리 변수에, 사용자 정보는 이 Context에 둔다.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUserState] = useState<CurrentUser | null>(null);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUserState(null);
    setStatus("unauthenticated");
    queryClient.clear(); // 이전 사용자의 캐시가 남지 않도록
  }, [queryClient]);

  // 토큰을 받은 뒤 내 정보를 불러와 로그인 상태로 전환
  const loadUser = useCallback(async () => {
    const me = await fetchMe();
    setUserState(me);
    setStatus("authenticated");
  }, []);

  // 앱 시작 시 1회: 새로고침하면 메모리의 access token이 사라지므로 쿠키로 재발급한다.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const token = await refreshAccessToken();
      if (cancelled) return;
      if (!token) {
        setStatus("unauthenticated");
        return;
      }
      try {
        await loadUser();
      } catch {
        if (!cancelled) clearSession();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadUser, clearSession]);

  // 사용 중에 재발급까지 실패하면(refresh 만료, 퇴사 처리 등) 로그아웃 상태로 전환
  useEffect(() => {
    setSessionExpiredHandler(() => {
      clearSession();
      toast.error("로그인이 만료되었습니다. 다시 로그인해 주세요.");
    });
    return () => setSessionExpiredHandler(null);
  }, [clearSession]);

  const login = useCallback(
    async (empNo: string, password: string) => {
      const { accessToken } = await authApi.login(empNo, password);
      setAccessToken(accessToken);
      await loadUser();
    },
    [loadUser],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const { accessToken } = await authApi.register(input);
      setAccessToken(accessToken);
      await loadUser();
    },
    [loadUser],
  );

  // 비밀번호 변경 → 서버가 tokenVersion을 올려 기존 토큰이 모두 무효가 되므로 응답의 새 access token으로 교체한다.
  // (새 refresh 쿠키는 서버가 저장) 토큰을 새로 받는 동작은 login·register와 같이 이곳에서만 처리한다.
  const changePassword = useCallback(async (input: ChangePasswordInput) => {
    const { accessToken } = await authApi.changePassword(input);
    setAccessToken(accessToken);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      // 서버 요청이 실패해도 화면에서는 로그아웃 처리한다.
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, register, logout, changePassword, setUser: setUserState }),
    [status, user, login, register, logout, changePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth는 AuthProvider 안에서만 사용할 수 있습니다.");
  return ctx;
}
