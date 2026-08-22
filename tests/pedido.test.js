import test from 'node:test';
import assert from 'node:assert/strict';
import {
  interpretar, separarCantidad, agregarItem, calcularTotales, alcanzaMinimoDelivery, detectarZona,
} from '../src/bot/pedido.js';

test('separa cantidades escritas con número o con palabra', () => {
  assert.deepEqual(separarCantidad('2 muzzarella'), { cantidad: 2, resto: 'muzzarella' });
  assert.deepEqual(separarCantidad('tres empanadas'), { cantidad: 3, resto: 'empanadas' });
  assert.equal(separarCantidad('una docena de empanadas de carne').cantidad, 12);
  assert.equal(separarCantidad('media docena de empanadas').cantidad, 6);
});

test('interpreta varios productos en un mismo mensaje', () => {
  const { reconocidos, dudosos } = interpretar('2 muzzarella y una coca');
  assert.equal(dudosos.length, 0);
  assert.deepEqual(reconocidos.map((i) => [i.id, i.cantidad]), [['muzzarella', 2], ['gaseosa-15', 1]]);
});

test('no rompe los productos que llevan "y" en el nombre', () => {
  const { reconocidos } = interpretar('1 jamón y morrones');
  assert.equal(reconocidos.length, 1);
  assert.equal(reconocidos[0].id, 'jamon-morrones');
});

test('marca como dudoso lo que no está en la carta', () => {
  const { reconocidos, dudosos } = interpretar('2 hamburguesas');
  assert.equal(reconocidos.length, 0);
  assert.deepEqual(dudosos, ['2 hamburguesas']);
});

test('agrupa el mismo producto pedido dos veces', () => {
  const borrador = { items: [] };
  agregarItem(borrador, { id: 'muzzarella', nombre: 'Muzzarella', precioUnitario: 7500, cantidad: 1 });
  agregarItem(borrador, { id: 'muzzarella', nombre: 'Muzzarella', precioUnitario: 7500, cantidad: 2 });
  assert.equal(borrador.items.length, 1);
  assert.equal(borrador.items[0].cantidad, 3);
});

test('suma el envío sólo cuando es delivery', () => {
  const items = [{ id: 'muzzarella', nombre: 'Muzzarella', precioUnitario: 7500, cantidad: 2 }];
  const zona = { nombre: 'Centro', costo: 800 };
  assert.deepEqual(calcularTotales({ items, modalidad: 'retiro' }), { subtotal: 15000, envio: 0, total: 15000 });
  assert.deepEqual(calcularTotales({ items, modalidad: 'delivery', zona }), { subtotal: 15000, envio: 800, total: 15800 });
});

test('detecta el mínimo de delivery y la zona por la dirección', () => {
  const chico = { items: [{ id: 'agua', precioUnitario: 1500, cantidad: 1 }], modalidad: 'delivery' };
  assert.equal(alcanzaMinimoDelivery(chico), false);
  assert.equal(detectarZona('Calle Falsa 123, Villa Sur').nombre, 'Villa Sur');
  assert.equal(detectarZona('en el medio del campo'), null);
});
