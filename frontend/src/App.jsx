import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import RequireAuth from './components/RequireAuth';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import EmpresasPage from './pages/EmpresasPage';
import ClientesPage from './pages/ClientesPage';
import ClienteDetallePage from './pages/ClienteDetallePage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/registro" element={<RegisterPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/empresas" element={<EmpresasPage />} />
        <Route path="/empresas/:empresaId/clientes" element={<ClientesPage />} />
        <Route path="/empresas/:empresaId/clientes/:clienteId" element={<ClienteDetallePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/empresas" replace />} />
    </Routes>
  );
}
