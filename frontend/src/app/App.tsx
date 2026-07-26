/**
 * App —— React Router 7 产品主壳。
 * `/` 与 `/chat` → Chat；`/play` → Game。
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  createBrowserRouter,
  RouterProvider as RRProvider,
  Outlet,
  useNavigate,
  useParams,
  useLocation,
  useFocusOnRouteChange,
  playPath,
  chatPath,
} from '@shared/router';
import { useAuth } from '@features/auth';
import { useActiveConversationId } from '@features/conversation-session';
import { useCreateOrLoadConversationApiConversationsPost } from '@shared/api';
import { queryKeys } from '@shared/api/queryClient';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell, ConversationSidebar, type ViewMode } from '@widgets/app-shell';

const PlayPage = lazy(() => import('@pages/play/PlayPage').then((m) => ({ default: m.PlayPage })));
const ChatPage = lazy(() => import('@pages/chat/ChatPage').then((m) => ({ default: m.ChatPage })));
const RolesPage = lazy(() =>
  import('@pages/roles/RolesPage').then((m) => ({ default: m.RolesPage })),
);
const AuthPage = lazy(() => import('@pages/auth/AuthPage').then((m) => ({ default: m.AuthPage })));
const SettingsPage = lazy(() =>
  import('@pages/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);

const MOBILE_MQ = '(max-width: 900px)';

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_MQ).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const onChange = () => setMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return mobile;
}

function resolveViewMode(pathname: string): ViewMode {
  return pathname.startsWith('/play') ? 'game' : 'chat';
}

function ShellFallback({ label }: { label: string }) {
  return (
    <p
      role="status"
      style={{
        padding: '2rem',
        margin: 0,
        fontFamily: 'var(--font-ui)',
        color: 'var(--color-text-secondary)',
      }}
    >
      {label}
    </p>
  );
}

function ProductShell() {
  useFocusOnRouteChange('main-content');
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const activeId = useActiveConversationId();
  const queryClient = useQueryClient();

  const viewMode = resolveViewMode(location.pathname);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const urlConversationId = params.conversationId ?? null;

  const currentConversationId = useMemo(() => {
    if (urlConversationId && /^\d+$/.test(urlConversationId)) return Number(urlConversationId);
    return activeId;
  }, [urlConversationId, activeId]);

  const createMutation = useCreateOrLoadConversationApiConversationsPost();

  const handleViewModeChange = useCallback(
    (mode: ViewMode) => {
      if (mode === 'game' && !user) {
        navigate('/auth');
        return;
      }
      const id = currentConversationId;
      if (mode === 'game') {
        navigate(playPath(id));
      } else {
        navigate(id ? chatPath(id) : '/');
      }
    },
    [user, currentConversationId, navigate],
  );

  const handleNewChat = useCallback(() => {
    void (async () => {
      try {
        const world = await createMutation.mutateAsync({
          data: { conversationId: null, title: '新的对话' },
        });
        await queryClient.invalidateQueries({
          queryKey: queryKeys.conversation.list(),
        });
        const id = world.id;
        if (typeof id === 'number') {
          navigate(viewMode === 'game' ? playPath(id) : chatPath(id));
        } else {
          navigate(viewMode === 'game' ? '/play' : '/chat');
        }
      } catch {
        navigate(viewMode === 'game' ? '/play' : '/chat');
      }
      setSidebarOpen(false);
    })();
  }, [createMutation, navigate, queryClient, viewMode]);

  const handleSelectConversation = useCallback(
    (id: number) => {
      navigate(viewMode === 'game' ? playPath(id) : chatPath(id));
      setSidebarOpen(false);
    },
    [navigate, viewMode],
  );

  return (
    <AppShell
      viewMode={viewMode}
      onViewModeChange={handleViewModeChange}
      onNewChat={handleNewChat}
      onOpenSettings={() => navigate('/settings')}
      sidebarOpen={sidebarOpen}
      onSidebarOpenChange={setSidebarOpen}
      sidebar={
        <ConversationSidebar
          open={sidebarOpen}
          currentConversationId={currentConversationId}
          onSelectConversation={handleSelectConversation}
          onNewChat={handleNewChat}
          onClose={() => setSidebarOpen(false)}
          isMobile={isMobile}
        />
      }
      main={
        <Suspense fallback={<ShellFallback label="正在开场…" />}>
          <Outlet />
        </Suspense>
      }
    />
  );
}

const router = createBrowserRouter([
  {
    path: '/roles',
    element: (
      <Suspense fallback={<ShellFallback label="打开角色册…" />}>
        <RolesPage />
      </Suspense>
    ),
  },
  {
    path: '/settings',
    element: (
      <Suspense fallback={<ShellFallback label="打开设置…" />}>
        <SettingsPage />
      </Suspense>
    ),
  },
  {
    path: '/auth',
    element: (
      <Suspense fallback={<ShellFallback label="打开登录…" />}>
        <AuthPage />
      </Suspense>
    ),
  },
  {
    path: '/',
    element: <ProductShell />,
    children: [
      { index: true, element: <ChatPage /> },
      { path: 'chat/:conversationId?', element: <ChatPage /> },
      { path: 'play/:conversationId?', element: <PlayPage /> },
    ],
  },
  { path: '*', element: <NavigateToHome /> },
]);

function NavigateToHome() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate('/', { replace: true });
  }, [navigate]);
  return <ShellFallback label="正在开场…" />;
}

export default function App() {
  return <RRProvider router={router} />;
}
