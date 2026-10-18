import { AppBar, Box, Button, Container, Toolbar, Typography } from '@mui/material';
import { Link as RouterLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function Layout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  async function cerrarSesion() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'grey.50' }}>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-3 focus:text-black"
      >
        Ir al contenido
      </a>
      <AppBar position="static" component="header">
        <Toolbar sx={{ gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="h6" component="p" sx={{ flexGrow: 1, fontWeight: 700 }}>
            Atlas
          </Typography>
          <Button color="inherit" component={RouterLink} to="/empresas">
            Mis empresas
          </Button>
          <Button color="inherit" onClick={cerrarSesion}>
            Cerrar sesión
          </Button>
        </Toolbar>
      </AppBar>
      <Container id="contenido" component="main" maxWidth="lg" sx={{ py: 4 }} tabIndex={-1}>
        <Outlet />
      </Container>
    </Box>
  );
}
