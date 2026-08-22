/** Formatea importes como "$ 8.500". */
export function precio(valor, moneda = '$') {
  const numero = Number(valor || 0);
  return `${moneda} ${numero.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

/** Muestra "+54 9 11 5555-5555" tal cual llega, pero legible si viene sin signos. */
export function telefonoLegible(numero = '') {
  const limpio = String(numero).replace(/\D/g, '');
  return limpio ? `+${limpio}` : '';
}

/** Código corto e irrepetible para identificar el pedido en la caja. */
export function codigoPedido(secuencia, fecha = new Date()) {
  const dia = String(fecha.getDate()).padStart(2, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${dia}${mes}-${String(secuencia).padStart(3, '0')}`;
}
