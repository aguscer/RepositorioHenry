import { Coleccion } from './db.js';
import { bus } from '../lib/bus.js';

const coleccion = new Coleccion('avisos', { lista: [] });

/**
 * Un aviso es una consulta que el bot no supo resolver, o un cliente
 * que pidió hablar con una persona. Aparece en el panel de la caja.
 */
export function crear({ telefono, nombre = '', motivo, mensaje = '' }) {
  const aviso = {
    id: `avi_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    telefono,
    nombre,
    motivo,
    mensaje,
    estado: 'abierto',
    creadoEn: Date.now(),
  };
  coleccion.datos.lista.unshift(aviso);
  if (coleccion.datos.lista.length > 300) coleccion.datos.lista.length = 300;
  coleccion.guardar();

  bus.emit('aviso:nuevo', aviso);
  return aviso;
}

export function listar({ soloAbiertos = false, limite = 50 } = {}) {
  const lista = soloAbiertos
    ? coleccion.datos.lista.filter((a) => a.estado === 'abierto')
    : coleccion.datos.lista;
  return lista.slice(0, limite);
}

export function cerrar(id, quien = 'caja') {
  const aviso = coleccion.datos.lista.find((a) => a.id === id);
  if (!aviso) return null;
  aviso.estado = 'cerrado';
  aviso.cerradoPor = quien;
  aviso.cerradoEn = Date.now();
  coleccion.guardar();
  bus.emit('aviso:actualizado', aviso);
  return aviso;
}

export function _coleccion() {
  return coleccion;
}
