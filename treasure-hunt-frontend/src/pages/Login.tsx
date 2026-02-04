import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const navigate = useNavigate();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      if (isSignUp) {
        // Extract username from email
        const username = email.split('@')[0];
        
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
              data: {
                  nickname: username // Save to metadata
              }
          }
        });
        if (error) throw error;
        
        if (data.session) {
            // Also update public.users table manually via API if needed?
            // Usually we rely on a Supabase Trigger to copy auth.users -> public.users
            // But since we have a simple backend, let's assume the backend will auto-create on first action,
            // OR we can explicitly call a 'sync-profile' endpoint.
            // But for now, just saving to metadata is good practice.
            
            // To ensure nickname is in public.users immediately for leaderboards:
            // We can call our own backend to upsert the user.
            // But we don't have a dedicated /user/profile endpoint yet. 
            // The backend 'createTreasure' and 'startGame' auto-create user with "Explorer".
            
            // Let's rely on the Trigger (if it exists) OR just let it be "Explorer" until they do something that updates it?
            // Actually, the user wants "Register time write email prefix".
            
            // Since we don't have a Trigger setup script here, we should try to update it manually if possible.
            // But client-side DB write to 'users' might be blocked by RLS.
            // Let's assume the backend will handle it lazily, OR we can try to insert now.
            
            // NOTE: The most robust way without backend changes is using the metadata.
            // AND modifying the backend to read this metadata when auto-creating the user.
            
            navigate('/');
        } else {
            // Email confirmation is enabled
            alert('Registration successful! Please check your email for confirmation.\n\nDev Hint: If you haven\'t configured SMTP, go to Supabase Dashboard -> Authentication -> Providers -> Email -> Disable "Confirm email" to skip this step.');
            setIsSignUp(false);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">
          {isSignUp ? 'Create Account' : 'Login to Treasure Hunt'}
        </h2>
        {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4">{error}</div>}
        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-blue-300"
          >
            {loading ? 'Processing...' : (isSignUp ? 'Sign Up' : 'Login')}
          </button>
        </form>
        
        <div className="mt-4 text-center">
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError('');
            }}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            {isSignUp 
              ? 'Already have an account? Login' 
              : 'Need an account? Sign Up'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
