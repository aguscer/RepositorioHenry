import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { config } from './config.js';
import { whatsapp } from './whatsapp/index.js';
import { procesar } from './bot/conversacion.js';
import { enviarVarios, enviarAlCliente } from './salida.js';
import * as sesiones from './store/sesiones.js';
import * as pedidos from './store/pedidos.js';
import * as avisos from './store/avisos.js';
import { negocio } from './bot/catalogo.js';
import { bus } from './lib/bus.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

// Los webhooks de WhatsApp pueden repetirse: guardamos los últimos ids vistos.
const yaProcesados = new Set();
function esDuplicado(id) {
  if (!id) return false;
  if (yaProcesados.has(id)) return true;
  yaProcesados.add(id);
  if (yaProcesados.size > 1000) yaProcesados.delete(yaProcesados.values().next().value);
  return false;
}

function comparaSegura(a = '', b = '') {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function leerCookie(req, nombre) {
  const crudas = req.headers.cookie || '';
  for (const parte of crudas.split(';')) {
    const [clave, ...resto] = parte.trim().split('=');
    if (clave === nombre) return decodeURIComponent(resto.join('='));
  }
  return null;
}

export function crearApp() {
  const app = express();
  app.use(express.json({
    verify: (req, _res, buffer) => { req.cuerpoCrudo = buffer; },
  }));
  app.use(express.urlencoded({ extended: false }));

  // ─────────────────────────── Webhook de WhatsApp ───────────────────────────

  // Verificación inicial que hace Meta al configurar el webhook.
  app.get('/webhook', (req, res) => {
    const modo = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    if (modo === 'subscribe' && comparaSegura(token, config.whatsapp.verifyToken)) {
      return res.status(200).send(req.query['hub.challenge']);
    }
    return res.sendStatus(403);
  });

  app.post('/webhook', async (req, res) => {
    if (!whatsapp.firmaValida(req.cuerpoCrudo, req.get('x-hub-signature-256'))) {
      console.warn('[webhook] firma inválida, mensaje descartado');
      return res.sendStatus(401);
    }
    // Meta reintenta si no respondemos rápido: confirmamos y procesamos después.
    res.sendStatus(200);

    let entrantes = [];
    try {
      entrantes = whatsapp.parsearEntrantes(req.body);
    } catch (error) {
      return console.error('[webhook] no se pudo interpretar el cuerpo:', error.message);
    }

    for (const mensaje of entrantes) {
      if (esDuplicado(mensaje.id)) continue;
      await atender(mensaje);
    }
    return undefined;
  });

  // ──────────────────────────── Panel de la caja ─────────────────────────────

  app.post('/api/caja/ingresar', (req, res) => {
    const clave = req.body?.clave || '';
    if (!comparaSegura(clave, config.panelClave)) {
      return res.status(401).json({ error: 'Clave incorrecta' });
    }
    res.cookie('panel', config.panelClave, {
      httpOnly: true, sameSite: 'lax', maxAge: 12 * 60 * 60 * 1000,
    });
    return res.json({ ok: true });
  });

  const soloCaja = (req, res, siguiente) => {
    const cookie = leerCookie(req, 'panel');
    const cabecera = req.get('x-panel-clave');
    if (comparaSegura(cookie, config.panelClave) || comparaSegura(cabecera, config.panelClave)) {
      return siguiente();
    }
    return res.status(401).json({ error: 'No autorizado' });
  };

  app.get('/api/caja/estado', soloCaja, (req, res) => {
    res.json({
      negocio: { nombre: negocio.nombre, moneda: negocio.moneda },
      pedidos: pedidos.listar({ limite: 60 }),
      avisos: avisos.listar({ limite: 30 }),
      resumen: pedidos.resumenDelDia(),
      proveedor: whatsapp.nombre,
    });
  });

  // Flujo de eventos en vivo (SSE): así la caja se entera al instante.
  app.get('/api/caja/eventos', soloCaja, (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');

    const mandar = (tipo) => (dato) => {
      res.write(`event: ${tipo}\ndata: ${JSON.stringify(dato)}\n\n`);
    };
    const suscripciones = [
      ['pedido:nuevo', mandar('pedido-nuevo')],
      ['pedido:actualizado', mandar('pedido-actualizado')],
      ['aviso:nuevo', mandar('aviso-nuevo')],
      ['aviso:actualizado', mandar('aviso-actualizado')],
      ['mensaje:entrante', mandar('mensaje')],
      ['mensaje:saliente', mandar('mensaje')],
    ];
    for (const [evento, manejador] of suscripciones) bus.on(evento, manejador);

    const latido = setInterval(() => res.write(': latido\n\n'), 25_000);

    req.on('close', () => {
      clearInterval(latido);
      for (const [evento, manejador] of suscripciones) bus.off(evento, manejador);
    });
  });

  app.post('/api/caja/pedidos/:id/estado', soloCaja, async (req, res) => {
    const { estado, quien = 'caja', avisar } = req.body || {};
    let pedido;
    try {
      pedido = pedidos.cambiarEstado(req.params.id, estado, quien);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

    if (avisar) {
      const textos = {
        tomado: `👋 ¡Hola${pedido.nombre ? ` ${pedido.nombre}` : ''}! Te confirmo el pedido *${pedido.codigo}*. Ya lo estamos cargando.`,
        cargado: `👨‍🍳 Tu pedido *${pedido.codigo}* ya está en cocina. Demora estimada: ${pedido.modalidad === 'delivery' ? negocio.demoraDelivery : negocio.demoraMostrador}.`,
        cobrado: `✅ Pago registrado. ¡Gracias por elegirnos! 🍕`,
        cancelado: `❌ Tuvimos que cancelar el pedido *${pedido.codigo}*. Cualquier duda escribinos por acá.`,
      };
      if (textos[estado]) {
        await enviarAlCliente(pedido.telefono, textos[estado], 'caja').catch((error) =>
          console.error('[caja] no se pudo avisar al cliente:', error.message));
      }
    }
    if (estado === 'cobrado' || estado === 'cancelado') sesiones.reanudarBot(pedido.telefono);

    return res.json({ pedido });
  });

  app.post('/api/caja/pedidos/:id/nota', soloCaja, (req, res) => {
    const pedido = pedidos.anotar(req.params.id, String(req.body?.nota || '').slice(0, 500));
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
    return res.json({ pedido });
  });

  // La caja escribe al cliente por WhatsApp desde el mismo panel.
  app.post('/api/caja/mensaje', soloCaja, async (req, res) => {
    const { telefono, texto } = req.body || {};
    if (!telefono || !texto) return res.status(400).json({ error: 'Faltan teléfono o texto' });
    try {
      await enviarAlCliente(telefono, String(texto).slice(0, 4000), 'caja');
      sesiones.pausarBot(telefono);
      return res.json({ ok: true });
    } catch (error) {
      return res.status(502).json({ error: error.message });
    }
  });

  app.get('/api/caja/conversacion/:telefono', soloCaja, (req, res) => {
    const sesion = sesiones.obtener(req.params.telefono);
    res.json({
      telefono: sesion.telefono,
      nombre: sesion.nombre,
      estado: sesion.estado,
      botEnPausa: sesiones.botEnPausa(sesion),
      historial: sesion.historial,
    });
  });

  app.post('/api/caja/conversacion/:telefono/bot', soloCaja, (req, res) => {
    const activar = req.body?.activar !== false;
    const sesion = activar
      ? sesiones.reanudarBot(req.params.telefono)
      : sesiones.pausarBot(req.params.telefono);
    res.json({ botEnPausa: sesiones.botEnPausa(sesion) });
  });

  app.post('/api/caja/avisos/:id/cerrar', soloCaja, (req, res) => {
    const aviso = avisos.cerrar(req.params.id, req.body?.quien || 'caja');
    if (!aviso) return res.status(404).json({ error: 'Aviso no encontrado' });
    return res.json({ aviso });
  });

  // ─────────────────────── Simulador (sólo con proveedor mock) ───────────────

  if (whatsapp.nombre === 'mock') {
    app.post('/api/simulador/mensaje', async (req, res) => {
      const { telefono = '5491100000000', nombre = 'Cliente de prueba', texto = '' } = req.body || {};
      await atender({ id: `sim_${Date.now()}`, telefono, nombre, texto });
      res.json({ ok: true });
    });

    app.get('/api/simulador/eventos', (req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      });
      const enviar = (dato) => res.write(`event: salida\ndata: ${JSON.stringify(dato)}\n\n`);
      bus.on('mock:salida', enviar);
      const latido = setInterval(() => res.write(': latido\n\n'), 25_000);
      req.on('close', () => { clearInterval(latido); bus.off('mock:salida', enviar); });
    });
  }

  // ────────────────────────────── Estáticos ──────────────────────────────────

  app.get('/', (req, res) => res.redirect('/caja'));
  app.get('/caja', (req, res) => res.sendFile(join(raiz, 'public', 'caja.html')));
  app.get('/simulador', (req, res) => res.sendFile(join(raiz, 'public', 'simulador.html')));
  app.get('/salud', (req, res) => res.json({ ok: true, proveedor: whatsapp.nombre }));
  app.use(express.static(join(raiz, 'public')));

  return app;
}

/** Pasa un mensaje entrante por el bot y responde lo que corresponda. */
export async function atender(mensaje) {
  try {
    if (!mensaje.texto?.trim()) {
      await enviarAlCliente(mensaje.telefono,
        'Por ahora sólo puedo leer mensajes de texto 🙈 Escribime lo que necesitás.');
      return;
    }

    await whatsapp.marcarLeido(mensaje.id);
    const { respuestas } = procesar(mensaje);
    if (respuestas.length) await enviarVarios(mensaje.telefono, respuestas);
  } catch (error) {
    console.error('[bot] error atendiendo mensaje:', error);
  }
}
