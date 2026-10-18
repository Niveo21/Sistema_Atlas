-- =====================================================================
-- Atlas - Esquema inicial de base de datos (PostgreSQL)
-- Derivado del ERS v1.1 (RF-1 a RF-6, NFR-SEG-*, RB-1 a RB-5)
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Empresas (RF-2.2)
-- ---------------------------------------------------------------------
CREATE TABLE empresa (
    id          SERIAL PRIMARY KEY,
    nombre      VARCHAR(150) NOT NULL,
    direccion   VARCHAR(255) NOT NULL,
    telefono    VARCHAR(30)  NOT NULL,
    correo      VARCHAR(254) NOT NULL UNIQUE,   -- RB-1: correo principal de empresa
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Usuarios (RF-1, RF-2.1)
-- Un usuario puede pertenecer a una o más empresas (sección 2.3).
-- El visitante/anónimo no tiene registro: solo accede al flujo de registro.
-- ---------------------------------------------------------------------
CREATE TABLE usuario (
    id              SERIAL PRIMARY KEY,
    nombre_usuario  VARCHAR(50)  NOT NULL UNIQUE,   -- RF-1.1 login
    correo          VARCHAR(254) NOT NULL UNIQUE,   -- RF-2.1 (confirmación de registro)
    password_hash   VARCHAR(100) NOT NULL,          -- bcrypt (NFR-SEG-2), nunca texto plano
    activo          BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT usuario_nombre_usuario_formato CHECK (nombre_usuario ~ '^[A-Za-z0-9_.-]{3,50}$')
);

-- ---------------------------------------------------------------------
-- Pertenencia de usuario a empresa con rol (RF-2.3, RF-3.1, RB-2, RB-4, RB-5)
-- ---------------------------------------------------------------------
CREATE TABLE empresa_usuarios (
    empresa_id  INTEGER     NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
    usuario_id  INTEGER     NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    rol         VARCHAR(20) NOT NULL CHECK (rol IN ('administrador', 'editor')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (empresa_id, usuario_id)
);
CREATE INDEX idx_empresa_usuarios_usuario ON empresa_usuarios(usuario_id);

-- ---------------------------------------------------------------------
-- Revocación de tokens JWT (RF-1.2, NFR-SEG-9)
-- El logout inserta el identificador del token (jti) aquí.
-- ---------------------------------------------------------------------
CREATE TABLE token_revocado (
    jti         VARCHAR(64) PRIMARY KEY,
    usuario_id  INTEGER     NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    expira_at   TIMESTAMPTZ NOT NULL,               -- para limpiar filas vencidas
    revocado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_token_revocado_expira ON token_revocado(expira_at);

-- ---------------------------------------------------------------------
-- Clientes (RF-4.1, RF-4.2)
-- Eliminación lógica con confirmación previa (RF-4.3).
-- Datos bancarios cifrados en reposo (NFR-SEG-3, sección 2.2).
-- ---------------------------------------------------------------------
CREATE TABLE cliente (
    id                      SERIAL PRIMARY KEY,
    empresa_id              INTEGER      NOT NULL REFERENCES empresa(id) ON DELETE RESTRICT,
    nombre                  VARCHAR(150) NOT NULL,
    descripcion             TEXT,
    direccion               VARCHAR(255),
    contacto                VARCHAR(150),
    datos_bancarios_cifrados BYTEA,                 -- cifrado a nivel de aplicación (AES-GCM)
    eliminado               BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_cliente_empresa_nombre ON cliente(empresa_id, nombre) WHERE eliminado = FALSE;

-- ---------------------------------------------------------------------
-- Contratos (RF-5.1, RF-5.4, RB-3)
-- Un contrato pertenece a un único cliente.
-- El estado (activo / vence / expirado) se calcula, no se guarda (RF-5.4).
-- ---------------------------------------------------------------------
CREATE TABLE contrato (
    id            SERIAL PRIMARY KEY,
    cliente_id    INTEGER      NOT NULL REFERENCES cliente(id) ON DELETE RESTRICT,
    titulo        VARCHAR(150) NOT NULL,
    descripcion   TEXT,
    fecha_inicio  DATE         NOT NULL,
    fecha_termino DATE         NOT NULL,
    eliminado     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT contrato_fechas_validas CHECK (fecha_termino >= fecha_inicio)
);
CREATE INDEX idx_contrato_cliente ON contrato(cliente_id) WHERE eliminado = FALSE;

-- ---------------------------------------------------------------------
-- Documentos adjuntos a contratos (RF-5.2, RF-5.3)
-- El archivo se guarda en storage interno; aquí solo se guarda la referencia.
-- ---------------------------------------------------------------------
CREATE TABLE documento (
    id              SERIAL PRIMARY KEY,
    contrato_id     INTEGER      NOT NULL REFERENCES contrato(id) ON DELETE RESTRICT,
    nombre_original VARCHAR(255) NOT NULL,
    tipo_mime       VARCHAR(100) NOT NULL CHECK (tipo_mime IN (
                        'application/pdf',
                        'application/msword',
                        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                        'application/vnd.ms-powerpoint',
                        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                        'image/jpeg',
                        'image/png')),
    tamano_bytes    BIGINT       NOT NULL CHECK (tamano_bytes > 0),
    ruta_storage    VARCHAR(500) NOT NULL UNIQUE,   -- ruta interna, nunca expuesta al cliente
    sha256          CHAR(64)     NOT NULL,          -- integridad del archivo
    subido_por      INTEGER      REFERENCES usuario(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_documento_contrato ON documento(contrato_id);

-- ---------------------------------------------------------------------
-- Enlaces para compartir documentos (RF-5.5)
-- Token aleatorio no predecible (criterio del plan, CP-07), con vigencia
-- obligatoria y posibilidad de revocar. Ver hallazgo de la sección 5.2 del plan.
-- ---------------------------------------------------------------------
CREATE TABLE enlace_compartido (
    id           SERIAL PRIMARY KEY,
    documento_id INTEGER     NOT NULL REFERENCES documento(id) ON DELETE CASCADE,
    token        VARCHAR(64) NOT NULL UNIQUE,       -- 32 bytes aleatorios en hex (CSPRNG)
    expira_at    TIMESTAMPTZ NOT NULL,
    revocado     BOOLEAN     NOT NULL DEFAULT FALSE,
    creado_por   INTEGER     REFERENCES usuario(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_enlace_documento ON enlace_compartido(documento_id);

-- ---------------------------------------------------------------------
-- Auditoría (RF-6.1, NFR-SEG-6)
-- Solo inserción desde la aplicación. Sin datos sensibles en "detalle".
-- ---------------------------------------------------------------------
CREATE TABLE auditoria (
    id          BIGSERIAL PRIMARY KEY,
    empresa_id  INTEGER     REFERENCES empresa(id) ON DELETE SET NULL,
    usuario_id  INTEGER     REFERENCES usuario(id) ON DELETE SET NULL,
    accion      VARCHAR(50) NOT NULL CHECK (accion IN (
                    'crear', 'editar', 'eliminar', 'subir_documento',
                    'descargar_documento', 'compartir_documento',
                    'login', 'logout', 'cambio_rol')),
    entidad     VARCHAR(50) NOT NULL,               -- 'cliente', 'contrato', 'usuario', 'documento'
    entidad_id  INTEGER,
    detalle     JSONB,
    ip          INET,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_auditoria_empresa_fecha ON auditoria(empresa_id, created_at);
CREATE INDEX idx_auditoria_usuario      ON auditoria(usuario_id);

COMMIT;
