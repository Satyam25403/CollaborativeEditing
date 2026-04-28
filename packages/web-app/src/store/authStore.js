import { create } from 'zustand';

const useAuthStore = create((set) => ({
  token: localStorage.getItem('collab_token') || null,
  user: JSON.parse(localStorage.getItem('collab_user') || 'null'),

  login(token, user) {
    localStorage.setItem('collab_token', token);
    localStorage.setItem('collab_user', JSON.stringify(user));
    set({ token, user });
  },

  logout() {
    localStorage.removeItem('collab_token');
    localStorage.removeItem('collab_user');
    set({ token: null, user: null });
  },

  setUser(user) {
    localStorage.setItem('collab_user', JSON.stringify(user));
    set({ user });
  }
}));

export default useAuthStore;
