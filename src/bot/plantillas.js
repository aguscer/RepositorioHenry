import { negocio, textoMenu, textoPromos, textoZonas } from './catalogo.js';
import { horariosEnTexto, estadoEnTexto } from '../lib/horarios.js';
import { precio } from '../lib/formato.js';

/**
 * Reemplaza los {{marcadores}} de las respuestas por datos reales del negocio,
 * así los textos de faqs.json se editan sin tocar código.
 */
export function renderizar(plantilla, extra = {}, fecha = new Date()) {
  const contexto = {
    nombre: negocio.nombre,
    direccion: negocio.direccion,
    telefono: negocio.telefono,
    horarios: horariosEnTexto(negocio),
    estadoActual: estadoEnTexto(negocio, fecha),
    menu: textoMenu(),
    promos: textoPromos(fecha),
    zonas: textoZonas(),
    mediosPago: negocio.mediosPago.map((m) => `• ${m}`).join('\n'),
    minimoDelivery: precio(negocio.minimoDelivery, negocio.moneda),
    demoraMostrador: negocio.demoraMostrador,
    demoraDelivery: negocio.demoraDelivery,
    ...extra,
  };

  return String(plantilla).replace(/\{\{(\w+)\}\}/g, (coincidencia, clave) =>
    (clave in contexto ? String(contexto[clave]) : coincidencia),
  );
}
