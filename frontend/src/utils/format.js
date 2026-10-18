// Estados calculados por la API para cada contrato (RF-5.4).
export const ESTADO_CONTRATO = {
  activo: { etiqueta: 'Activo', color: 'success' },
  vence: { etiqueta: 'Vence pronto', color: 'warning' },
  expirado: { etiqueta: 'Expirado', color: 'default' },
};

// Las fechas llegan como marca de tiempo; se muestran en la zona horaria de Chile.
export function formatearFecha(valor) {
  if (!valor) return '—';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return String(valor);
  return fecha.toLocaleDateString('es-CL', { timeZone: 'America/Santiago' });
}

export const ROL_ETIQUETA = { administrador: 'Administrador', editor: 'Editor' };
