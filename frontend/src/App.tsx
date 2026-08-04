import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import AuthPage from './pages/AuthPage';
import ChatPage from './pages/ChatPage';
import { ROUTES } from './config/constants';
import './App.css';

function hasAuthSession() {
  return Boolean(localStorage.getItem('refreshToken') && localStorage.getItem('user'));
}

function GuestRoute() {
  return hasAuthSession() ? <Navigate to={ROUTES.CHAT} replace /> : <AuthPage />;
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  return hasAuthSession() ? children : <Navigate to={ROUTES.HOME} replace />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path={ROUTES.HOME} element={<GuestRoute />} />
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
