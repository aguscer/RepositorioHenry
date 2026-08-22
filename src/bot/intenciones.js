import { puntajeContra } from '../lib/texto.js';

/** Frases que disparan cada intención. Se pueden ampliar sin tocar la lógica. */
export const INTENCIONES = {
  pedir: [
    'quiero pedir', 'quiero hacer un pedido', 'hacer un pedido', 'tomar un pedido',
    'quiero encargar', 'encargar', 'quiero ordenar', 'ordenar', 'me tomas el pedido',
    'quisiera pedir', 'necesito pedir', 'para pedir', 'anotame', 'anota', 'pedir',
    'quiero comprar', 'te hago un pedido', 'mandame', 'quiero pizza', 'quiero pizzas',
  ],
  humano: [
    'hablar con alguien', 'hablar con una persona', 'con un humano', 'humano',
    'quiero hablar con alguien', 'atencion humana', 'una persona', 'operador',
    'encargado', 'dueño', 'me atiende alguien', 'no me sirve el bot', 'sos un bot',
  ],
  cancelar: [
    'cancelar', 'cancelar pedido', 'cancela el pedido', 'anular', 'anular pedido',
    'olvidalo', 'dejalo asi', 'empezar de nuevo', 'borra todo',
  ],
  listo: [
    'listo', 'eso es todo', 'nada mas', 'ya esta', 'terminar', 'terminado',
    'seria todo', 'con eso', 'confirmar pedido', 'cerrar pedido',
  ],
  ayuda: [
    'ayuda', 'help', 'que podes hacer', 'opciones', 'como funciona', 'que sabes hacer',
  ],
};

/** Devuelve { intencion, puntaje } con la intención más fuerte, o puntaje 0. */
export function detectar(mensaje) {
  let mejor = { intencion: null, puntaje: 0 };
  for (const [intencion, claves] of Object.entries(INTENCIONES)) {
    const puntaje = puntajeContra(mensaje, claves);
    if (puntaje > mejor.puntaje) mejor = { intencion, puntaje };
  }
  return mejor;
}
