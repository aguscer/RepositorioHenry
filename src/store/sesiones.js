import { Coleccion } from './db.js';
import { config } from '../config.js';

const coleccion = new Coleccion('sesiones', {});

export const ESTADOS = {
  LIBRE: 'libre',
  PIDIENDO_ITEMS: 'pidiendo_items',
  PIDIENDO_TAMANO: 'pidiendo_tamano',
  PIDIENDO_MODALIDAD: 'pidiendo_modalidad',
  PIDIENDO_DIRECCION: 'pidiendo_direccion',
  PIDIENDO_NOMBRE: 'pidiendo_nombre',
  PIDIENDO_PAGO: 'pidiendo_pago',
  CONFIRMANDO: 'confirmando',
  CON_CAJERO: 'con_cajero',
};

function nueva(telefono) {
  return {
    telefono,
    nombre: '',
    estado: ESTADOS.LIBRE,
    borrador: { items: [], modalidad: null, direccion: '', zona: null, pago: '', notas: '' },
    fallosSeguidos: 0,
    botPausadoHasta: 0,
    creadaEn: Date.now(),
    ultimoMensajeEn: Date.now(),
    historial: [],
  };
}

export function obtener(telefono) {
  if (!coleccion.datos[telefono]) coleccion.datos[telefono] = nueva(telefono);
  return coleccion.datos[telefono];
}

export function guardar(sesion) {
  sesion.ultimoMensajeEn = Date.now();
  coleccion.datos[sesion.telefono] = sesion;
  coleccion.guardar();
  return sesion;
}

export function reiniciarPedido(sesion) {
  sesion.estado = ESTADOS.LIBRE;
  sesion.borrador = { items: [], modalidad: null, direccion: '', zona: null, pago: '', notas: '' };
  sesion.fallosSeguidos = 0;
  return guardar(sesion);
}

/** El bot se calla en esta conversación mientras la atiende una persona. */
export function pausarBot(telefono, minutos = config.minutosPausaBot) {
  const sesion = obtener(telefono);
  sesion.botPausadoHasta = Date.now() + minutos * 60_000;
  return guardar(sesion);
}

export function reanudarBot(telefono) {
  const sesion = obtener(telefono);
  sesion.botPausadoHasta = 0;
  if (sesion.estado === ESTADOS.CON_CAJERO) sesion.estado = ESTADOS.LIBRE;
  return guardar(sesion);
}

export function botEnPausa(sesion) {
  return Boolean(sesion.botPausadoHasta && sesion.botPausadoHasta > Date.now());
}

/** Guarda el ida y vuelta para que el cajero vea el contexto en el panel. */
export function registrarMensaje(sesion, quien, texto) {
  sesion.historial.push({ quien, texto, en: Date.now() });
  if (sesion.historial.length > 40) sesion.historial = sesion.historial.slice(-40);
  return sesion;
}

export function todas() {
  return Object.values(coleccion.datos);
}

export function _coleccion() {
  return coleccion;
}
