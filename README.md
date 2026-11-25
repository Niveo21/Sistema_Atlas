# Atlas — Sistema de gestión de clientes, contratos y documentos

[![CI](https://github.com/Niveo21/Sistema_Atlas/actions/workflows/ci.yml/badge.svg)](https://github.com/Niveo21/Sistema_Atlas/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Niveo21/Sistema_Atlas/actions/workflows/codeql.yml/badge.svg)](https://github.com/Niveo21/Sistema_Atlas/actions/workflows/codeql.yml)

Atlas es una aplicación web para que pymes chilenas gestionen sus clientes, contratos y documentos. Guarda datos personales y bancarios de terceros, por lo que la seguridad se trata como requisito legal (Ley 19.628 y Ley 21.719, vigente desde el 01/12/2026).

Proyecto académico de la asignatura **ISY1102 – Seguridad y Calidad en el Desarrollo de Software** (Duoc UC, sección 003V). Equipo: Jesús Martínez, Gonzalo Diaz y Claudio Mattos.

## Tecnologías

| Capa | Tecnología |
|---|---|
| Backend | Node.js 20+, Express 5, JWT (HS256, 15 min, con revocación al cerrar sesión), bcryptjs, helmet, multer |
| Base de datos | PostgreSQL 16 (contenedor Docker) |
| Frontend | React, Vite, Tailwind |
| Pruebas | Jest + Supertest, Stryker, Playwright, axe-core, JMeter |
| Seguridad y calidad | ESLint + eslint-plugin-security, SonarCloud, CodeQL, gitleaks, npm audit, OWASP ZAP, SQLMap |

## Estructura del repositorio

```
backend/         API REST (src/, tests/, scripts/)
frontend/        Interfaz web (React + Vite)
db/              Esquema SQL inicial
pruebas-e2e/     Pruebas de punta a punta (Playwright) y accesibilidad (axe-core)
.github/workflows/   ci.yml, security.yml, codeql.yml
evidencias_jest.txt  Salida de la ejecución completa de Jest con cobertura
```

## Puesta en marcha

Requisitos: Node.js 20 o superior (el frontend pide 20.19+), Docker y npm.

### 1. Base de datos

```bash
# Define la clave de PostgreSQL (no la subas a Git)
export POSTGRES_PASSWORD=una_clave_segura
docker compose up -d db
```

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env     # completa DATABASE_URL y JWT_SECRET (mínimo 64 caracteres aleatorios)
npm run db:migrate       # aplica db/001_esquema_inicial.sql
npm start                # http://localhost:4000/api/health
```

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev              # http://localhost:3000
```

> **Nunca subas archivos `.env` al repositorio.** Los secretos se revisan con gitleaks en cada push.

## Pruebas

### Pruebas automatizadas del backend (Jest + Supertest)

Las pruebas usan una base de datos real y **vacían sus tablas**, por lo que deben correr contra una base **separada** (nunca la de QA ni la de desarrollo).

```bash
# Crea una base exclusiva para pruebas y aplica el esquema
docker compose exec db psql -U atlas -c "CREATE DATABASE atlas_test;"
cd backend
DATABASE_URL=postgres://atlas:TU_CLAVE@localhost:5432/atlas_test npm run db:migrate

# Ejecuta las pruebas
TEST_DATABASE_URL=postgres://atlas:TU_CLAVE@localhost:5432/atlas_test npm test
```

En Windows (cmd): `set TEST_DATABASE_URL=postgres://atlas:TU_CLAVE@localhost:5432/atlas_test` y luego `npm.cmd test`.

Resultado vigente: **74 de 74 pruebas aprobadas** (49 de integración + 25 unitarias), cobertura del backend 90,57 % de sentencias. La salida completa está en `evidencias_jest.txt`.

### Otras verificaciones

| Comando | Qué hace |
|---|---|
| `npm run lint` (en `backend/`) | ESLint con el plugin de seguridad |
| `npm run format:check` (en `backend/`) | Comprueba el formato con Prettier |
| `npm run test:mutacion` (en `backend/`) | Pruebas de mutación con Stryker (103 de 103 mutantes eliminados; umbral de ruptura 60) |
| `npm run seed`, `npm run e2e`, `npm run a11y` (en `pruebas-e2e/`) | Datos de demo, flujo de punta a punta de 14 pasos y accesibilidad WCAG 2.1 AA con axe-core |

Las pruebas E2E requieren el backend y el frontend en ejecución.

## Automatización de calidad y seguridad (CI)

| Workflow | Cuándo corre | Qué hace |
|---|---|---|
| `ci.yml` | Cada push y pull request | gitleaks, npm audit, ESLint, Jest + Supertest, build del frontend, Stryker, SonarCloud (Quality Gate bloqueante), Playwright + axe-core |
| `codeql.yml` | Cada push y los lunes 07:00 UTC | Análisis estático de seguridad (SAST) con CodeQL |
| `security.yml` | Los lunes 06:00 UTC y manual | npm audit de producción y OWASP ZAP baseline |

El escaneo activo de ZAP y SQLMap se ejecuta **a mano**, solo en el ambiente de QA y con autorización, porque envía cargas maliciosas que podrían alterar datos.

## Estado de seguridad

El detalle completo está en el informe del plan de pruebas (v2.5). Resumen de los incidentes abiertos más importantes:

| ID | Gravedad | Descripción |
|---|---|---|
| INC-01 | Crítico | Datos bancarios sin cifrar en reposo (la columna existe, los endpoints no la usan) |
| INC-02 | Grave | La aplicación puede modificar la tabla de auditoría |
| INC-03 | Grave | El ambiente de QA responde solo por HTTP, sin TLS |
| INC-04 | Grave | Falta la gestión de usuarios de la empresa |
| INC-05 | Grave | Sin límite de intentos en el login (fuerza bruta) |
| INC-07 | Grave | Sin política de respaldo y restauración |

**Atlas aún no es apto para datos reales de terceros** hasta resolver el incidente crítico y los graves.

## Hoja de ruta

1. **Iteración 1:** cifrado de datos bancarios, auditoría protegida, TLS y límite de intentos (INC-01, 02, 03 y 05), con pruebas de regresión en el pipeline.
2. **Iteración 2:** gestión de usuarios, respaldo y restauración, registro de accesos denegados y documentación OpenAPI.
3. **Iteración 3:** notificación de brechas, firma electrónica, conservación de documentos y limpieza de validaciones.

Cada iteración se cierra con el CI en verde, el Quality Gate aprobado y 0 defectos críticos o graves abiertos.

## Plan de mantenimiento

| Actividad | Frecuencia | Referencia |
|---|---|---|
| Regresión automatizada | Cada push y pull request | ISO/IEC 29119, ISO/IEC 25010 |
| Dependencias y secretos | Cada push; revisión cada lunes | OWASP A06:2021, ISO/IEC 27001:2022 A.8.8 |
| Análisis de seguridad | CodeQL y ZAP cada lunes; ZAP activo y SQLMap antes de cada release | OWASP ASVS, ISO/IEC 27001:2022 A.8.29 |
| Respaldo y restauración (propuesto) | Respaldo diario; prueba de restauración mensual | ISO/IEC 27001:2022 A.8.13 |
| Vigilancia normativa | Trimestral | Leyes 19.628, 21.719 y 21.663 |
| Corrección de incidentes | Crítico: inmediato; grave: urgente; moderado: próxima iteración | ISO/IEC/IEEE 14764 |

## Documentación adicional

- `backend/README.md`: endpoints, reglas de documentos y decisiones pendientes de la API.
- Informe del plan de pruebas (v2.5) y presentación de la defensa EP3: se entregan por la plataforma AVA.

## Licencia y uso

Proyecto académico. No usar en producción ni con datos reales de personas.
