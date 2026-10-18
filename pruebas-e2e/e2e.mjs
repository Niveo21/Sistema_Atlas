import { chromium } from 'playwright-core';

const BASE = 'http://localhost:3000';
const PASS = 'Clave-Segura-2026';
const resultados = [];
let contador = 0;
// El id de la empresa de demo depende de la base (el seed no siempre crea id 1); se toma de la navegación.
let empresaId = '1';

const SUFIJO = Date.now().toString().slice(-6);
const NOMBRE = `Cliente Demo QA ${SUFIJO}`;
const USUARIO_NUEVO = `nuevo_${SUFIJO}`;
const CORREO_NUEVO = `nuevo${SUFIJO}@demo.cl`;

async function paso(nombre, fn, page) {
  try {
    await fn();
    resultados.push({ nombre, ok: true });
    console.log(`OK   ${nombre}`);
  } catch (err) {
    const archivo = `shots/fallo_${++contador}.png`;
    if (page) await page.screenshot({ path: archivo, fullPage: true }).catch(() => {});
    resultados.push({ nombre, ok: false, error: err.message.split('\n')[0] });
    console.log(`FAIL ${nombre}: ${err.message.split('\n')[0]}`);
  }
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

async function login(usuario) {
  // about:blank limpia el estado del historial; si no, el login reutiliza una redirección anterior.
  await page.goto('about:blank');
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Nombre de usuario').fill(usuario);
  await page.getByLabel('Contraseña').fill(PASS);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

async function logout() {
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.waitForURL('**/login');
}

await paso('Login administrador y redirección a empresas', async () => {
  await login('admin_demo');
  await page.getByRole('heading', { name: 'Mis empresas' }).waitFor();
  await page.getByText('Ferretería Demo').first().waitFor();
  await page.screenshot({ path: 'shots/01_empresas_admin.png', fullPage: true });
}, page);

await paso('Listado de clientes con permisos de administrador', async () => {
  await page.getByRole('button', { name: 'Ver clientes de Ferretería Demo' }).click();
  await page.waitForURL(/\/empresas\/\d+\/clientes$/);
  empresaId = new URL(page.url()).pathname.split('/')[2];
  await page.getByRole('heading', { name: 'Clientes', level: 1 }).waitFor();
  await page.getByRole('button', { name: 'Nuevo cliente' }).waitFor();
  await page.screenshot({ path: 'shots/02_clientes_admin.png', fullPage: true });
}, page);

await paso('Crear cliente (RF-4.1)', async () => {
  await page.getByRole('button', { name: 'Nuevo cliente' }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel(/^Nombre/).fill(NOMBRE);
  await dialogo.getByLabel('Dirección').fill('Calle 9');
  await dialogo.getByLabel('Información de contacto').fill('qa@demo.cl');
  await page.screenshot({ path: 'shots/03_dialogo_nuevo_cliente.png' });
  await dialogo.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByText('Cliente creado.').waitFor();
  await page.getByRole('link', { name: NOMBRE }).waitFor();
}, page);

await paso('Buscar clientes por nombre (RF-4.2)', async () => {
  await page.getByLabel('Buscar por nombre').fill(`Demo QA ${SUFIJO}`);
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByRole('link', { name: NOMBRE }).waitFor();
  await page.getByLabel('Buscar por nombre').fill('zzzz-inexistente');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByText('No hay clientes que coincidan').waitFor();
  await page.getByLabel('Buscar por nombre').fill('');
  await page.getByRole('button', { name: 'Buscar' }).click();
}, page);

await paso('Editar cliente (RF-4.2)', async () => {
  await page.getByRole('button', { name: `Editar ${NOMBRE}` }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Dirección').fill('Calle 10');
  await dialogo.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByText('Cliente actualizado.').waitFor();
  await page.getByRole('row', { name: NOMBRE }).getByRole('cell', { name: 'Calle 10' }).waitFor();
}, page);

await paso('Abrir detalle del cliente y crear contrato (RF-5.1)', async () => {
  await page.getByRole('link', { name: NOMBRE }).click();
  await page.waitForURL(new RegExp(`/empresas/${empresaId}/clientes/\\d+$`));
  await page.getByText('qa@demo.cl').waitFor();
  await page.getByRole('button', { name: 'Nuevo contrato' }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Título').fill('Contrato demo QA');
  await dialogo.getByLabel('Fecha de inicio').fill('2026-01-01');
  await dialogo.getByLabel('Fecha de término').fill('2030-01-01');
  await dialogo.getByRole('button', { name: 'Guardar contrato' }).click();
  await page.getByText('Contrato creado.').waitFor();
  await page.getByRole('cell', { name: 'Contrato demo QA' }).waitFor();
  await page.getByText('Activo', { exact: true }).waitFor();
  await page.screenshot({ path: 'shots/04_detalle_contratos_admin.png', fullPage: true });
}, page);

await paso('Validación de fechas de contrato en el formulario', async () => {
  await page.getByRole('button', { name: 'Nuevo contrato' }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Título').fill('Contrato invalido');
  await dialogo.getByLabel('Fecha de inicio').fill('2026-05-01');
  await dialogo.getByLabel('Fecha de término').fill('2026-01-01');
  await dialogo.getByRole('button', { name: 'Guardar contrato' }).click();
  await page.getByText('La fecha de término no puede ser anterior a la de inicio.').waitFor();
  await page.screenshot({ path: 'shots/05_validacion_fechas.png' });
  await dialogo.getByRole('button', { name: 'Cancelar' }).click();
}, page);

await paso('Eliminación con confirmación (RF-4.3)', async () => {
  await page.getByRole('link', { name: 'Clientes' }).first().click().catch(() => {});
  await page.goto(`${BASE}/empresas/${empresaId}/clientes`);
  await page.getByRole('button', { name: `Eliminar ${NOMBRE}` }).click();
  await page.getByRole('heading', { name: '¿Eliminar cliente?' }).waitFor();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await page.getByRole('link', { name: NOMBRE }).waitFor();
}, page);

await paso('Cerrar sesión invalida el acceso (RF-1.2)', async () => {
  const tokenAntes = await page.evaluate(() => sessionStorage.getItem('atlas_token'));
  if (!tokenAntes) throw new Error('No había token guardado');
  await logout();
  const tokenDespues = await page.evaluate(() => sessionStorage.getItem('atlas_token'));
  if (tokenDespues) throw new Error('El token sigue guardado tras cerrar sesión');
  await page.goto(`${BASE}/empresas`);
  await page.waitForURL('**/login');
}, page);

await paso('Sesión vencida redirige a login con aviso', async () => {
  await page.goto(`${BASE}/login`);
  await page.evaluate(() => sessionStorage.setItem('atlas_token', 'token-invalido-de-prueba'));
  await page.goto(`${BASE}/empresas/${empresaId}/clientes`);
  await page.waitForURL('**/login');
  await page.getByText('Tu sesión venció. Vuelve a ingresar.').waitFor();
}, page);

await paso('Editor: solo lectura en la interfaz (RB-4)', async () => {
  await login('editor_demo');
  await page.getByRole('button', { name: 'Ver clientes de Ferretería Demo' }).click();
  await page.waitForURL(/\/empresas\/\d+\/clientes$/);
  await page.getByText('Tu rol de editor permite solo ver los datos de los clientes.').waitFor();
  if (await page.getByRole('button', { name: 'Nuevo cliente' }).count()) throw new Error('El editor ve el botón Nuevo cliente');
  if (await page.getByRole('button', { name: /Editar / }).count()) throw new Error('El editor ve botones Editar');
  if (await page.getByRole('button', { name: /Eliminar / }).count()) throw new Error('El editor ve botones Eliminar');
  await page.getByRole('link', { name: NOMBRE }).waitFor();
  await page.screenshot({ path: 'shots/06_clientes_editor_solo_lectura.png', fullPage: true });
}, page);

await paso('Registro de usuario nuevo con validación', async () => {
  await logout();
  await page.goto(`${BASE}/registro`);
  await page.getByLabel('Nombre de usuario').fill(USUARIO_NUEVO);
  await page.getByLabel('Correo electrónico').fill(CORREO_NUEVO);
  await page.getByLabel(/^Contraseña/).fill('corta');
  await page.getByLabel('Repite la contraseña').fill('corta');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await page.getByRole('alert').filter({ hasText: 'Contraseña no cumple la política' }).waitFor();
  await page.screenshot({ path: 'shots/07_registro_politica.png', fullPage: true });
}, page);

await paso('Registro exitoso redirige a login', async () => {
  await page.getByLabel(/^Contraseña/).fill('Otra-Clave-Valida-2026');
  await page.getByLabel('Repite la contraseña').fill('Otra-Clave-Valida-2026');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await page.waitForURL('**/login');
  await page.getByText('Cuenta creada. Ya puedes ingresar.').waitFor();
}, page);

await paso('Login con contraseña incorrecta muestra error', async () => {
  await page.getByLabel('Nombre de usuario').fill('admin_demo');
  await page.getByLabel('Contraseña').fill('incorrecta-123');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.getByRole('alert').filter({ hasText: 'Credenciales inválidas' }).waitFor();
}, page);

await browser.close();
const fallos = resultados.filter((r) => !r.ok).length;
console.log(`\nResultado: ${resultados.length - fallos}/${resultados.length} pasos OK`);
process.exit(fallos ? 1 : 0);
