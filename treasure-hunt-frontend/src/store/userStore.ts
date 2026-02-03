import { create } from 'zustand';
import { supabase } from '../lib/supabase';

interface UserState {
  user: any | null;
  loading: boolean;
  setUser: (user: any | null) => void;
  fetchUser: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useUserStore = create<UserState>((set, get) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user }),
  fetchUser: async () => {
    // Only set loading true if we don't have a user yet (initial load)
    if (!get().user) {
        set({ loading: true });
    }
    
    const { data: { user } } = await supabase.auth.getUser();
    set({ user, loading: false });
  },
  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null });
  }
}));
