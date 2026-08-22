/**
 * Utilidades de texto para entender lo que escribe el cliente.
 * Todo se compara sin acentos, en minúsculas y sin signos.
 */

export function normalizar(texto = '') {
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // saca acentos
    .replace(/[^a-z0-9ñ\s]/g, ' ')   // saca emojis y signos
    .replace(/\s+/g, ' ')
    .trim();
}

export function palabras(texto = '') {
  const normal = normalizar(texto);
  return normal ? normal.split(' ') : [];
}

/**
 * Puntúa cuánto se parece un mensaje a una clave (que puede tener varias palabras).
 *  - frase completa encontrada  -> puntaje alto
 *  - todas las palabras sueltas -> puntaje medio
 *  - ninguna coincidencia       -> 0
 */
export function puntajeClave(mensajeNormalizado, clave) {
  const claveNormal = normalizar(clave);
  if (!claveNormal) return 0;
  const partes = claveNormal.split(' ');

  const frase = new RegExp(`(^|\\s)${claveNormal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`);
  if (frase.test(mensajeNormalizado)) {
    return partes.length * 2 + (partes.length > 1 ? 1 : 0);
  }

  const sueltas = new Set(mensajeNormalizado.split(' '));
  if (partes.length > 1 && partes.every((p) => sueltas.has(p))) {
    return partes.length;
  }
  return 0;
}

/** Devuelve el mejor puntaje del mensaje contra una lista de claves. */
export function puntajeContra(mensaje, claves = []) {
  const normal = normalizar(mensaje);
  let mejor = 0;
  for (const clave of claves) {
    const p = puntajeClave(normal, clave);
    if (p > mejor) mejor = p;
  }
  return mejor;
}

/**
 * Similitud 0..1 entre dos textos, por palabras compartidas.
 * Se usa para adivinar qué item del menú quiso pedir el cliente.
 * Pondera más la *cobertura* del candidato que la del texto del cliente:
 * "una pizza de muzzarella" tiene que reconocer "Muzzarella".
 */
export function similitud(consulta, candidato) {
  const pa = new Set(palabras(consulta));
  const pb = new Set(palabras(candidato));
  if (!pa.size || !pb.size) return 0;

  let coincidencias = 0;
  for (const palabra of pb) {
    if (pa.has(palabra)) {
      coincidencias += 1;
      continue;
    }
    // tolera plurales y variantes cortas ("empanadas" vs "empanada")
    for (const otra of pa) {
      if (palabra.length >= 4 && otra.length >= 4
          && (otra.startsWith(palabra) || palabra.startsWith(otra))) {
        coincidencias += 0.8;
        break;
      }
    }
  }

  const cobertura = coincidencias / pb.size;   // cuánto del item nombró el cliente
  const precision = coincidencias / pa.size;   // cuánto de lo que dijo es del item
  return 0.7 * cobertura + 0.3 * precision;
}

/** true si el mensaje es una confirmación ("si", "dale", "confirmo"...). */
export function esAfirmativo(texto) {
  return puntajeContra(texto, [
    'si', 'sii', 'siii', 'dale', 'confirmo', 'confirmar', 'ok', 'oka', 'okey',
    'listo', 'perfecto', 'de una', 'obvio', 'correcto', 'esta bien', 'asi es', 'sip', 'va',
  ]) > 0;
}

/** true si el mensaje es una negación ("no", "cancelar"...). */
export function esNegativo(texto) {
  return puntajeContra(texto, [
    'no', 'nop', 'negativo', 'cancelar', 'cancela', 'anular', 'mejor no', 'dejalo', 'nada',
  ]) > 0;
}
