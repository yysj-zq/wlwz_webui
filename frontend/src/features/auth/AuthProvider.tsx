import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useReadMeApiAuthMeGet,
  loginApiAuthLoginPost,
  registerApiAuthRegisterPost,
  type UserOut,
} from '@shared/api';
import { getStoredToken, setStoredToken } from '@shared/api/mutator';
import { queryKeys } from '@shared/api/queryClient';
import { useConversationSessionStore } from '@features/conversation-session';

interface AuthContextValue {
  readonly user: UserOut | null;
  readonly token: string | null;
  readonly loading: boolean;
  readonly login: (email: string, password: string) => Promise<void>;
  readonly register: (email: string, password: string, username?: string) => Promise<void>;
  readonly logout: () => void;
}
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [token, setToken] = useState(getStoredToken);
  const queryClient = useQueryClient();
  const clearConversation = useConversationSessionStore((s) => s.setConversationId);
  const me = useReadMeApiAuthMeGet({
    query: {
      queryKey: queryKeys.auth.me(),
      enabled: Boolean(token),
      retry: false,
    },
  });
  useEffect(() => {
    const unauthorized = () => {
      setToken(null);
      clearConversation(null);
      queryClient.clear();
    };
    window.addEventListener('auth:unauthorized', unauthorized);
    return () => window.removeEventListener('auth:unauthorized', unauthorized);
  }, [queryClient, clearConversation]);
  const value = useMemo<AuthContextValue>(
    () => ({
      user: me.data ?? null,
      token,
      loading: Boolean(token) && me.isPending,
      login: async (email, password) => {
        const result = await loginApiAuthLoginPost({ email, password });
        setStoredToken(result.accessToken);
        setToken(result.accessToken);
        await queryClient.invalidateQueries();
      },
      register: async (email, password, username) => {
        await registerApiAuthRegisterPost({
          email,
          password,
          ...(username ? { username } : {}),
        });
      },
      logout: () => {
        setStoredToken(null);
        setToken(null);
        clearConversation(null);
        queryClient.clear();
      },
    }),
    [me.data, me.isPending, queryClient, token, clearConversation],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
