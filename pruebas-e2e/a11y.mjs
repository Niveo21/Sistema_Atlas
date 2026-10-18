import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';

const BASE = 'http://localhost:3000';
const axeSource = readFileSync(new URL('./node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });

async function revisar(page, nombre) {
  await page.addScriptTag({ content: axeSource });
  const r = await page.evaluate(() => window.axe.run(document, { resultTypes: ['violations'] }));
  const resumen = r.violations.map((v) => `${v.impact} ${v.id} (${v.nodes.length})`);
  console.log(`${nombre}: ${r.violations.length} tipos de violación${resumen.length ? ' -> ' + resumen.join('; ') : ''}`);
  return r.violations;
}

async function login(page, usuario) {
  await page.goto('about:blank');
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Nombre de usuario').fill(usuario);
  await page.getByLabel('Contraseña').fill('Clave-Segura-2026');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

// Escritorio
const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await desktop.goto(`${BASE}/login`);
await revisar(desktop, 'Login (escritorio)');
await login(desktop, 'admin_demo');
await revisar(desktop, 'Empresas (escritorio)');
// El id de la empresa de demo depende de la base; se toma de la navegación.
await desktop.getByRole('button', { name: 'Ver clientes de Ferretería Demo' }).click();
await desktop.waitForURL(/\/empresas\/\d+\/clientes$/);
const empresaId = new URL(desktop.url()).pathname.split('/')[2];
await desktop.getByRole('heading', { name: 'Clientes', level: 1 }).waitFor();
await revisar(desktop, 'Clientes (escritorio)');

// Móvil: 390 px de ancho, sin desplazamiento horizontal
const movil = await browser.newPage({ viewport: { width: 390, height: 844 } });
await movil.goto(`${BASE}/login`);
await movil.screenshot({ path: 'shots/08_login_movil.png', fullPage: true });
const anchoLogin = await movil.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
console.log(`Login móvil: scrollWidth/clientWidth = ${anchoLogin.join('/')}`);
await login(movil, 'admin_demo');
await movil.goto(`${BASE}/empresas/${empresaId}/clientes`);
await movil.getByRole('heading', { name: 'Clientes', level: 1 }).waitFor();
await movil.screenshot({ path: 'shots/09_clientes_movil.png', fullPage: true });
const anchoClientes = await movil.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
console.log(`Clientes móvil: scrollWidth/clientWidth = ${anchoClientes.join('/')}`);

await browser.close();
