import test from 'node:test';
import assert from 'node:assert/strict';
import {
  interpretar, separarCantidad, agregarItem, aplicarTamano, itemsSinTamano,
  calcularTotales, alcanzaMinimoDelivery, detectarZona,
} from '../src/bot/pedido.js';
import { tamanoPorId } from '../src/bot/catalogo.js';

test('separa cantidades escritas con número o con palabra', () => {
  assert.deepEqual(separarCantidad('2 muzzarella'), { cantidad: 2, resto: 'muzzarella' });
  assert.deepEqual(separarCantidad('tres napolitanas'), { cantidad: 3, resto: 'napolitanas' });
  assert.equal(separarCantidad('una docena de empanadas').cantidad, 12);
  assert.equal(separarCantidad('media docena de empanadas').cantidad, 6);
});

test('encuentra la cantidad aunque venga tapada por muletillas', () => {
  assert.deepEqual(separarCantidad('dale, quiero pedir 2 muzzarella'), { cantidad: 2, resto: 'muzzarella' });
  assert.equal(interpretar('hola quiero 3 napolitanas').reconocidos[0].cantidad, 3);
  assert.equal(interpretar('me mandas 2 fugazzetas porfa').reconocidos[0].cantidad, 2);
});

test('lee el tamaño cuando el cliente lo escribe', () => {
  const [pizza] = interpretar('2 muzzarella 32').reconocidos;
  assert.equal(pizza.id, 'muzzarella');
  assert.equal(pizza.cantidad, 2);
  assert.equal(pizza.tamano, '32');
  assert.equal(pizza.precioUnitario, 23800);

  const [individual] = interpretar('una vikinga individual').reconocidos;
  assert.equal(individual.tamano, 'individual');
  assert.equal(individual.precioUnitario, 17000);
});

test('sin tamaño el precio queda pendiente hasta que se elija', () => {
  const borrador = { items: [] };
  for (const item of interpretar('2 napolitanas').reconocidos) agregarItem(borrador, item);

  assert.equal(borrador.items[0].precioUnitario, null);
  assert.equal(itemsSinTamano(borrador).length, 1);

  aplicarTamano(borrador, tamanoPorId('32'));
  assert.equal(itemsSinTamano(borrador).length, 0);
  assert.equal(borrador.items[0].precioUnitario, 30000);
});

test('interpreta varios productos con tamaños distintos', () => {
  const { reconocidos, dudosos } = interpretar('3 fugazza 32 y una chancha individual');
  assert.equal(dudosos.length, 0);
  assert.deepEqual(
    reconocidos.map((i) => [i.id, i.cantidad, i.tamano]),
    [['fugazza', 3, '32'], ['chancha', 1, 'individual']],
  );
});

test('no rompe los productos que llevan "y" en el nombre', () => {
  const { reconocidos } = interpretar('1 jamón y queso individual');
  assert.equal(reconocidos.length, 1);
  assert.equal(reconocidos[0].id, 'jamon-queso');
});

test('distingue fugazza de fugazzeta', () => {
  assert.equal(interpretar('una fugazza 32').reconocidos[0].id, 'fugazza');
  assert.equal(interpretar('una fugazzeta 32').reconocidos[0].id, 'fugazzeta');
});

test('marca como dudoso lo que no está en la carta', () => {
  const { reconocidos, dudosos } = interpretar('2 hamburguesas');
  assert.equal(reconocidos.length, 0);
  assert.deepEqual(dudosos, ['2 hamburguesas']);
});

test('agrupa la misma pizza del mismo tamaño, pero no si cambia el tamaño', () => {
  const borrador = { items: [] };
  for (const item of interpretar('1 muzzarella 32, 2 muzzarella 32, 1 muzzarella individual').reconocidos) {
    agregarItem(borrador, item);
  }
  assert.equal(borrador.items.length, 2);
  assert.equal(borrador.items.find((i) => i.tamano === '32').cantidad, 3);
  assert.equal(borrador.items.find((i) => i.tamano === 'individual').cantidad, 1);
});

test('un precio sin definir no se suma y queda marcado para la caja', () => {
  const borrador = { items: [], modalidad: 'retiro' };
  for (const item of interpretar('1 vasca 32').reconocidos) agregarItem(borrador, item);

  const totales = calcularTotales(borrador);
  assert.equal(totales.subtotal, 0);
  assert.equal(totales.aConfirmar, 1);
});

test('suma el envío sólo cuando es delivery', () => {
  const items = interpretar('2 muzzarella 32').reconocidos;
  const zona = { nombre: 'Centro', costo: 800 };
  assert.equal(calcularTotales({ items, modalidad: 'retiro' }).total, 47600);
  assert.equal(calcularTotales({ items, modalidad: 'delivery', zona }).total, 48400);
});

test('detecta el mínimo de delivery y la zona por la dirección', () => {
  const chico = { items: [{ precioUnitario: 1500, cantidad: 1 }], modalidad: 'delivery' };
  assert.equal(alcanzaMinimoDelivery(chico), false);
  assert.equal(detectarZona('Belgrano 340, Centro').nombre, 'Centro');
  assert.equal(detectarZona('en el medio del campo'), null);
});
