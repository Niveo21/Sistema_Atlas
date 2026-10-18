import { useState } from 'react';
import { Alert, Box, Button, Link, Paper, Stack, TextField, Typography } from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { api, mensajeError } from '../api/client';

// Misma política que el backend (ERS 2.4): 12 caracteres, mayúscula, minúscula, número y símbolo.
const POLITICA = 'Mínimo 12 caracteres, con mayúscula, minúscula, número y símbolo.';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ nombre_usuario: '', correo: '', password: '', confirmacion: '' });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  function cambiar(campo) {
    return (e) => setForm({ ...form, [campo]: e.target.value });
  }

  async function enviar(evento) {
    evento.preventDefault();
    setError('');
    if (form.password !== form.confirmacion) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setEnviando(true);
    try {
      await api.post('/auth/register', {
        nombre_usuario: form.nombre_usuario.trim(),
        correo: form.correo.trim(),
        password: form.password,
      });
      navigate('/login', { replace: true, state: { mensaje: 'Cuenta creada. Ya puedes ingresar.' } });
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Box component="main" sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'grey.50', p: 2 }}>
      <Paper component="section" aria-labelledby="titulo-registro" elevation={2} sx={{ p: 4, width: '100%', maxWidth: 480 }}>
        <Typography id="titulo-registro" component="h1" variant="h4" sx={{ fontWeight: 700, mb: 3 }}>
          Crear cuenta
        </Typography>

        {error && (
          <Alert severity="error" role="alert" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={enviar} noValidate>
          <Stack spacing={2.5}>
            <TextField label="Nombre de usuario" value={form.nombre_usuario} onChange={cambiar('nombre_usuario')} autoComplete="username" required fullWidth />
            <TextField label="Correo electrónico" type="email" value={form.correo} onChange={cambiar('correo')} autoComplete="email" required fullWidth />
            <TextField
              label="Contraseña"
              type="password"
              value={form.password}
              onChange={cambiar('password')}
              autoComplete="new-password"
              required
              fullWidth
              helperText={POLITICA}
            />
            <TextField label="Repite la contraseña" type="password" value={form.confirmacion} onChange={cambiar('confirmacion')} autoComplete="new-password" required fullWidth />
            <Button type="submit" variant="contained" fullWidth disabled={enviando}>
              {enviando ? 'Creando cuenta…' : 'Crear cuenta'}
            </Button>
          </Stack>
        </Box>

        <Typography variant="body1" sx={{ mt: 3 }}>
          ¿Ya tienes cuenta?{' '}
          <Link component={RouterLink} to="/login">
            Ingresa aquí
          </Link>
        </Typography>
      </Paper>
    </Box>
  );
}
