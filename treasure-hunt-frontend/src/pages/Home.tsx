import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUserStore } from '../store/userStore';
import { api } from '../lib/api';

const Home = () => {
  const { user } = useUserStore();
  const [treasures, setTreasures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'participated' | 'created' | 'public'>('participated');
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  
  useEffect(() => {
    // 1. Check for clipboard data on mount (skipped)
    
    // 2. Load list based on activeTab
    const fetchTreasures = async () => {
      setLoading(true);
      try {
        // Ensure we don't send 'undefined' string
        const userIdParam = user?.id ? user.id : '';
        // Pass filter param
        const data = await api.get(`/game?userId=${userIdParam}&filter=${activeTab}`);
        setTreasures(data);
      } catch (err) {
        console.error("Failed to fetch treasures:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchTreasures();
  }, [user, activeTab]); // Re-fetch when tab changes

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

  if (loading && treasures.length === 0) return <div className="p-4 text-center">Loading hunts...</div>;

  const tabs = [
      { id: 'participated', label: 'Participated', emoji: '🏃' },
      { id: 'created', label: 'Created', emoji: '✏️' },
      { id: 'public', label: 'Public', emoji: '🌍' }
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white shadow-sm sticky top-0 z-20">
          <header className="flex justify-between items-center p-4">
            <h1 className="text-xl font-bold">Treasure Hunts</h1>
            <div className="flex items-center gap-3">
                 <button 
                    onClick={() => setShowJoinModal(true)}
                    className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1.5 rounded-full font-medium transition"
                 >
                     🔑 Join Private
                 </button>
                 <div className="text-sm text-gray-600">
                    {user?.email?.split('@')[0]}
                 </div>
            </div>
          </header>

          {/* Tabs */}
          <div className="flex border-b border-gray-100">
              {tabs.map(tab => (
                  <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors duration-200
                          ${activeTab === tab.id 
                              ? 'border-blue-600 text-blue-600' 
                              : 'border-transparent text-gray-500 hover:text-gray-700'
                          }`}
                  >
                      <span className="mr-1">{tab.emoji}</span> {tab.label}
                  </button>
              ))}
          </div>
      </div>

      {/* Content Area with simple swipe simulation */}
      {/* Note: True swipe requires complex touch handling. Using simple container for now. */}
      <div className="p-4">
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
            {loading ? (
                <div className="text-center text-gray-500 py-10">Loading...</div>
            ) : treasures.length === 0 ? (
              <div className="text-center text-gray-500 mt-10 flex flex-col items-center">
                  <div className="text-4xl mb-4">📭</div>
                  <p>No {activeTab} hunts found.</p>
                  {activeTab === 'participated' && <p className="text-sm mt-2">Join a public hunt or enter a code!</p>}
                  {activeTab === 'created' && <Link to="/create" className="text-blue-500 mt-2">Create one now</Link>}
              </div>
            ) : (
              treasures.map((t) => (
                <Link to={`/game/${t.id}`} key={t.id} className="block bg-white p-4 rounded-lg shadow hover:shadow-md transition relative overflow-hidden">
                  <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-semibold">{t.title}</h3>
                        <div className="flex gap-2 mt-1 text-xs text-gray-500">
                            <span className="bg-gray-100 px-2 py-0.5 rounded">{'⭐'.repeat(t.difficulty)}</span>
                            <span className="bg-gray-100 px-2 py-0.5 rounded">{t.locations?.count || 0} Locs</span>
                            {t.is_public === false && <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">🔒 Private</span>}
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
                </Link>
              ))
            )}
          </div>
      </div>
      
      <Link to="/create" className="fixed bottom-6 right-6 bg-green-500 text-white w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-2xl hover:bg-green-600 transition z-10">
        +
      </Link>
    </div>
  );
};

export default Home;
