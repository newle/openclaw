import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUserStore } from '../store/userStore';
import { api } from '../lib/api';

const Home = () => {
  const { user } = useUserStore();
  const [treasures, setTreasures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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

    if (!user) return; // Wait for user? Or load public?
    // Let's load anyway, but if user exists, pass ID.
    fetchTreasures();
  }, [user]);

  if (loading) return <div className="p-4 text-center">Loading hunts...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold">Treasure Hunts</h1>
        <div className="text-sm text-gray-600">
            {user?.email}
        </div>
      </header>

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
