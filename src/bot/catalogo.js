import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { similitud, normalizar } from '../lib/texto.js';
import { precio } from '../lib/formato.js';
import { DIAS } from '../lib/horarios.js';

const carpetaDatos = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');

const leer = (archivo) => JSON.parse(readFileSync(join(carpetaDatos, archivo), 'utf8'));

export const negocio = leer('negocio.json');
export const menu = leer('menu.json');
export const faqs = leer('faqs.json');

/** Todos los items del menú en una sola lista plana. */
export const items = menu.categorias.flatMap((categoria) =>
  categoria.items.map((item) => ({ ...item, categoria: categoria.id, categoriaNombre: categoria.nombre })),
);

/**
 * Busca en el menú lo que escribió el cliente ("2 muzza grande").
 * Devuelve el item más parecido o null si no hay nada razonable.
 */
export function buscarItem(texto) {
  const consulta = normalizar(texto);
  if (!consulta) return null;

  let mejor = null;
  let mejorPuntaje = 0;

  for (const item of items) {
    const candidatos = [item.nombre, ...(item.alias || [])];
    for (const candidato of candidatos) {
      const puntaje = similitud(consulta, candidato);
      if (puntaje > mejorPuntaje) {
        mejorPuntaje = puntaje;
        mejor = item;
      }
    }
  }
  return mejorPuntaje >= 0.5 ? { item: mejor, puntaje: mejorPuntaje } : null;
}

/** Promos vigentes hoy (las que no tienen días aplican siempre). */
export function promosDeHoy(fecha = new Date()) {
  const indice = new Date(fecha).getDay();
  const dia = DIAS[indice];
  return (menu.promos || []).filter((p) => !p.dias?.length || p.dias.includes(dia));
}

export function textoMenu() {
  const bloques = menu.categorias.map((categoria) => {
    const lineas = categoria.items.map(
      (item) => `• ${item.nombre} — ${precio(item.precio, negocio.moneda)}`,
    );
    return `*${categoria.nombre.toUpperCase()}*\n${lineas.join('\n')}`;
  });

  return `🍕 *Carta de ${negocio.nombre}*\n\n${bloques.join('\n\n')}\n\n` +
    'Para pedir, escribime lo que querés. Por ejemplo: *2 muzzarella y 1 gaseosa 1.5*';
}

export function textoPromos(fecha = new Date()) {
  const vigentes = promosDeHoy(fecha);
  if (!vigentes.length) {
    return '🎉 Hoy no tenemos promos activas, pero mirá la carta escribiendo *menú*.';
  }
  const lineas = vigentes.map(
    (p) => `• *${p.nombre}*: ${p.descripcion} — ${precio(p.precio, negocio.moneda)}`,
  );
  return `🎉 *Promos de hoy*\n${lineas.join('\n')}`;
}

export function textoZonas() {
  return negocio.zonasEnvio
    .map((z) => `• ${z.nombre}: ${precio(z.costo, negocio.moneda)}`)
    .join('\n');
}

/** Adivina la zona de envío a partir de la dirección que escribió el cliente. */
export function buscarZona(direccion) {
  let mejor = null;
  let mejorPuntaje = 0;
  for (const zona of negocio.zonasEnvio) {
    const puntaje = similitud(direccion, zona.nombre);
    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejor = zona;
    }
  }
  return mejorPuntaje >= 0.5 ? mejor : null;
}
