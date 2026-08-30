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

/** Tamaños disponibles (individual, 32 cm, …). */
export const tamanos = menu.tamanos || [];

/** Todos los items del menú en una sola lista plana. */
export const items = menu.categorias.flatMap((categoria) =>
  categoria.items.map((item) => ({
    ...item,
    categoria: categoria.id,
    categoriaNombre: categoria.nombre,
    porTamano: Boolean(categoria.porTamano),
  })),
);

export function itemPorId(id) {
  return items.find((i) => i.id === id) || null;
}

/** Precio de un item en un tamaño. null = hay que confirmarlo con la caja. */
export function precioDe(item, tamanoId) {
  if (!item) return null;
  if (item.precios) return item.precios[tamanoId] ?? null;
  return item.precio ?? null;
}

export function buscarTamano(texto, umbral = 0.7) {
  const consulta = normalizar(texto);
  if (!consulta) return null;

  let mejor = null;
  let mejorPuntaje = 0;
  for (const tamano of tamanos) {
    for (const candidato of [tamano.nombre, ...(tamano.alias || [])]) {
      const puntaje = similitud(consulta, candidato);
      if (puntaje > mejorPuntaje) {
        mejorPuntaje = puntaje;
        mejor = tamano;
      }
    }
  }
  return mejorPuntaje >= umbral ? mejor : null;
}

export function tamanoPorId(id) {
  return tamanos.find((t) => t.id === id) || null;
}

/**
 * Busca en el menú lo que escribió el cliente ("2 muzza 32").
 * Devuelve el item más parecido o null si no hay nada razonable.
 */
export function buscarItem(texto, umbral = 0.5) {
  const consulta = normalizar(texto);
  if (!consulta) return null;

  let mejor = null;
  let mejorPuntaje = 0;

  for (const item of items) {
    for (const candidato of [item.nombre, ...(item.alias || [])]) {
      const puntaje = similitud(consulta, candidato);
      if (puntaje > mejorPuntaje) {
        mejorPuntaje = puntaje;
        mejor = item;
      }
    }
  }
  return mejorPuntaje >= umbral ? { item: mejor, puntaje: mejorPuntaje } : null;
}

/** Promos vigentes hoy (las que no tienen días aplican siempre). */
export function promosDeHoy(fecha = new Date()) {
  const dia = DIAS[new Date(fecha).getDay()];
  return (menu.promos || []).filter((p) => !p.dias?.length || p.dias.includes(dia));
}

/** Lista de tamaños en texto: "Individual (1 persona) / 32 cm (2 personas)". */
export function textoTamanos() {
  return tamanos.map((t) => `*${t.nombre}*${t.detalle ? ` (${t.detalle})` : ''}`).join(' · ');
}

function precioEnTexto(item, tamanoId) {
  const valor = precioDe(item, tamanoId);
  return valor === null ? 'a confirmar' : precio(valor, negocio.moneda);
}

export function textoMenu() {
  const bloques = menu.categorias.map((categoria) => {
    const lineas = categoria.items.map((item) => {
      if (!categoria.porTamano) return `• ${item.nombre} — ${precio(item.precio, negocio.moneda)}`;
      const columnas = tamanos.map((t) => precioEnTexto(item, t.id)).join('  /  ');
      return `• ${item.nombre} — ${columnas}`;
    });
    return `*${categoria.nombre.toUpperCase()}*\n${lineas.join('\n')}`;
  });

  return `🍕 *Carta de ${negocio.nombre}*\n` +
    `Precios por tamaño: ${textoTamanos()}\n\n` +
    `${bloques.join('\n\n')}\n\n` +
    '¿Querés saber qué lleva alguna? Escribime el nombre.\n' +
    'Para pedir, mandame por ejemplo: *2 muzzarella 32* o *una vikinga individual*';
}

/** Ficha de una pizza: qué lleva y cuánto sale en cada tamaño. */
export function textoItem(item) {
  const precios = item.precios
    ? tamanos.map((t) => `• ${t.nombre}: ${precioEnTexto(item, t.id)}`).join('\n')
    : `• ${precio(item.precio, negocio.moneda)}`;
  return `🍕 *${item.nombre}*\n${item.descripcion || ''}\n\n${precios}`;
}

export function textoPromos(fecha = new Date()) {
  const vigentes = promosDeHoy(fecha);
  if (!vigentes.length) {
    return '🎉 Por ahora no tenemos promos cargadas. Mirá la carta escribiendo *menú*.';
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
