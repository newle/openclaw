import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import Login from './pages/Login';
import Home from './pages/Home';
import Game from './pages/Game';
import Create from './pages/Create';
import { useUserStore } from './store/userStore';

const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, fetchUser } = useUserStore();

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  if (loading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

function App() {
  const { fetchUser } = useUserStore();

  useEffect(() => {
    // Listen for auth state changes (e.g. when user clicks email confirmation link)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      fetchUser();
    });

    return () => subscription.unsubscribe();
  }, [fetchUser]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <AuthGuard>
              <Home />
            </AuthGuard>
          }
        />
        <Route
          path="/create"
          element={
            <AuthGuard>
              <Create />
            </AuthGuard>
          }
        />
        <Route
          path="/game/:id"
          element={
            <AuthGuard>
              <Game />
            </AuthGuard>
          }
        />
        {/* Add other routes as needed */}
      </Routes>
    </BrowserRouter>
  );
}

export default App;
