import axios from 'axios';
import { API_BASE_URL, ROUTES } from '../config/constants';

function isAuthEndpoint(url?: string) {
  return url?.startsWith('/auth/') ?? false;
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding auth token
apiClient.interceptors.request.use(
  (config) => {
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }

    const token = localStorage.getItem('token');
    if (token && !isAuthEndpoint(config.url)) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for handling errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !isAuthEndpoint(error.config?.url)) {
      localStorage.removeItem('token');
      window.location.href = ROUTES.LOGIN;
    }
    return Promise.reject(error);
  }
);
