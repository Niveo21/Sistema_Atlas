import axios from 'axios';

export const TOKEN_KEY = 'atlas_token';
export const EVENTO_SESION_VENCIDA = 'atlas:sesion-vencida';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export const api = axios.create({ baseURL, timeout: 15000 });

// Adjunta el JWT en cada petición. El token vive solo en sessionStorage de la pestaña.
api.interceptors.request.use((config) => {
  let token = null;
  try {
    token = sessionStorage.getItem(TOKEN_KEY);
  } catch {
    // Almacenamiento bloqueado: la sesión queda solo en memoria y pedirá login otra vez.
  }
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Si la API responde 401 fuera del login o logout, la sesión venció o fue revocada.
api.interceptors.response.use(
  (response) => response,
  (err) => {
    const url = err.config?.url || '';
    const esAuth = url.includes('/auth/login') || url.includes('/auth/logout');
    if (err.response?.status === 401 && !esAuth) {
      try {
        sessionStorage.removeItem(TOKEN_KEY);
      } catch {
        // Sin almacenamiento no hay nada que limpiar.
      }
      window.dispatchEvent(new Event(EVENTO_SESION_VENCIDA));
    }
    return Promise.reject(err);
  }
);

// Convierte el error de la API en un mensaje legible para la persona usuaria.
export function mensajeError(err) {
  const data = err.response?.data;
  if (data?.error) {
    const detalles = Array.isArray(data.details) ? data.details : [];
    return detalles.length ? `${data.error}: ${detalles.join('. ')}` : data.error;
  }
  if (!err.response) {
    return 'No se pudo conectar con el servidor. Verifica que la API de Atlas esté en ejecución.';
  }
  return 'Ocurrió un error inesperado. Intenta nuevamente.';
}
