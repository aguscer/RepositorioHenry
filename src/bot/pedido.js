import { buscarItem, buscarZona, negocio } from './catalogo.js';
import { normalizar } from '../lib/texto.js';
import { precio } from '../lib/formato.js';

const NUMEROS = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
  siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
};

const PALABRAS_CANTIDAD = [...Object.keys(NUMEROS), 'media', 'docena'];

const INICIO_CANTIDAD = new RegExp(`\\s+y\\s+(?=\\d|${PALABRAS_CANTIDAD.join('\\s|')}\\s)`, 'g');

/**
 * Muletillas con las que la gente arranca el pedido y que tapan la cantidad:
 * "dale, quiero pedir 2 muzzarella" tiene que leerse como "2 muzzarella".
 */
const RELLENO = new Set([
  'hola', 'buenas', 'dale', 'ok', 'listo', 'porfa', 'porfavor', 'por', 'favor', 'gracias',
  'y', 'e', 'tambien', 'ademas', 'mas', 'otra', 'otro',
  'quiero', 'querria', 'quisiera', 'necesito', 'deseo', 'va', 'van', 'seria', 'serian',
  'me', 'te', 'le', 'das', 'dame', 'da', 'mandas', 'manda', 'mandame', 'traeme', 'trae',
  'pedir', 'pedirte', 'pido', 'encargar', 'ordenar', 'agregar', 'agregame', 'sumame',
  'anotame', 'anota', 'poneme', 'pone', 'ponme', 'llevo', 'llevar', 'quisieramos',
  'para', 'pa', 'del', 'el', 'la', 'los', 'las', 'lo', 'de', 'en', 'con', 'a',
]);

/** Saca las muletillas del principio para dejar a la vista la cantidad. */
function sacarRelleno(normal) {
  const partes = normal.split(' ');
  while (partes.length > 1 && RELLENO.has(partes[0])) partes.shift();
  return partes.join(' ');
}

/**
 * Parte lo que escribió el cliente en pedazos, uno por producto.
 * Corta por comas, saltos de línea y "+", y por " y " sólo cuando lo que sigue
 * arranca con una cantidad (para no romper "jamón y morrones").
 */
export function partirEnLineas(texto) {
  return String(texto)
    .split(/[,;\n+]| mas /i)
    .flatMap((parte) => parte.split(INICIO_CANTIDAD))
    .map((parte) => parte.trim())
    .filter(Boolean);
}

/** Separa "2 muzzarella" en { cantidad: 2, resto: 'muzzarella' }. */
export function separarCantidad(linea) {
  const normal = sacarRelleno(normalizar(linea));
  const tope = (n) => Math.min(Math.max(n, 1), 99);

  // docenas: "una docena de empanadas", "media docena de...", "2 docenas de..."
  const docena = normal.match(/^(?:(\d{1,2}|[a-zñ]+)\s+)?docenas?\s+(?:de\s+)?(.*)$/);
  if (docena) {
    const [, cuantas, resto] = docena;
    if (!cuantas) return { cantidad: 12, resto };
    if (cuantas === 'media') return { cantidad: 6, resto };
    const base = /^\d+$/.test(cuantas) ? Number(cuantas) : NUMEROS[cuantas];
    if (base) return { cantidad: tope(base * 12), resto };
  }

  const conNumero = normal.match(/^(\d{1,2})\s+(.*)$/);
  if (conNumero) return { cantidad: tope(Number(conNumero[1])), resto: conNumero[2] };

  const conPalabra = normal.match(/^([a-zñ]+)\s+(.*)$/);
  if (conPalabra && NUMEROS[conPalabra[1]]) {
    return { cantidad: NUMEROS[conPalabra[1]], resto: conPalabra[2].replace(/^de\s+/, '') };
  }
  return { cantidad: 1, resto: normal };
}

/**
 * Interpreta un mensaje de pedido.
 * Devuelve lo que reconoció y lo que no, para poder repreguntar.
 */
export function interpretar(texto) {
  const reconocidos = [];
  const dudosos = [];

  for (const linea of partirEnLineas(texto)) {
    const { cantidad, resto } = separarCantidad(linea);
    if (!resto) continue;

    const encontrado = buscarItem(resto);
    if (encontrado) {
      reconocidos.push({
        id: encontrado.item.id,
        nombre: encontrado.item.nombre,
        precioUnitario: encontrado.item.precio,
        cantidad,
      });
    } else {
      dudosos.push(linea.trim());
    }
  }
  return { reconocidos, dudosos };
}

/** Suma un item al borrador, agrupando repetidos. */
export function agregarItem(borrador, nuevo) {
  const existente = borrador.items.find((i) => i.id === nuevo.id);
  if (existente) existente.cantidad += nuevo.cantidad;
  else borrador.items.push({ ...nuevo });
  return borrador;
}

export function quitarItem(borrador, id) {
  borrador.items = borrador.items.filter((i) => i.id !== id);
  return borrador;
}

export function calcularTotales(borrador) {
  const subtotal = borrador.items.reduce((suma, i) => suma + i.precioUnitario * i.cantidad, 0);
  const envio = borrador.modalidad === 'delivery' ? (borrador.zona?.costo ?? 0) : 0;
  return { subtotal, envio, total: subtotal + envio };
}

/** ¿Llega al mínimo para que le lleven el pedido? */
export function alcanzaMinimoDelivery(borrador) {
  if (borrador.modalidad !== 'delivery') return true;
  return calcularTotales(borrador).subtotal >= (negocio.minimoDelivery || 0);
}

export function detectarZona(direccion) {
  return buscarZona(direccion);
}

/** Detalle del pedido en texto, para el cliente y para la caja. */
export function resumen(borrador, { conTotales = true } = {}) {
  const moneda = negocio.moneda;
  const lineas = borrador.items.map(
    (i) => `• ${i.cantidad} x ${i.nombre} — ${precio(i.precioUnitario * i.cantidad, moneda)}`,
  );
  if (!conTotales) return lineas.join('\n');

  const { subtotal, envio, total } = calcularTotales(borrador);
  const extra = [];
  if (borrador.modalidad) {
    extra.push(borrador.modalidad === 'delivery'
      ? `🛵 Envío a: ${borrador.direccion}${borrador.zona ? ` (${borrador.zona.nombre})` : ''}`
      : '🏠 Retira por el local');
  }
  if (borrador.pago) extra.push(`💳 Pago: ${borrador.pago}`);
  if (borrador.notas) extra.push(`📝 Nota: ${borrador.notas}`);

  const totales = [`Subtotal: ${precio(subtotal, moneda)}`];
  if (envio) totales.push(`Envío: ${precio(envio, moneda)}`);
  totales.push(`*TOTAL: ${precio(total, moneda)}*`);

  return [lineas.join('\n'), extra.join('\n'), totales.join('\n')].filter(Boolean).join('\n\n');
}
