import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, EVENTO_SESION_VENCIDA, TOKEN_KEY } from '../api/client';

const AuthContext = createContext(null);

function leerToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function guardarToken(token) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Sin almacenamiento la sesión dura solo mientras la pestaña esté abierta en memoria.
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(leerToken);
  const [aviso, setAviso] = useState('');

  const cerrarSesionLocal = useCallback((mensaje = '') => {
    guardarToken(null);
    setToken(null);
    setAviso(mensaje);
  }, []);

  useEffect(() => {
    const onVencida = () => cerrarSesionLocal('Tu sesión venció. Vuelve a ingresar.');
    window.addEventListener(EVENTO_SESION_VENCIDA, onVencida);
    return () => window.removeEventListener(EVENTO_SESION_VENCIDA, onVencida);
  }, [cerrarSesionLocal]);

  const login = useCallback(async (nombreUsuario, password) => {
    const { data } = await api.post('/auth/login', { nombre_usuario: nombreUsuario, password });
    guardarToken(data.token);
    setAviso('');
    setToken(data.token);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Si la sesión ya venció, igual se cierra localmente.
    }
    cerrarSesionLocal('');
  }, [cerrarSesionLocal]);

  const value = useMemo(
    () => ({ token, autenticado: Boolean(token), aviso, login, logout }),
    [token, aviso, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
