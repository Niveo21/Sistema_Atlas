// Crea los datos de demostración que usan las pruebas e2e. Es idempotente: si ya existen, no los duplica.
// Uso: node seed-demo.mjs   (con el backend de Atlas en ejecución)
const API = process.env.API_URL || 'http://localhost:4000/api';
const PASS = 'Clave-Segura-2026';

async function req(metodo, ruta, cuerpo, token) {
  const res = await fetch(API + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, data };
}

for (const [usuario, correo] of [['admin_demo', 'admin@demo.cl'], ['editor_demo', 'editor@demo.cl']]) {
  const r = await req('POST', '/auth/register', { nombre_usuario: usuario, correo, password: PASS });
  console.log(r.status === 201 ? `Usuario ${usuario} creado` : `Usuario ${usuario} ya existía (${r.status})`);
}

const login = await req('POST', '/auth/login', { nombre_usuario: 'admin_demo', password: PASS });
if (login.status !== 200) throw new Error('No se pudo iniciar sesión como admin_demo');
const token = login.data.token;

const empresas = await req('GET', '/empresas', null, token);
let empresa = empresas.data.data.find((e) => e.nombre === 'Ferretería Demo');
if (!empresa) {
  const creada = await req('POST', '/empresas', { nombre: 'Ferretería Demo', direccion: 'Av. Principal 123', telefono: '+56 2 2345 6789', correo: 'contacto@demo.cl' }, token);
  empresa = { id: creada.data.id, nombre: creada.data.nombre };
  console.log('Empresa Ferretería Demo creada');
} else {
  console.log('Empresa Ferretería Demo ya existía');
}

const editor = await req('POST', `/empresas/${empresa.id}/usuarios`, { nombre_usuario: 'editor_demo', rol: 'editor' }, token);
console.log(`Rol de editor_demo asignado (HTTP ${editor.status})`);
console.log(`Listo. Empresa id ${empresa.id}.`);
