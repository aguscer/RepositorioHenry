import test from 'node:test';
import assert from 'node:assert/strict';
import { usarCarpetaTemporal } from './ayuda.js';

usarCarpetaTemporal();

const conversacion = await import('../src/bot/conversacion.js');
const sesiones = await import('../src/store/sesiones.js');
const pedidos = await import('../src/store/pedidos.js');

const MARTES_21 = new Date('2026-09-02T00:30:00Z'); // martes 21:30 en Neuquén, local abierto

function decir(telefono, texto, fecha = MARTES_21) {
  return conversacion.procesar({ telefono, nombre: '', texto }, fecha);
}

test('responde preguntas frecuentes sin entrar al flujo de pedido', () => {
  const respuesta = decir('549110001', '¿a qué hora abren?');
  assert.equal(respuesta.faq, 'horarios');
  assert.equal(sesiones.obtener('549110001').estado, sesiones.ESTADOS.LIBRE);
});

test('"cuánto demoran los pedidos" no arranca un pedido', () => {
  const respuesta = decir('549110002', '¿cuánto demoran?');
  assert.equal(respuesta.faq, 'demora');
  assert.ok(!respuesta.inicioPedido);
});

test('toma el pedido completo y lo deja listo para la caja', () => {
  const telefono = '549110003';
  const guion = [
    'quiero pedir',
    '2 muzzarella 32',
    'listo',
    'delivery',
    'Calle Falsa 123, Villa Sur',
    'Agustín',
    'transferencia',
    'sí',
  ];

  let ultima;
  for (const mensaje of guion) ultima = decir(telefono, mensaje);

  const pedido = ultima.pedido;
  assert.ok(pedido, 'no se creó el pedido');
  assert.equal(pedido.estado, 'nuevo');
  assert.equal(pedido.nombre, 'Agustín');
  assert.equal(pedido.modalidad, 'delivery');
  assert.equal(pedido.zona.nombre, 'Villa Sur');
  assert.equal(pedido.pago, 'Transferencia');
  assert.equal(pedido.items[0].tamano, '32');
  assert.equal(pedido.subtotal, 47600);
  assert.equal(pedido.envio, 1500);
  assert.equal(pedido.total, 49100);
  assert.equal(pedidos.obtener(pedido.id).codigo, pedido.codigo);
});

test('después de confirmar, el bot deja de responder para que atienda una persona', () => {
  const telefono = '549110004';
  for (const mensaje of ['quiero pedir 1 muzzarella individual', 'listo', 'retiro', 'Ana', 'efectivo', 'dale']) {
    decir(telefono, mensaje);
  }
  const respuesta = decir(telefono, '¿está listo?');
  assert.equal(respuesta.pausado, true);
  assert.deepEqual(respuesta.respuestas, []);
});

test('el cliente puede cancelar en medio del pedido', () => {
  const telefono = '549110005';
  decir(telefono, 'quiero pedir');
  decir(telefono, '3 empanadas de carne');
  decir(telefono, 'cancelar');
  const sesion = sesiones.obtener(telefono);
  assert.equal(sesion.estado, sesiones.ESTADOS.LIBRE);
  assert.equal(sesion.borrador.items.length, 0);
});

test('pedir hablar con una persona genera un aviso y silencia al bot', async () => {
  const avisos = await import('../src/store/avisos.js');
  const telefono = '549110006';
  const respuesta = decir(telefono, 'quiero hablar con alguien');

  assert.equal(respuesta.derivado, true);
  assert.ok(avisos.listar({ soloAbiertos: true }).some((a) => a.telefono === telefono));
  assert.equal(sesiones.botEnPausa(sesiones.obtener(telefono)), true);
});

test('dos mensajes sin entender derivan la charla a la caja', () => {
  const telefono = '549110007';
  const primera = decir(telefono, 'asdkjfhaksjdhf');
  assert.equal(primera.sinRespuesta, true);
  const segunda = decir(telefono, 'qwertyuiop zxcvb');
  assert.equal(segunda.derivado, true);
});

test('en medio del pedido responde una consulta sin perder el hilo', () => {
  const telefono = '549110008';
  decir(telefono, 'quiero pedir');
  decir(telefono, '2 muzzarella 32');
  const respuesta = decir(telefono, '¿cuánto sale el envío?');

  assert.equal(respuesta.faq, 'delivery');
  assert.equal(sesiones.obtener(telefono).estado, sesiones.ESTADOS.PIDIENDO_ITEMS);
  assert.equal(sesiones.obtener(telefono).borrador.items.length, 1);
});

test('pregunta el tamaño cuando el cliente no lo dice', () => {
  const telefono = '549110020';
  decir(telefono, 'quiero pedir 2 napolitanas');

  const sesion = sesiones.obtener(telefono);
  assert.equal(sesion.estado, sesiones.ESTADOS.PIDIENDO_TAMANO);
  assert.equal(sesion.borrador.items[0].precioUnitario, null);

  decir(telefono, '32');
  const actualizada = sesiones.obtener(telefono);
  assert.equal(actualizada.estado, sesiones.ESTADOS.PIDIENDO_ITEMS);
  assert.equal(actualizada.borrador.items[0].precioUnitario, 30000);
});

test('responde qué lleva una pizza puntual', () => {
  const respuesta = decir('549110021', '¿qué lleva la vikinga?');
  assert.equal(respuesta.producto, 'vikinga');
  assert.match(respuesta.respuestas[0], /berenjena/i);
});

test('avisa cuando el local está cerrado pero igual toma el pedido', () => {
  const lunes = new Date('2026-09-01T00:30:00Z'); // lunes 21:30 en Neuquén
  const respuesta = conversacion.procesar({ telefono: '549110009', texto: 'quiero pedir' }, lunes);
  assert.match(respuesta.respuestas[0], /cerrados/i);
});
