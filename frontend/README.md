# Atlas · Frontend

Interfaz web del Sistema de Gestión Atlas, construida con React 19, Material UI 7 y Tailwind CSS 3, sobre la API REST del backend (Express + PostgreSQL).

## Requisitos

- Node.js 20.19 o superior (Vite 7).
- Backend de Atlas en ejecución en `http://localhost:4000` (ver `backend/README.md`).

## Ejecutar

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

Si la API está en otra dirección, copia `.env.example` a `.env` y ajusta `VITE_API_URL`. El backend ya permite el origen `http://localhost:3000` por defecto (`CORS_ORIGIN`).

Para compilar la versión de producción: `npm run build`. Para servirla: `npm run preview`.

## Alcance implementado

| Requisito | Pantalla | Estado |
|---|---|---|
| RF-1.1 Inicio de sesión | Login | Implementado |
| RF-1.2 Cierre de sesión | Barra superior | Implementado |
| RF-2.1 Registro de usuarios | Crear cuenta | Implementado |
| RF-2.2 Creación de empresa | Mis empresas | Implementado |
| RF-3.2 Editor solo visualiza | Clientes (sin acciones) | Implementado en la interfaz; la API también lo exige |
| RF-4.1 a RF-4.3 Clientes | Clientes | Crear, editar, listar con paginación y búsqueda, eliminar con confirmación |
| RF-5.1 y RF-5.4 Contratos | Detalle del cliente | Crear y listar, con estado calculado (activo, vence, expirado) |
| RF-3.1 y RF-3.3 Usuarios de la empresa | — | Pendiente (la API lo tiene; falta la pantalla) |
| RF-5.2, RF-5.3 y RF-5.5 Documentos | — | Pendiente |
| RF-6 Auditoría | — | Pendiente (la API la registra; falta la vista) |

## Decisiones de diseño

- **Token JWT en `sessionStorage`.** Se borra al cerrar la pestaña. Una alternativa más robusta sería una cookie `HttpOnly`, lo que requiere cambios en el backend.
- **Tailwind sin preflight.** El reset de estilos lo aporta MUI (`CssBaseline`), para que no se pisen.
- **Tipografía base de 16 px y botones grandes**, pensados para adultos mayores (NFR-USAB-1).
- **Detalle de cliente.** La API no tiene un endpoint para obtener un cliente por id, así que los datos llegan desde el listado. Si se abre el enlace directamente, solo se muestran los contratos.
- **Vencimiento de sesión.** Si la API responde 401, la interfaz cierra la sesión y avisa al usuario.

## Pruebas

Las pruebas de punta a punta y de accesibilidad están en la carpeta `../pruebas-e2e`.
