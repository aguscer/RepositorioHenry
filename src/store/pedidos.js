import { Coleccion } from './db.js';
import { bus } from '../lib/bus.js';
import { codigoPedido } from '../lib/formato.js';

const coleccion = new Coleccion('pedidos', { secuencia: 0, dia: '', lista: [] });

export const ESTADOS_PEDIDO = ['nuevo', 'tomado', 'cargado', 'cobrado', 'cancelado'];

export const ETIQUETA_ESTADO = {
  nuevo: 'Nuevo',
  tomado: 'Tomado por caja',
  cargado: 'Cargado en el sistema',
  cobrado: 'Cobrado',
  cancelado: 'Cancelado',
};

function claveDelDia(fecha = new Date()) {
  return fecha.toISOString().slice(0, 10);
}

function siguienteSecuencia(fecha) {
  const hoy = claveDelDia(fecha);
  if (coleccion.datos.dia !== hoy) {
    coleccion.datos.dia = hoy;
    coleccion.datos.secuencia = 0;
  }
  coleccion.datos.secuencia += 1;
  return coleccion.datos.secuencia;
}

export function crear(datos) {
  const ahora = new Date();
  const pedido = {
    id: `ped_${ahora.getTime()}_${Math.random().toString(36).slice(2, 7)}`,
    codigo: codigoPedido(siguienteSecuencia(ahora), ahora),
    estado: 'nuevo',
    creadoEn: ahora.getTime(),
    actualizadoEn: ahora.getTime(),
    atendidoPor: '',
    historial: [{ estado: 'nuevo', en: ahora.getTime(), quien: 'bot' }],
    ...datos,
  };

  coleccion.datos.lista.unshift(pedido);
  if (coleccion.datos.lista.length > 500) coleccion.datos.lista.length = 500;
  coleccion.guardar();

  bus.emit('pedido:nuevo', pedido);
  return pedido;
}

export function obtener(id) {
  return coleccion.datos.lista.find((p) => p.id === id) || null;
}

export function listar({ estados, limite = 100 } = {}) {
  let lista = coleccion.datos.lista;
  if (estados?.length) lista = lista.filter((p) => estados.includes(p.estado));
  return lista.slice(0, limite);
}

export function cambiarEstado(id, estado, quien = 'caja') {
  if (!ESTADOS_PEDIDO.includes(estado)) throw new Error(`Estado inválido: ${estado}`);
  const pedido = obtener(id);
  if (!pedido) return null;

  pedido.estado = estado;
  pedido.actualizadoEn = Date.now();
  if (quien && estado === 'tomado') pedido.atendidoPor = quien;
  pedido.historial.push({ estado, en: pedido.actualizadoEn, quien });

  coleccion.guardar();
  bus.emit('pedido:actualizado', pedido);
  return pedido;
}

export function anotar(id, nota) {
  const pedido = obtener(id);
  if (!pedido) return null;
  pedido.notasCaja = [pedido.notasCaja, nota].filter(Boolean).join(' | ');
  pedido.actualizadoEn = Date.now();
  coleccion.guardar();
  bus.emit('pedido:actualizado', pedido);
  return pedido;
}

/** Resumen del día para el encabezado del panel. */
export function resumenDelDia() {
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  const delDia = coleccion.datos.lista.filter((p) => p.creadoEn >= inicio.getTime());
  const cobrados = delDia.filter((p) => p.estado === 'cobrado');

  return {
    total: delDia.length,
    pendientes: delDia.filter((p) => ['nuevo', 'tomado'].includes(p.estado)).length,
    cobrados: cobrados.length,
    facturado: cobrados.reduce((suma, p) => suma + (p.total || 0), 0),
  };
}

export function _coleccion() {
  return coleccion;
}
