import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Component, Fragment, type ReactNode } from 'react';
import AuthPage from './pages/AuthPage';
import ChatPage from './pages/ChatPage';
import InviteJoinPage from './pages/InviteJoinPage';
import AdminPage from './pages/AdminPage';
import { ROUTES } from './config/constants';
import { useAuth } from './context/useAuth';
import './App.css';

function AuthLoading() {
  return (
    <div className="app-auth-loading" role="status" aria-live="polite" aria-label="Loading">
      <span className="app-auth-spinner" />
    </div>
  );
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Unhandled UI error:', error);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="app-error-boundary">
        <h1>Something went wrong</h1>
        <p>PulseChat hit an unexpected error. Reloading the app usually fixes it.</p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload PulseChat
        </button>
      </div>
    );
  }
}

function GuestRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <AuthLoading />;
  return isAuthenticated ? <Navigate to={ROUTES.CHAT} replace /> : <AuthPage />;
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  if (isLoading) return <AuthLoading />;
  return isAuthenticated ? <Fragment key={user?.id}>{children}</Fragment> : <Navigate to={ROUTES.HOME} replace />;
}

function AdminRoute() {
  const { isAuthenticated, isLoading, user } = useAuth();
  if (isLoading) return <AuthLoading />;
  if (!isAuthenticated) return <Navigate to={ROUTES.HOME} replace />;
  return user?.accountRole === 'ADMIN' ? <AdminPage /> : <Navigate to={ROUTES.CHAT} replace />;
}

function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path={ROUTES.HOME} element={<GuestRoute />} />
          <Route path="/invite/:inviteCode" element={<InviteJoinPage />} />
          <Route path={`${ROUTES.ADMIN}/*`} element={<AdminRoute />} />
          <Route
            path={`${ROUTES.CHAT}/*`}
            element={
              <ProtectedRoute>
                <ChatPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
        </Routes>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}

export default App;
