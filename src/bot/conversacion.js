import * as sesiones from '../store/sesiones.js';
import * as pedidos from '../store/pedidos.js';
import * as avisos from '../store/avisos.js';
import * as borradores from './pedido.js';
import * as faq from './faq.js';
import { detectar } from './intenciones.js';
import { negocio, textoMenu } from './catalogo.js';
import { estaAbierto, estadoEnTexto } from '../lib/horarios.js';
import { puntajeContra, esAfirmativo, esNegativo, normalizar } from '../lib/texto.js';
import { precio } from '../lib/formato.js';
import { bus } from '../lib/bus.js';

const { ESTADOS } = sesiones;

const PREGUNTAS = {
  [ESTADOS.PIDIENDO_ITEMS]: '¿Qué más te sumo? Cuando termines escribime *listo*.',
  [ESTADOS.PIDIENDO_MODALIDAD]: '¿Es para *delivery* 🛵 o lo *retirás* por el local 🏠?',
  [ESTADOS.PIDIENDO_DIRECCION]: 'Pasame la *dirección* con calle, número y barrio 📍',
  [ESTADOS.PIDIENDO_NOMBRE]: '¿A nombre de quién lo anoto? 🙂',
  [ESTADOS.PIDIENDO_PAGO]: `¿Cómo vas a abonar? ${negocio.mediosPago.join(' / ')} 💳`,
  [ESTADOS.CONFIRMANDO]: '¿Confirmo el pedido? Respondeme *sí* o *no*.',
};

const AVISO_CERRADO = () =>
  `⚠️ Ojo: ${estadoEnTexto(negocio, new Date()).replace(/^🔴 /, '')} ` +
  'Igual te tomo el pedido y la caja lo va a ver apenas abramos.';

function textoBienvenidaPedido() {
  return `¡Genial! 🍕 Decime qué querés y te lo voy anotando.\n\n${textoMenu()}`;
}

/** Arma el mensaje final que ve el cliente cuando el pedido pasa a la caja. */
function textoPedidoTomado(pedido) {
  return `✅ *¡Listo! Tomé tu pedido* (código *${pedido.codigo}*)\n\n` +
    `${borradores.resumen(pedido)}\n\n` +
    '👨‍🍳 Se lo paso a la caja: en un ratito te escriben desde acá mismo para ' +
    'confirmarte el total y la demora. A partir de ahora te atiende una persona.';
}

/**
 * Procesa un mensaje entrante y devuelve las respuestas que hay que enviar.
 * No manda nada por sí solo: quien llama decide cómo entregarlas.
 */
export function procesar({ telefono, nombre = '', texto = '' }, fecha = new Date()) {
  const sesion = sesiones.obtener(telefono);
  if (nombre && !sesion.nombre) sesion.nombre = nombre;

  sesiones.registrarMensaje(sesion, 'cliente', texto);
  bus.emit('mensaje:entrante', { telefono, nombre: sesion.nombre, texto, en: Date.now() });

  // Si una persona se hizo cargo de la charla, el bot no interrumpe.
  if (sesiones.botEnPausa(sesion)) {
    sesiones.guardar(sesion);
    return { respuestas: [], pausado: true };
  }

  const respuestas = [];
  const resultado = manejar(sesion, texto, respuestas, fecha);

  for (const respuesta of respuestas) sesiones.registrarMensaje(sesion, 'bot', respuesta);
  sesiones.guardar(sesion);

  return { respuestas, ...resultado };
}

function manejar(sesion, texto, respuestas, fecha) {
  const intencion = detectar(texto);
  const enFlujo = sesion.estado !== ESTADOS.LIBRE && sesion.estado !== ESTADOS.CON_CAJERO;

  // 1. Pedido explícito de hablar con una persona: siempre gana.
  if (intencion.intencion === 'humano' && intencion.puntaje >= 2) {
    return derivarAPersona(sesion, texto, respuestas, 'El cliente pidió hablar con una persona');
  }

  // 2. Cancelar / empezar de nuevo.
  if (enFlujo && intencion.intencion === 'cancelar' && intencion.puntaje >= 2) {
    sesiones.reiniciarPedido(sesion);
    respuestas.push('Listo, cancelé el pedido 👌 Si querés arrancar de nuevo escribime *quiero pedir*.');
    return {};
  }

  if (intencion.intencion === 'ayuda' && intencion.puntaje >= 2 && !enFlujo) {
    respuestas.push(ayuda());
    return {};
  }

  // 3. En medio del pedido, una consulta clara igual se responde sin perder el hilo.
  if (enFlujo) {
    const respuestaFaq = faq.responder(texto, fecha);
    const items = borradores.interpretar(texto);
    const consultaFuerte = respuestaFaq && respuestaFaq.puntaje >= 4 && !items.reconocidos.length;

    if (consultaFuerte) {
      respuestas.push(respuestaFaq.texto);
      respuestas.push(PREGUNTAS[sesion.estado]);
      return { faq: respuestaFaq.id };
    }
    return avanzarPedido(sesion, texto, respuestas, fecha);
  }

  // 4. Fuera del flujo: ¿quiere pedir o está consultando?
  const respuestaFaq = faq.responder(texto, fecha);
  const puntajeFaq = respuestaFaq?.puntaje || 0;
  const quierePedir = intencion.intencion === 'pedir' && intencion.puntaje >= puntajeFaq;

  if (quierePedir) return iniciarPedido(sesion, texto, respuestas, fecha);

  if (respuestaFaq) {
    sesion.fallosSeguidos = 0;
    respuestas.push(respuestaFaq.texto);
    if (respuestaFaq.id === 'menu' || respuestaFaq.id === 'promos') {
      respuestas.push('¿Te lo anoto? Escribime *quiero pedir* 😉');
    }
    return { faq: respuestaFaq.id };
  }

  // 5. No entendimos.
  return noEntendi(sesion, texto, respuestas);
}

function ayuda() {
  return `Puedo ayudarte con:\n• 🍕 *Menú* y precios\n• 🕗 *Horarios*\n` +
    `• 🛵 *Envíos*, zonas y costos\n• 💳 *Medios de pago*\n• 🎉 *Promos*\n\n` +
    'Y también tomo tu pedido: escribime *quiero pedir*.\n' +
    'Si preferís hablar con una persona, escribime *hablar con alguien*.';
}

function iniciarPedido(sesion, texto, respuestas, fecha) {
  sesion.estado = ESTADOS.PIDIENDO_ITEMS;
  sesion.fallosSeguidos = 0;
  sesion.borrador = { items: [], modalidad: null, direccion: '', zona: null, pago: '', notas: '' };

  if (!estaAbierto(negocio, fecha)) respuestas.push(AVISO_CERRADO());

  // Si ya dijo qué quiere ("quiero 2 muzzarellas"), lo anotamos de una.
  const { reconocidos } = borradores.interpretar(texto);
  if (reconocidos.length) {
    for (const item of reconocidos) borradores.agregarItem(sesion.borrador, item);
    respuestas.push(`Anotado 📝\n\n${borradores.resumen(sesion.borrador, { conTotales: false })}`);
    respuestas.push(PREGUNTAS[ESTADOS.PIDIENDO_ITEMS]);
  } else {
    respuestas.push(textoBienvenidaPedido());
  }
  return { inicioPedido: true };
}

function avanzarPedido(sesion, texto, respuestas, fecha) {
  switch (sesion.estado) {
    case ESTADOS.PIDIENDO_ITEMS: return pasoItems(sesion, texto, respuestas);
    case ESTADOS.PIDIENDO_MODALIDAD: return pasoModalidad(sesion, texto, respuestas);
    case ESTADOS.PIDIENDO_DIRECCION: return pasoDireccion(sesion, texto, respuestas);
    case ESTADOS.PIDIENDO_NOMBRE: return pasoNombre(sesion, texto, respuestas);
    case ESTADOS.PIDIENDO_PAGO: return pasoPago(sesion, texto, respuestas);
    case ESTADOS.CONFIRMANDO: return pasoConfirmar(sesion, texto, respuestas, fecha);
    default: return {};
  }
}

function pasoItems(sesion, texto, respuestas) {
  const { intencion, puntaje } = detectar(texto);
  const { reconocidos, dudosos } = borradores.interpretar(texto);

  if (reconocidos.length) {
    for (const item of reconocidos) borradores.agregarItem(sesion.borrador, item);
    sesion.fallosSeguidos = 0;
  }

  const terminar = intencion === 'listo' && puntaje >= 2 && !reconocidos.length;
  if (terminar) {
    if (!sesion.borrador.items.length) {
      respuestas.push('Todavía no anoté nada 🤔 Decime qué querés pedir, o escribime *menú* para ver la carta.');
      return {};
    }
    sesion.estado = ESTADOS.PIDIENDO_MODALIDAD;
    respuestas.push(`Perfecto, te leo el pedido:\n\n${borradores.resumen(sesion.borrador, { conTotales: false })}`);
    respuestas.push(PREGUNTAS[ESTADOS.PIDIENDO_MODALIDAD]);
    return {};
  }

  if (reconocidos.length) {
    respuestas.push(`Anotado 📝\n\n${borradores.resumen(sesion.borrador, { conTotales: false })}`);
    if (dudosos.length) {
      respuestas.push(`De esto no estoy seguro: *${dudosos.join('*, *')}*. ¿Me lo escribís como figura en la carta?`);
    }
    respuestas.push(PREGUNTAS[ESTADOS.PIDIENDO_ITEMS]);
    return {};
  }

  sesion.fallosSeguidos += 1;
  if (sesion.fallosSeguidos >= 2) {
    return derivarAPersona(sesion, texto, respuestas, 'El bot no logró interpretar el pedido');
  }
  respuestas.push('Mmm, eso no lo encontré en la carta 😅 Escribime *menú* para verla, ' +
    'o decime el producto con la cantidad (ej: *2 muzzarella*).');
  return {};
}

/** Si el perfil de WhatsApp ya trae el nombre, no lo volvemos a preguntar. */
function pedirNombreOPago(sesion, respuestas) {
  if (sesion.nombre) {
    sesion.estado = ESTADOS.PIDIENDO_PAGO;
    respuestas.push(`Lo anoto a nombre de *${sesion.nombre}* (si va a otro nombre, decímelo).`);
    respuestas.push(PREGUNTAS[ESTADOS.PIDIENDO_PAGO]);
  } else {
    sesion.estado = ESTADOS.PIDIENDO_NOMBRE;
    respuestas.push(PREGUNTAS[ESTADOS.PIDIENDO_NOMBRE]);
  }
  return {};
}

function pasoModalidad(sesion, texto, respuestas) {
  const delivery = puntajeContra(texto, ['delivery', 'envio', 'a domicilio', 'me lo mandas', 'reparto', 'que me lo traigan', 'para enviar', 'domicilio']);
  const retiro = puntajeContra(texto, ['retiro', 'retirar', 'lo paso a buscar', 'paso a buscar', 'take away', 'takeaway', 'mostrador', 'lo busco', 'voy y lo busco', 'local']);

  if (delivery > retiro && delivery > 0) {
    sesion.borrador.modalidad = 'delivery';
    sesion.estado = ESTADOS.PIDIENDO_DIRECCION;
    respuestas.push(PREGUNTAS[ESTADOS.PIDIENDO_DIRECCION]);
    return {};
  }
  if (retiro > 0) {
    sesion.borrador.modalidad = 'retiro';
    respuestas.push(`Dale, lo dejamos listo para retirar en ${negocio.direccion} 🏠`);
    return pedirNombreOPago(sesion, respuestas);
  }
  respuestas.push(PREGUNTAS[ESTADOS.PIDIENDO_MODALIDAD]);
  return {};
}

function pasoDireccion(sesion, texto, respuestas) {
  const direccion = texto.trim();
  if (direccion.length < 6) {
    respuestas.push('Necesito la dirección completa (calle, número y barrio) para poder enviarlo 📍');
    return {};
  }

  sesion.borrador.direccion = direccion;
  sesion.borrador.zona = borradores.detectarZona(direccion);

  if (!borradores.alcanzaMinimoDelivery(sesion.borrador)) {
    respuestas.push(`⚠️ El mínimo para delivery es ${precio(negocio.minimoDelivery, negocio.moneda)} ` +
      'y tu pedido está por debajo. Podés sumar algo más, o pasar a retirarlo por el local.');
  }
  respuestas.push(sesion.borrador.zona
    ? `Anotado ✍️ Zona *${sesion.borrador.zona.nombre}*, envío ${precio(sesion.borrador.zona.costo, negocio.moneda)}.`
    : 'Anotado ✍️ Tu zona no está en mi lista, así que el costo de envío te lo confirma la caja.');

  return pedirNombreOPago(sesion, respuestas);
}

function pasoNombre(sesion, texto, respuestas) {
  const limpio = texto.trim().slice(0, 60);
  if (!limpio) {
    respuestas.push(PREGUNTAS[ESTADOS.PIDIENDO_NOMBRE]);
    return {};
  }
  sesion.nombre = limpio;
  sesion.estado = ESTADOS.PIDIENDO_PAGO;
  respuestas.push(PREGUNTAS[ESTADOS.PIDIENDO_PAGO]);
  return {};
}

function pasoPago(sesion, texto, respuestas) {
  const normal = normalizar(texto);

  const otroNombre = texto.match(/a nombre de\s+(.{2,40})$/i);
  if (otroNombre) {
    sesion.nombre = otroNombre[1].trim();
    respuestas.push(`Corregido: queda a nombre de *${sesion.nombre}* ✍️`);
    respuestas.push(PREGUNTAS[ESTADOS.PIDIENDO_PAGO]);
    return {};
  }

  const elegido = negocio.mediosPago.find((medio) => puntajeContra(normal, [medio]) > 0)
    || (puntajeContra(normal, ['tarjeta', 'posnet']) > 0 ? 'Débito/Crédito' : null)
    || (puntajeContra(normal, ['mp', 'qr', 'billetera']) > 0 ? 'Mercado Pago' : null);

  if (!elegido) {
    respuestas.push(`No me quedó claro 🤔 ${PREGUNTAS[ESTADOS.PIDIENDO_PAGO]}`);
    return {};
  }

  sesion.borrador.pago = elegido;
  sesion.estado = ESTADOS.CONFIRMANDO;
  respuestas.push(`Te leo todo antes de mandarlo a la caja 👇\n\n${borradores.resumen(sesion.borrador)}`);
  respuestas.push(PREGUNTAS[ESTADOS.CONFIRMANDO]);
  return {};
}

function pasoConfirmar(sesion, texto, respuestas, fecha) {
  if (esNegativo(texto)) {
    sesion.estado = ESTADOS.PIDIENDO_ITEMS;
    respuestas.push('Sin problema, seguimos armándolo. Decime qué agrego o qué saco, ' +
      'o escribime *cancelar* si preferís empezar de cero.');
    return {};
  }
  if (!esAfirmativo(texto)) {
    respuestas.push(PREGUNTAS[ESTADOS.CONFIRMANDO]);
    return {};
  }

  const pedido = confirmar(sesion, fecha);
  respuestas.push(textoPedidoTomado(pedido));
  return { pedido };
}

/** Cierra el borrador, crea el pedido para la caja y silencia al bot. */
export function confirmar(sesion, fecha = new Date()) {
  const totales = borradores.calcularTotales(sesion.borrador);

  const pedido = pedidos.crear({
    telefono: sesion.telefono,
    nombre: sesion.nombre || 'Sin nombre',
    items: sesion.borrador.items,
    modalidad: sesion.borrador.modalidad,
    direccion: sesion.borrador.direccion,
    zona: sesion.borrador.zona,
    pago: sesion.borrador.pago,
    notas: sesion.borrador.notas,
    ...totales,
    localAbierto: estaAbierto(negocio, fecha),
  });

  sesiones.reiniciarPedido(sesion);
  sesion.estado = ESTADOS.CON_CAJERO;
  sesion.ultimoPedidoId = pedido.id;
  sesiones.pausarBot(sesion.telefono);

  return pedido;
}

/** Manda la conversación a la caja y calla al bot. */
function derivarAPersona(sesion, texto, respuestas, motivo) {
  avisos.crear({
    telefono: sesion.telefono,
    nombre: sesion.nombre,
    motivo,
    mensaje: texto,
  });
  sesiones.pausarBot(sesion.telefono, 60);
  respuestas.push('Dale, ya le aviso a alguien del local para que te escriba por acá 👌');
  return { derivado: true };
}

function noEntendi(sesion, texto, respuestas) {
  sesion.fallosSeguidos += 1;

  if (sesion.fallosSeguidos >= 2) {
    return derivarAPersona(sesion, texto, respuestas, 'El bot no entendió la consulta dos veces seguidas');
  }
  respuestas.push(`Perdón, no te entendí 😅\n\n${ayuda()}`);
  return { sinRespuesta: true };
}
