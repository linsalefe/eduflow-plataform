'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import api from '@/lib/api';

interface Features {
  dashboard?: boolean;
  conversas?: boolean;
  pipeline?: boolean;
  financeiro?: boolean;
  landing_pages?: boolean;
  campanhas?: boolean;
  relatorios?: boolean;
  usuarios?: boolean;
  automacoes?: boolean;
  tarefas?: boolean;
  voice_ai?: boolean;
  ai_whatsapp?: boolean;
  agenda?: boolean;
  [key: string]: boolean | undefined;
}

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  tenant_id?: number | null;
  features?: Features;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hasFeature: (feature: string) => boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      api.get('/auth/me')
        .then(res => setUser(res.data))
        .catch(() => { localStorage.removeItem('token'); delete api.defaults.headers.common['Authorization']; })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    const { access_token, user: userData } = res.data;
    localStorage.setItem('token', access_token);
    api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
  };

  const hasFeature = (feature: string): boolean => {
    if (!user) return false;
    if (user.role === 'superadmin') return true;
    if (!user.features) return true;
    return user.features[feature] !== false;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasFeature }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);