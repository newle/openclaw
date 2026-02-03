import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUserStore } from '../store/userStore';
import { api } from '../lib/api';

const Home = () => {
  const { user } = useUserStore();
  const [treasures, setTreasures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  
  useEffect(() => {
    // 1. Check for clipboard data on mount
    const checkClipboard = async () => {
        try {
            // Need permission or user interaction usually.
            // But if we are in a PWA or specific environment?
            // Browsers block navigator.clipboard.readText() without gesture.
            // So we might need a button "Paste from Clipboard" or instruct user.
            
            // However, requirement says "automatically".
            // Modern browsers (Chrome 66+) block async clipboard API without user gesture.
            // BUT, if the user "enters the list page" (maybe via a link?), we can't read clipboard automatically.
            
            // Workaround: We can't auto-read. We must ask user or provide a button.
            // OR if this is wrapped in a native app shell.
            // Assuming web: We will show a "Detected Link" toast if we can, or just a paste button.
            
            // Let's try to read if permission is granted (e.g. previously granted)
            // Or catch the error.
            
            /* 
            const text = await navigator.clipboard.readText();
            if (text && text.includes('/game/')) {
                // Parse ID
                // ...
            }
            */
        } catch (e) {
            // ignore
        }
    };
    
    // checkClipboard();

    // 2. Load list
    const fetchTreasures = async () => {
      try {
        const data = await api.get(`/game?userId=${user?.id || ''}`);
        setTreasures(data);
      } catch (err) {
        console.error("Failed to fetch treasures:", err);
      } finally {
        setLoading(false);
      }
    };

    if (!user) return; 
    fetchTreasures();
  }, [user]);

  // Handle manual code join
  const handleJoinByCode = async () => {
      if (!joinCode || joinCode.length !== 4) {
          alert("Please enter a valid 4-digit code");
          return;
      }
      
      try {
          const res = await api.post('/game/join-code', { code: joinCode });
          if (res.treasureId) {
              window.location.href = `/game/${res.treasureId}`;
          }
      } catch (err: any) {
          console.error("Join failed:", err);
          alert(err.response?.data?.error || "Failed to join via code. It may be expired.");
      }
  };

  if (loading) return <div className="p-4 text-center">Loading hunts...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold">Treasure Hunts</h1>
        <div className="flex items-center gap-3">
             <button 
                onClick={() => setShowJoinModal(true)}
                className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1.5 rounded-full font-medium transition"
             >
                 🔑 Join Private
             </button>
             <div className="text-sm text-gray-600">
                {user?.email}
             </div>
        </div>
      </header>

      {/* Join Modal */}
      {showJoinModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-2xl">
                  <h3 className="text-lg font-bold mb-4">Join Private Hunt</h3>
                  <p className="text-sm text-gray-500 mb-4">Enter the 4-digit code shared by the creator.</p>
                  
                  <input 
                      type="number" 
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value)}
                      placeholder="0000"
                      className="w-full text-center text-3xl font-mono tracking-widest border-2 border-gray-200 rounded-lg p-3 mb-6 focus:border-blue-500 outline-none"
                      maxLength={4}
                  />
                  
                  <div className="flex gap-3">
                      <button 
                          onClick={() => setShowJoinModal(false)}
                          className="flex-1 py-3 text-gray-600 font-medium"
                      >
                          Cancel
                      </button>
                      <button 
                          onClick={handleJoinByCode}
                          className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-bold shadow-lg hover:bg-blue-700"
                      >
                          Join
                      </button>
                  </div>
              </div>
          </div>
      )}

      <div className="grid gap-4">
        {treasures.length === 0 ? (
          <div className="text-center text-gray-500 mt-10">No treasure hunts found. Create one!</div>
        ) : (
          treasures.map((t) => (
            <Link to={`/game/${t.id}`} key={t.id} className="block bg-white p-4 rounded-lg shadow hover:shadow-md transition relative overflow-hidden">
              <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-semibold">{t.title}</h3>
                    <div className="flex gap-2 mt-1 text-xs text-gray-500">
                        <span className="bg-gray-100 px-2 py-0.5 rounded">{'⭐'.repeat(t.difficulty)}</span>
                        <span className="bg-gray-100 px-2 py-0.5 rounded">{t.locations?.count || 0} Locs</span>
                    </div>
                  </div>
                  {t.participation?.is_completed && (
                      <div className="text-right">
                          <span className="block text-xs text-green-600 font-bold uppercase tracking-wider">Completed</span>
                          <span className="text-lg font-mono font-bold text-green-700">{t.participation.final_cost}s</span>
                      </div>
                  )}
              </div>
              <p className="text-xs text-gray-400 mt-2 line-clamp-2">{t.description}</p>
              
              {/* Progress Bar if started but not completed? */}
              {/* Not implemented yet, just completed status */}
            </Link>
          ))
        )}
      </div>
      
      <Link to="/create" className="fixed bottom-6 right-6 bg-green-500 text-white p-4 rounded-full shadow-lg">
        + Create
      </Link>
    </div>
  );
};

export default Home;
