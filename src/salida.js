import { whatsapp } from './whatsapp/index.js';
import * as sesiones from './store/sesiones.js';
import { bus } from './lib/bus.js';

/**
 * Único punto de salida de mensajes hacia el cliente.
 * Centralizarlo permite dejar todo registrado en el historial de la conversación.
 */
export async function enviarAlCliente(telefono, texto, quien = 'bot') {
  await whatsapp.enviarTexto(telefono, texto);

  const sesion = sesiones.obtener(telefono);
  sesiones.registrarMensaje(sesion, quien, texto);
  sesiones.guardar(sesion);

  bus.emit('mensaje:saliente', { telefono, texto, quien, en: Date.now() });
}

/** Envía varias respuestas en orden, sin cortar el flujo si una falla. */
export async function enviarVarios(telefono, textos, quien = 'bot') {
  for (const texto of textos) {
    try {
      await enviarAlCliente(telefono, texto, quien);
    } catch (error) {
      console.error(`[salida] falló el envío a ${telefono}:`, error.message);
    }
  }
}
