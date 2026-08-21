import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import AuthPage from './pages/AuthPage';
import ChatPage from './pages/ChatPage';
import InviteJoinPage from './pages/InviteJoinPage';
import { ROUTES } from './config/constants';
import { useAuth } from './context/useAuth';
import './App.css';

function AuthLoading() {
  return null;
}

function GuestRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <AuthLoading />;
  return isAuthenticated ? <Navigate to={ROUTES.CHAT} replace /> : <AuthPage />;
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <AuthLoading />;
  return isAuthenticated ? children : <Navigate to={ROUTES.HOME} replace />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path={ROUTES.HOME} element={<GuestRoute />} />
        <Route path="/invite/:inviteCode" element={<InviteJoinPage />} />
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
  );
}

export default App;
