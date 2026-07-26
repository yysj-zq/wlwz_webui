/**
 * React Router 7 路由表 + 兼容辅助。
 */
import {
  createBrowserRouter,
  RouterProvider,
  useNavigate as useRRNavigate,
  useParams,
  useLocation,
  Outlet,
  Navigate,
  type NavigateOptions,
} from 'react-router';
import { useEffect } from 'react';

export { createBrowserRouter, RouterProvider, Outlet, Navigate, useParams, useLocation };

export const ROUTES = {
  home: '/',
  chat: '/chat/:conversationId?',
  play: '/play/:conversationId?',
  roles: '/roles',
  settings: '/settings',
  auth: '/auth',
} as const;

export function playPath(conversationId?: number | string | null): string {
  if (conversationId === null || conversationId === undefined || conversationId === '') {
    return '/play';
  }
  return `/play/${conversationId}`;
}

export function chatPath(conversationId?: number | string | null): string {
  if (conversationId === null || conversationId === undefined || conversationId === '') {
    return '/chat';
  }
  return `/chat/${conversationId}`;
}

export const routeBuilders = {
  play: (params: { conversationId?: string }) => playPath(params.conversationId),
  chat: (params: { conversationId?: string }) => chatPath(params.conversationId),
  roles: () => '/roles',
  settings: () => '/settings',
  auth: () => '/auth',
  home: () => '/',
};

export function useNavigate() {
  const navigate = useRRNavigate();
  return (path: string, options?: NavigateOptions) => {
    void navigate(path, options);
  };
}

export function useFocusOnRouteChange(mainId = 'main-content'): void {
  const location = useLocation();
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const main = document.getElementById(mainId);
    if (!main) return;
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      if (main.contains(document.activeElement)) return;
    }
    main.focus({ preventScroll: true });
  }, [location.pathname, mainId]);
}
