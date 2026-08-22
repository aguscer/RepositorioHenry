import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Carga simple de .env sin dependencias externas.
function cargarEnv() {
  const ruta = join(process.cwd(), '.env');
  if (!existsSync(ruta)) return;
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;
    const corte = limpia.indexOf('=');
    if (corte === -1) continue;
    const clave = limpia.slice(0, corte).trim();
    const valor = limpia.slice(corte + 1).trim().replace(/^["']|["']$/g, '');
    if (!(clave in process.env)) process.env[clave] = valor;
  }
}

cargarEnv();

export const config = {
  puerto: Number(process.env.PORT || 3000),
  proveedor: process.env.WHATSAPP_PROVIDER || 'mock',
  whatsapp: {
    token: process.env.WHATSAPP_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    appSecret: process.env.WHATSAPP_APP_SECRET || '',
    version: 'v21.0',
  },
  panelClave: process.env.PANEL_CLAVE || 'caja1234',
  minutosPausaBot: Number(process.env.MINUTOS_PAUSA_BOT || 120),
};
