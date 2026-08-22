import test from 'node:test';
import assert from 'node:assert/strict';
import { responder } from '../src/bot/faq.js';

const casos = [
  ['a que hora abren?', 'horarios'],
  ['hasta qué hora atienden hoy', 'horarios'],
  ['me pasás la carta?', 'menu'],
  ['cuánto sale la muzza', 'menu'],
  ['hacen delivery a barrio norte?', 'delivery'],
  ['cuánto es el costo de envío', 'delivery'],
  ['aceptan tarjeta?', 'pagos'],
  ['puedo pagar con mercado pago', 'pagos'],
  ['cuánto demoran?', 'demora'],
  ['dónde están ubicados', 'direccion'],
  ['tienen alguna promo hoy', 'promos'],
  ['tienen opciones sin tacc?', 'celiaco'],
  ['hola buenas tardes', 'saludo'],
];

for (const [pregunta, esperado] of casos) {
  test(`responde "${pregunta}" con la FAQ ${esperado}`, () => {
    const respuesta = responder(pregunta);
    assert.ok(respuesta, 'no encontró ninguna FAQ');
    assert.equal(respuesta.id, esperado);
  });
}

test('no inventa respuestas para consultas ajenas al negocio', () => {
  assert.equal(responder('me arreglás la bicicleta'), null);
});

test('las respuestas resuelven los marcadores de plantilla', () => {
  const respuesta = responder('a que hora abren?');
  assert.ok(!respuesta.texto.includes('{{'));
});
