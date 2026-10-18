import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Pagination, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { api, mensajeError } from '../api/client';
import { ROL_ETIQUETA } from '../utils/format';

const LIMITE = 10;
const CAMPOS_VACIOS = { nombre: '', descripcion: '', direccion: '', contacto: '' };

export default function ClientesPage() {
  const { empresaId } = useParams();
  const [rol, setRol] = useState(null);
  const [nombreEmpresa, setNombreEmpresa] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [q, setQ] = useState('');
  const [pagina, setPagina] = useState(1);
  const [clientes, setClientes] = useState([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [dialogo, setDialogo] = useState(null); // { modo: 'crear' } o { modo: 'editar', id }
  const [form, setForm] = useState(CAMPOS_VACIOS);
  const [errorForm, setErrorForm] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [aEliminar, setAEliminar] = useState(null);

  const esAdmin = rol === 'administrador';
  const totalPaginas = Math.max(1, Math.ceil(total / LIMITE));

  // Rol del usuario en esta empresa (RB-4 y RB-5). La API también lo valida en cada operación.
  useEffect(() => {
    let vigente = true;
    api
      .get('/empresas')
      .then(({ data }) => {
        if (!vigente) return;
        const empresa = data.data.find((e) => String(e.id) === String(empresaId));
        if (empresa) {
          setRol(empresa.rol);
          setNombreEmpresa(empresa.nombre);
        }
      })
      .catch((err) => vigente && setError(mensajeError(err)));
    return () => {
      vigente = false;
    };
  }, [empresaId]);

  const cargarClientes = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const { data } = await api.get(`/empresas/${empresaId}/clientes`, {
        params: { page: pagina, limit: LIMITE, q: q || undefined },
      });
      setClientes(data.data);
      setTotal(data.total);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }, [empresaId, pagina, q]);

  useEffect(() => {
    cargarClientes();
  }, [cargarClientes]);

  function buscar(evento) {
    evento.preventDefault();
    setPagina(1);
    setQ(busqueda.trim());
  }

  function abrirCrear() {
    setForm(CAMPOS_VACIOS);
    setErrorForm('');
    setDialogo({ modo: 'crear' });
  }

  function abrirEditar(cliente) {
    setForm({
      nombre: cliente.nombre,
      descripcion: cliente.descripcion || '',
      direccion: cliente.direccion || '',
      contacto: cliente.contacto || '',
    });
    setErrorForm('');
    setDialogo({ modo: 'editar', id: cliente.id });
  }

  function cambiar(campo) {
    return (e) => setForm({ ...form, [campo]: e.target.value });
  }

  async function guardar(evento) {
    evento.preventDefault();
    setErrorForm('');
    setGuardando(true);
    const cuerpo = {
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
      direccion: form.direccion.trim() || null,
      contacto: form.contacto.trim() || null,
    };
    try {
      if (dialogo.modo === 'crear') {
        await api.post(`/empresas/${empresaId}/clientes`, cuerpo);
        setAviso('Cliente creado.');
      } else {
        await api.put(`/empresas/${empresaId}/clientes/${dialogo.id}`, cuerpo);
        setAviso('Cliente actualizado.');
      }
      setDialogo(null);
      await cargarClientes();
    } catch (err) {
      setErrorForm(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (!aEliminar) return;
    setError('');
    setAviso('');
    try {
      // Eliminación lógica: la API exige confirmación explícita (RF-4.3).
      await api.delete(`/empresas/${empresaId}/clientes/${aEliminar.id}`, { data: { confirmar: true } });
      setAviso(`Cliente «${aEliminar.nombre}» eliminado.`);
      setAEliminar(null);
      if (clientes.length === 1 && pagina > 1) setPagina(pagina - 1);
      else await cargarClientes();
    } catch (err) {
      setError(mensajeError(err));
      setAEliminar(null);
    }
  }

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography component="h1" variant="h4" sx={{ fontWeight: 700 }}>
            Clientes
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {nombreEmpresa || `Empresa ${empresaId}`}
          </Typography>
        </Box>
        {rol && <Chip label={ROL_ETIQUETA[rol] || rol} color={esAdmin ? 'primary' : 'default'} />}
        {esAdmin && (
          <Button variant="contained" onClick={abrirCrear}>
            Nuevo cliente
          </Button>
        )}
      </Box>

      {rol === 'editor' && (
        <Alert severity="info">Tu rol de editor permite solo ver los datos de los clientes.</Alert>
      )}
      {error && <Alert severity="error" role="alert">{error}</Alert>}
      {aviso && <Alert severity="success" role="status">{aviso}</Alert>}

      <Paper component="section" aria-label="Listado de clientes" sx={{ p: 3 }}>
        <Box component="form" role="search" onSubmit={buscar} sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 3 }}>
          <TextField
            label="Buscar por nombre"
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            sx={{ minWidth: 260, flexGrow: 1 }}
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <Button type="submit" variant="outlined">Buscar</Button>
        </Box>

        <TableContainer>
          <Table aria-label="Clientes">
            <TableHead>
              <TableRow>
                <TableCell>Nombre</TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Contacto</TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Dirección</TableCell>
                {esAdmin && <TableCell align="right">Acciones</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {clientes.map((cliente) => (
                <TableRow key={cliente.id} hover>
                  <TableCell>
                    <RouterLink
                      to={`/empresas/${empresaId}/clientes/${cliente.id}`}
                      state={{ cliente }}
                      style={{ color: '#0b4f8a', fontWeight: 600 }}
                    >
                      {cliente.nombre}
                    </RouterLink>
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{cliente.contacto || '—'}</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{cliente.direccion || '—'}</TableCell>
                  {esAdmin && (
                    <TableCell align="right">
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="flex-end" alignItems={{ xs: 'flex-end', sm: 'center' }}>
                        <Button size="medium" onClick={() => abrirEditar(cliente)} aria-label={`Editar ${cliente.nombre}`}>
                          Editar
                        </Button>
                        <Button size="medium" color="error" onClick={() => setAEliminar(cliente)} aria-label={`Eliminar ${cliente.nombre}`}>
                          Eliminar
                        </Button>
                      </Stack>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {!cargando && clientes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={esAdmin ? 4 : 3}>
                    {q ? `No hay clientes que coincidan con «${q}».` : 'Aún no hay clientes registrados.'}
                  </TableCell>
                </TableRow>
              )}
              {cargando && (
                <TableRow>
                  <TableCell colSpan={esAdmin ? 4 : 3}>Cargando clientes…</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
          <Pagination count={totalPaginas} page={pagina} onChange={(_, p) => setPagina(p)} color="primary" size="large" />
        </Box>
      </Paper>

      <Dialog
        open={Boolean(dialogo)}
        onClose={() => !guardando && setDialogo(null)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="titulo-cliente"
        slotProps={{ paper: { component: 'form', onSubmit: guardar, noValidate: true } }}
      >
        <DialogTitle id="titulo-cliente">{dialogo?.modo === 'editar' ? 'Editar cliente' : 'Nuevo cliente'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            {errorForm && <Alert severity="error" role="alert">{errorForm}</Alert>}
            <TextField label="Nombre" value={form.nombre} onChange={cambiar('nombre')} required fullWidth autoFocus slotProps={{ htmlInput: { maxLength: 150 } }} />
            <TextField label="Descripción" value={form.descripcion} onChange={cambiar('descripcion')} multiline minRows={2} fullWidth slotProps={{ htmlInput: { maxLength: 2000 } }} />
            <TextField label="Dirección" value={form.direccion} onChange={cambiar('direccion')} fullWidth slotProps={{ htmlInput: { maxLength: 255 } }} />
            <TextField label="Información de contacto" value={form.contacto} onChange={cambiar('contacto')} fullWidth slotProps={{ htmlInput: { maxLength: 150 } }} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => setDialogo(null)} disabled={guardando}>Cancelar</Button>
          <Button type="submit" variant="contained" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(aEliminar)} onClose={() => setAEliminar(null)} aria-labelledby="titulo-eliminar">
        <DialogTitle id="titulo-eliminar">¿Eliminar cliente?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Se eliminará «{aEliminar?.nombre}». El cliente dejará de aparecer en el listado.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => setAEliminar(null)}>Cancelar</Button>
          <Button variant="contained" color="error" onClick={eliminar}>
            Sí, eliminar
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
