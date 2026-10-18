import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { Link as RouterLink, useLocation, useParams } from 'react-router-dom';
import { api, mensajeError } from '../api/client';
import { ESTADO_CONTRATO, formatearFecha } from '../utils/format';

const FORM_VACIO = { titulo: '', descripcion: '', fecha_inicio: '', fecha_termino: '' };

export default function ClienteDetallePage() {
  const { empresaId, clienteId } = useParams();
  const location = useLocation();
  // La API no tiene un endpoint para obtener un cliente por id: los datos llegan desde el listado.
  const cliente = location.state?.cliente || null;

  const [rol, setRol] = useState(null);
  const [contratos, setContratos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [errorForm, setErrorForm] = useState('');
  const [guardando, setGuardando] = useState(false);

  const esAdmin = rol === 'administrador';

  useEffect(() => {
    let vigente = true;
    api
      .get('/empresas')
      .then(({ data }) => {
        if (!vigente) return;
        const empresa = data.data.find((e) => String(e.id) === String(empresaId));
        if (empresa) setRol(empresa.rol);
      })
      .catch((err) => vigente && setError(mensajeError(err)));
    return () => {
      vigente = false;
    };
  }, [empresaId]);

  const cargarContratos = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const { data } = await api.get(`/empresas/${empresaId}/clientes/${clienteId}/contratos`);
      setContratos(data.data);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }, [empresaId, clienteId]);

  useEffect(() => {
    cargarContratos();
  }, [cargarContratos]);

  function cambiar(campo) {
    return (e) => setForm({ ...form, [campo]: e.target.value });
  }

  function abrirDialogo() {
    setForm(FORM_VACIO);
    setErrorForm('');
    setDialogoAbierto(true);
  }

  async function guardar(evento) {
    evento.preventDefault();
    setErrorForm('');
    if (form.fecha_termino < form.fecha_inicio) {
      setErrorForm('La fecha de término no puede ser anterior a la de inicio.');
      return;
    }
    setGuardando(true);
    try {
      await api.post(`/empresas/${empresaId}/clientes/${clienteId}/contratos`, {
        titulo: form.titulo.trim(),
        descripcion: form.descripcion.trim() || null,
        fecha_inicio: form.fecha_inicio,
        fecha_termino: form.fecha_termino,
      });
      setDialogoAbierto(false);
      setAviso('Contrato creado.');
      await cargarContratos();
    } catch (err) {
      setErrorForm(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Stack spacing={3}>
      <Button component={RouterLink} to={`/empresas/${empresaId}/clientes`} sx={{ alignSelf: 'flex-start' }}>
        ← Volver a clientes
      </Button>

      <Box>
        <Typography component="h1" variant="h4" sx={{ fontWeight: 700 }}>
          {cliente ? cliente.nombre : `Cliente ${clienteId}`}
        </Typography>
        {rol && <Chip sx={{ mt: 1 }} label={rol === 'administrador' ? 'Administrador' : 'Editor'} />}
      </Box>

      {error && <Alert severity="error" role="alert">{error}</Alert>}
      {aviso && <Alert severity="success" role="status">{aviso}</Alert>}

      {cliente ? (
        <Paper component="section" aria-labelledby="datos-cliente" sx={{ p: 3 }}>
          <Typography id="datos-cliente" component="h2" variant="h5" sx={{ mb: 2 }}>
            Datos del cliente
          </Typography>
          <Stack spacing={1}>
            <Typography><strong>Descripción:</strong> {cliente.descripcion || '—'}</Typography>
            <Typography><strong>Dirección:</strong> {cliente.direccion || '—'}</Typography>
            <Typography><strong>Contacto:</strong> {cliente.contacto || '—'}</Typography>
          </Stack>
        </Paper>
      ) : (
        <Alert severity="info">
          Para ver los datos del cliente, vuelve al listado y entra desde allí. Aquí se muestran sus contratos.
        </Alert>
      )}

      <Paper component="section" aria-labelledby="contratos-cliente" sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
          <Typography id="contratos-cliente" component="h2" variant="h5" sx={{ flexGrow: 1 }}>
            Contratos
          </Typography>
          {esAdmin && (
            <Button variant="contained" onClick={abrirDialogo}>
              Nuevo contrato
            </Button>
          )}
        </Box>

        <TableContainer>
          <Table aria-label="Contratos del cliente">
            <TableHead>
              <TableRow>
                <TableCell>Título</TableCell>
                <TableCell>Inicio</TableCell>
                <TableCell>Término</TableCell>
                <TableCell>Estado</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {contratos.map((contrato) => {
                const estado = ESTADO_CONTRATO[contrato.estado] || { etiqueta: contrato.estado, color: 'default' };
                return (
                  <TableRow key={contrato.id} hover>
                    <TableCell>
                      <Typography fontWeight={600}>{contrato.titulo}</Typography>
                      {contrato.descripcion && <Typography variant="body2" color="text.secondary">{contrato.descripcion}</Typography>}
                    </TableCell>
                    <TableCell>{formatearFecha(contrato.fecha_inicio)}</TableCell>
                    <TableCell>{formatearFecha(contrato.fecha_termino)}</TableCell>
                    <TableCell>
                      <Chip label={estado.etiqueta} color={estado.color} variant="outlined" />
                    </TableCell>
                  </TableRow>
                );
              })}
              {!cargando && contratos.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>Este cliente aún no tiene contratos.</TableCell>
                </TableRow>
              )}
              {cargando && (
                <TableRow>
                  <TableCell colSpan={4}>Cargando contratos…</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog
        open={dialogoAbierto}
        onClose={() => !guardando && setDialogoAbierto(false)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="titulo-contrato"
        slotProps={{ paper: { component: 'form', onSubmit: guardar, noValidate: true } }}
      >
        <DialogTitle id="titulo-contrato">Nuevo contrato</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            {errorForm && <Alert severity="error" role="alert">{errorForm}</Alert>}
            <TextField label="Título" value={form.titulo} onChange={cambiar('titulo')} required fullWidth autoFocus slotProps={{ htmlInput: { maxLength: 150 } }} />
            <TextField label="Descripción" value={form.descripcion} onChange={cambiar('descripcion')} multiline minRows={2} fullWidth slotProps={{ htmlInput: { maxLength: 2000 } }} />
            <TextField label="Fecha de inicio" type="date" value={form.fecha_inicio} onChange={cambiar('fecha_inicio')} required fullWidth slotProps={{ inputLabel: { shrink: true } }} />
            <TextField label="Fecha de término" type="date" value={form.fecha_termino} onChange={cambiar('fecha_termino')} required fullWidth slotProps={{ inputLabel: { shrink: true } }} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => setDialogoAbierto(false)} disabled={guardando}>Cancelar</Button>
          <Button type="submit" variant="contained" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar contrato'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
