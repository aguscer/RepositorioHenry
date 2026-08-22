import { faqs } from './catalogo.js';
import { puntajeContra } from '../lib/texto.js';
import { renderizar } from './plantillas.js';

/** Debajo de este puntaje se considera que no entendimos la consulta. */
export const UMBRAL = 2;

/**
 * Busca la pregunta frecuente que mejor responde al mensaje.
 * Devuelve null si ninguna llega al umbral.
 */
export function buscar(mensaje) {
  let mejor = null;
  let mejorPuntaje = 0;

  for (const faq of faqs) {
    const puntaje = puntajeContra(mensaje, faq.claves);
    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejor = faq;
    }
  }
  return mejorPuntaje >= UMBRAL ? { faq: mejor, puntaje: mejorPuntaje } : null;
}

/** Texto ya renderizado de la FAQ que corresponda, o null. */
export function responder(mensaje, fecha = new Date()) {
  const encontrada = buscar(mensaje);
  if (!encontrada) return null;
  return {
    id: encontrada.faq.id,
    puntaje: encontrada.puntaje,
    texto: renderizar(encontrada.faq.respuesta, {}, fecha),
  };
}
