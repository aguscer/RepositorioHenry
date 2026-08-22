import { bus } from '../lib/bus.js';

/**
 * Proveedor de prueba: no manda nada a WhatsApp, imprime en consola y
 * publica el mensaje para el simulador web (/simulador).
 * Sirve para desarrollar y demostrar el bot sin cuenta de Meta.
 */
export const nombre = 'mock';

export const salidas = [];

export async function enviarTexto(telefono, texto) {
  const salida = { telefono, texto, en: Date.now() };
  salidas.push(salida);
  if (salidas.length > 200) salidas.shift();

  console.log(`\n📤 [mock → ${telefono}]\n${texto}\n`);
  bus.emit('mock:salida', salida);
  return { simulado: true };
}

export async function enviarBotones(telefono, texto, botones = []) {
  const pie = botones.length
    ? `\n\n${botones.map((b) => `[ ${b.titulo} ]`).join('  ')}`
    : '';
  return enviarTexto(telefono, texto + pie);
}

export async function marcarLeido() {
  return { simulado: true };
}

export function firmaValida() {
  return true;
}

export function parsearEntrantes(cuerpo) {
  return cuerpo?.mensajes || [];
}
