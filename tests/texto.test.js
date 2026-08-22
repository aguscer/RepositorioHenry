import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizar, similitud, esAfirmativo, esNegativo, puntajeContra } from '../src/lib/texto.js';

test('normalizar saca acentos, signos y emojis', () => {
  assert.equal(normalizar('¿Cuánto sale la MUZZARELLA? 🍕'), 'cuanto sale la muzzarella');
});

test('similitud reconoce el producto aunque el cliente agregue palabras', () => {
  assert.ok(similitud('una pizza de muzzarella', 'Muzzarella') >= 0.5);
  assert.ok(similitud('empanadas de carne', 'Empanada de carne') >= 0.8);
  assert.equal(similitud('coca cola', 'Muzzarella'), 0);
});

test('afirmaciones y negaciones típicas', () => {
  for (const si of ['si', 'dale', 'ok', 'confirmo', 'de una']) assert.ok(esAfirmativo(si), si);
  for (const no of ['no', 'cancelar', 'mejor no']) assert.ok(esNegativo(no), no);
  assert.ok(!esAfirmativo('quiero pedir'));
});

test('la frase completa puntúa más que las palabras sueltas', () => {
  assert.ok(puntajeContra('a que hora abren', ['a que hora']) > puntajeContra('abren hoy', ['abren']));
});
