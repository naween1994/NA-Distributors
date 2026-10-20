import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { User, Settings } from './types';
import { api, post, setCsrf } from './api';
type Notice = { id: number; message: string; type: 'success' | 'error' };
interface AppContextType {
  user: User | null;
  settings: Settings | null;
  loading: boolean;
  setupRequired: boolean;
  setupTokenRequired: boolean;
  error: string;
  refresh: () => Promise<void>;
  reloadSettings: () => Promise<void>;
  authenticate: (result: { user: User; csrf: string }) => Promise<void>;
  logout: () => Promise<void>;
  can: (permission: string) => boolean;
  toast: (message: string, type?: 'success' | 'error') => void;
}
const AppContext = createContext<AppContextType>(null!);
export const useApp = () => useContext(AppContext);
export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [settings, setSettings] = useState<Settings | null>(null),
    [loading, setLoading] = useState(true),
    [setupRequired, setSetup] = useState(false),
    [setupTokenRequired, setSetupTokenRequired] = useState(false),
    [error, setError] = useState(''),
    [notices, setNotices] = useState<Notice[]>([]);
  const toast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now() + Math.random();
    setNotices((n) => [...n.slice(-2), { id, message, type }]);
    setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), 5500);
  }, []);
  const reloadSettings = useCallback(async () => {
    setSettings(await api<Settings>('/settings'));
  }, []);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const status = await api<{ setupRequired: boolean; setupTokenRequired?: boolean }>(
        '/auth/status',
      );
      setSetup(status.setupRequired);
      setSetupTokenRequired(!!status.setupTokenRequired);
      if (!status.setupRequired) {
        try {
          const session = await api<{ user: User; csrf: string }>('/auth/me');
          setCsrf(session.csrf);
          setUser(session.user);
          if (!session.user.mustChangePassword) await reloadSettings();
        } catch (e) {
          if ((e as Error).message !== 'Please sign in.') throw e;
          setUser(null);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [reloadSettings]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const expired = () => {
      setUser(null);
      setCsrf('');
      setSettings(null);
    };
    window.addEventListener('na-session-expired', expired);
    return () => window.removeEventListener('na-session-expired', expired);
  }, []);
  const authenticate = async (result: { user: User; csrf: string }) => {
    setCsrf(result.csrf);
    setUser(result.user);
    setSetup(false);
    if (!result.user.mustChangePassword) await reloadSettings();
  };
  const logout = async () => {
    await post('/auth/logout', {});
    setUser(null);
    setCsrf('');
    setSettings(null);
  };
  return (
    <AppContext.Provider
      value={{
        user,
        settings,
        loading,
        setupRequired,
        setupTokenRequired,
        error,
        refresh,
        reloadSettings,
        authenticate,
        logout,
        can: (p) => !!user?.permissions.includes(p),
        toast,
      }}
    >
      {children}
      <div className="toast-stack" aria-live="polite">
        {notices.map((n) => (
          <div key={n.id} className={'toast ' + n.type}>
            <span>
              {n.type === 'success' ? '✓' : '!'} {n.message}
            </span>
            <button
              aria-label="Dismiss notification"
              onClick={() => setNotices((a) => a.filter((x) => x.id !== n.id))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}
