import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, Paper, Stack, TextField, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { api, mensajeError } from '../api/client';
import { ROL_ETIQUETA } from '../utils/format';

const FORM_VACIO = { nombre: '', direccion: '', telefono: '', correo: '' };

export default function EmpresasPage() {
  const navigate = useNavigate();
  const [empresas, setEmpresas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(FORM_VACIO);
  const [creando, setCreando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const cargar = useCallback(async () => {
    setError('');
    try {
      const { data } = await api.get('/empresas');
      setEmpresas(data.data);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function cambiar(campo) {
    return (e) => setForm({ ...form, [campo]: e.target.value });
  }

  async function crearEmpresa(evento) {
    evento.preventDefault();
    setError('');
    setMensaje('');
    setCreando(true);
    try {
      const { data } = await api.post('/empresas', {
        nombre: form.nombre.trim(),
        direccion: form.direccion.trim(),
        telefono: form.telefono.trim(),
        correo: form.correo.trim(),
      });
      setForm(FORM_VACIO);
      setMensaje(`Empresa «${data.nombre}» creada. Quedaste como administrador.`);
      await cargar();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCreando(false);
    }
  }

  return (
    <Stack spacing={4}>
      <Box>
        <Typography component="h1" variant="h4" sx={{ fontWeight: 700 }}>
          Mis empresas
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Elige una empresa para ver sus clientes.
        </Typography>
      </Box>

      {error && <Alert severity="error" role="alert">{error}</Alert>}
      {mensaje && <Alert severity="success">{mensaje}</Alert>}

      <Paper component="section" aria-labelledby="lista-empresas" sx={{ p: 3 }}>
        <Typography id="lista-empresas" component="h2" variant="h5" sx={{ mb: 2 }}>
          Empresas
        </Typography>
        {cargando && <Typography>Cargando empresas…</Typography>}
        {!cargando && empresas.length === 0 && (
          <Typography>Aún no perteneces a ninguna empresa. Crea una abajo.</Typography>
        )}
        <Stack spacing={2}>
          {empresas.map((empresa) => (
            <Paper key={empresa.id} variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Typography component="h3" variant="h6" sx={{ flexGrow: 1 }}>
                {empresa.nombre}
              </Typography>
              <Chip label={ROL_ETIQUETA[empresa.rol] || empresa.rol} color={empresa.rol === 'administrador' ? 'primary' : 'default'} />
              <Button variant="contained" onClick={() => navigate(`/empresas/${empresa.id}/clientes`)} aria-label={`Ver clientes de ${empresa.nombre}`}>
                Ver clientes
              </Button>
            </Paper>
          ))}
        </Stack>
      </Paper>

      <Paper component="section" aria-labelledby="nueva-empresa" sx={{ p: 3 }}>
        <Typography id="nueva-empresa" component="h2" variant="h5" sx={{ mb: 2 }}>
          Crear una empresa
        </Typography>
        <Box component="form" onSubmit={crearEmpresa} noValidate>
          <Stack spacing={2.5} sx={{ maxWidth: 560 }}>
            <TextField label="Nombre de la empresa" value={form.nombre} onChange={cambiar('nombre')} required fullWidth slotProps={{ htmlInput: { maxLength: 150 } }} />
            <TextField label="Dirección" value={form.direccion} onChange={cambiar('direccion')} required fullWidth slotProps={{ htmlInput: { maxLength: 255 } }} />
            <TextField label="Teléfono" value={form.telefono} onChange={cambiar('telefono')} required fullWidth slotProps={{ htmlInput: { maxLength: 30 } }} />
            <TextField label="Correo de la empresa" type="email" value={form.correo} onChange={cambiar('correo')} required fullWidth />
            <Box>
              <Button type="submit" variant="contained" disabled={creando}>
                {creando ? 'Creando…' : 'Crear empresa'}
              </Button>
            </Box>
          </Stack>
        </Box>
      </Paper>
    </Stack>
  );
}
