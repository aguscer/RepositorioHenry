import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

const base = () =>
  `https://graph.facebook.com/${config.whatsapp.version}/${config.whatsapp.phoneNumberId}`;

async function llamar(cuerpo) {
  if (!config.whatsapp.token || !config.whatsapp.phoneNumberId) {
    throw new Error('Faltan WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID en el .env');
  }

  const respuesta = await fetch(`${base()}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.whatsapp.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...cuerpo }),
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text();
    throw new Error(`WhatsApp API ${respuesta.status}: ${detalle}`);
  }
  return respuesta.json();
}

export const nombre = 'cloud';

export async function enviarTexto(telefono, texto) {
  return llamar({
    to: telefono,
    type: 'text',
    text: { preview_url: false, body: texto.slice(0, 4096) },
  });
}

/** Botones rápidos (máximo 3, lo permite la API). */
export async function enviarBotones(telefono, texto, botones = []) {
  if (!botones.length) return enviarTexto(telefono, texto);
  return llamar({
    to: telefono,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: texto.slice(0, 1024) },
      action: {
        buttons: botones.slice(0, 3).map((b) => ({
          type: 'reply',
          reply: { id: b.id, title: b.titulo.slice(0, 20) },
        })),
      },
    },
  });
}

export async function marcarLeido(idMensaje) {
  try {
    await llamar({ status: 'read', message_id: idMensaje });
  } catch (error) {
    console.warn('[whatsapp] no se pudo marcar como leído:', error.message);
  }
}

/** Valida que el webhook realmente venga de Meta (cabecera X-Hub-Signature-256). */
export function firmaValida(cuerpoCrudo, cabecera) {
  if (!config.whatsapp.appSecret) return true; // sin app secret configurado no se valida
  if (!cabecera?.startsWith('sha256=')) return false;

  const esperado = createHmac('sha256', config.whatsapp.appSecret)
    .update(cuerpoCrudo)
    .digest('hex');
  const recibido = cabecera.slice('sha256='.length);
  if (recibido.length !== esperado.length) return false;

  return timingSafeEqual(Buffer.from(recibido, 'hex'), Buffer.from(esperado, 'hex'));
}

/**
 * Traduce el webhook de Meta a una lista simple de mensajes entrantes.
 * Ignora los avisos de estado (entregado, leído, etc.).
 */
export function parsearEntrantes(cuerpo) {
  const mensajes = [];

  for (const entrada of cuerpo?.entry || []) {
    for (const cambio of entrada.changes || []) {
      const valor = cambio.value || {};
      const contactos = valor.contacts || [];

      for (const mensaje of valor.messages || []) {
        const contacto = contactos.find((c) => c.wa_id === mensaje.from) || contactos[0];
        let texto = '';

        if (mensaje.type === 'text') texto = mensaje.text?.body || '';
        else if (mensaje.type === 'interactive') {
          texto = mensaje.interactive?.button_reply?.title
            || mensaje.interactive?.list_reply?.title
            || '';
        } else if (mensaje.type === 'button') texto = mensaje.button?.text || '';

        mensajes.push({
          id: mensaje.id,
          telefono: mensaje.from,
          nombre: contacto?.profile?.name || '',
          tipo: mensaje.type,
          texto,
        });
      }
    }
  }
  return mensajes;
}
