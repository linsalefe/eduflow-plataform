import axios from 'axios';
import { toast } from 'sonner';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api',
});

// Adicionar token automaticamente
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Tratar erros globalmente
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
        localStorage.removeItem('token');
        toast.error('Sessão expirada. Faça login novamente.');
        setTimeout(() => { window.location.href = '/login'; }, 1500);
      }
    } else if (error.response?.status === 500) {
      toast.error('Erro interno do servidor');
    } else if (!error.response) {
      toast.error('Sem conexão com o servidor');
    }
    return Promise.reject(error);
  }
);

export default api;