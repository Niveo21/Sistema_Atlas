import { useState } from 'react';
import { Alert, Box, Button, Link, Paper, Stack, TextField, Typography } from '@mui/material';
import { Link as RouterLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { mensajeError } from '../api/client';

export default function LoginPage() {
  const { autenticado, aviso, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const destino = location.state?.desde || '/empresas';
  const mensajeRegistro = location.state?.mensaje;

  if (autenticado) return <Navigate to={destino} replace />;

  async function enviar(evento) {
    evento.preventDefault();
    setError('');
    setEnviando(true);
    try {
      await login(usuario.trim(), clave);
      navigate(destino, { replace: true });
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Box component="main" sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'grey.50', p: 2 }}>
      <Paper component="section" aria-labelledby="titulo-login" elevation={2} sx={{ p: 4, width: '100%', maxWidth: 440 }}>
        <Typography id="titulo-login" component="h1" variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
          Atlas
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          Ingresa con tu nombre de usuario y contraseña.
        </Typography>

        {mensajeRegistro && <Alert severity="success" sx={{ mb: 2 }}>{mensajeRegistro}</Alert>}
        {aviso && <Alert severity="info" sx={{ mb: 2 }}>{aviso}</Alert>}
        {error && (
          <Alert severity="error" role="alert" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={enviar} noValidate>
          <Stack spacing={2.5}>
            <TextField
              label="Nombre de usuario"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              autoComplete="username"
              required
              fullWidth
              slotProps={{ htmlInput: { maxLength: 50 } }}
            />
            <TextField
              label="Contraseña"
              type="password"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              autoComplete="current-password"
              required
              fullWidth
            />
            <Button type="submit" variant="contained" fullWidth disabled={enviando}>
              {enviando ? 'Ingresando…' : 'Ingresar'}
            </Button>
          </Stack>
        </Box>

        <Typography variant="body1" sx={{ mt: 3 }}>
          ¿No tienes cuenta?{' '}
          <Link component={RouterLink} to="/registro">
            Regístrate aquí
          </Link>
        </Typography>
      </Paper>
    </Box>
  );
}
