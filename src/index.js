import { crearApp } from './server.js';
import { config } from './config.js';
import { whatsapp } from './whatsapp/index.js';
import { negocio } from './bot/catalogo.js';
import { _coleccion as coleccionSesiones } from './store/sesiones.js';
import { _coleccion as coleccionPedidos } from './store/pedidos.js';
import { _coleccion as coleccionAvisos } from './store/avisos.js';

const app = crearApp();

const servidor = app.listen(config.puerto, () => {
  console.log(`\n🍕 ${negocio.nombre} — bot de WhatsApp`);
  console.log(`   Proveedor de WhatsApp : ${whatsapp.nombre}`);
  console.log(`   Panel de la caja      : http://localhost:${config.puerto}/caja`);
  if (whatsapp.nombre === 'mock') {
    console.log(`   Simulador de chat     : http://localhost:${config.puerto}/simulador`);
  }
  console.log(`   Webhook de WhatsApp   : http://localhost:${config.puerto}/webhook\n`);
});

function apagar(senial) {
  console.log(`\n${senial} recibido, guardando datos...`);
  for (const coleccion of [coleccionSesiones(), coleccionPedidos(), coleccionAvisos()]) {
    coleccion.guardarYa();
  }
  servidor.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', () => apagar('SIGINT'));
process.on('SIGTERM', () => apagar('SIGTERM'));
