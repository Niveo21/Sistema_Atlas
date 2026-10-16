# Atlas — Backend (API REST)

API del Sistema de Gestión Atlas: Node.js + Express + PostgreSQL. Implementa autenticación con JWT, control de acceso por rol, clientes, contratos y auditoría, según el ERS v1.1.

## Requisitos
- Node.js 20 o superior
- PostgreSQL 16 (o usar el contenedor del `docker-compose.yml` de la raíz del proyecto)

## Puesta en marcha
```bash
cd backend
npm install
cp .env.example .env        # completa DATABASE_URL y JWT_SECRET
npm run db:migrate          # aplica db/001_esquema_inicial.sql
npm start                   # http://localhost:4000/api/health
```

## Pruebas
```bash
npm test
```
Las pruebas usan una base de datos real. Para usar otra base, define `TEST_DATABASE_URL`. La base debe tener el esquema aplicado.

## Endpoints implementados

| Método | Ruta | Acceso | Requisito |
|---|---|---|---|
| POST | `/api/auth/register` | Público | RF-2.1 |
| POST | `/api/auth/login` | Público | RF-1.1 |
| POST | `/api/auth/logout` | Autenticado | RF-1.2 |
| POST | `/api/empresas` | Autenticado | RF-2.2, RF-2.3 |
| GET | `/api/empresas` | Autenticado | — |
| POST | `/api/empresas/:empresaId/usuarios` | Administrador | RF-3.1 |
| GET | `/api/empresas/:empresaId/clientes` | Miembro | RF-4.2 |
| POST | `/api/empresas/:empresaId/clientes` | Administrador | RF-4.1 |
| PUT | `/api/empresas/:empresaId/clientes/:id` | Administrador | RF-4.2 |
| DELETE | `/api/empresas/:empresaId/clientes/:id` | Administrador (body `confirmar: true`) | RF-4.3 |
| GET | `/api/empresas/:empresaId/clientes/:clienteId/contratos` | Miembro | RF-5.1, RF-5.4 |
| POST | `/api/empresas/:empresaId/clientes/:clienteId/contratos` | Administrador | RF-5.1 |

Un usuario que no pertenece a la empresa recibe **404** (no 403), para no revelar que la empresa existe.

## Pendiente (siguiente etapa)
- Documentos: subida, descarga y enlaces para compartir (RF-5.2, RF-5.3, RF-5.5). Requiere almacenamiento interno y un token aleatorio con vigencia.
- Cifrado de `datos_bancarios` (NFR-SEG-3): la columna existe en el esquema, pero los endpoints aún no la usan.
- Edición y eliminación de contratos; listado y bajas de usuarios de la empresa (RF-3.3).
- Limitador de intentos para el login (NFR-SEG-5).
- Política de respaldo y restauración (NFR-SEG-7).

## Decisiones a confirmar con el equipo
- Umbral de "vence" para contratos: 30 días (`DIAS_VENCIMIENTO` en `src/routes/contratos.js`). El ERS no lo define.
- Duración del token: 15 minutos (`JWT_EXPIRES_IN`). El ERS pide "corta vigencia" sin número.
- Creador de empresa = administrador (RF-2.3). Se asume que el primer usuario de cada empresa es quien la crea.
