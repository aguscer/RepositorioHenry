import test from 'node:test';
import assert from 'node:assert/strict';
import { estaAbierto, proximaApertura, horariosEnTexto } from '../src/lib/horarios.js';

const negocio = {
  zonaHoraria: 'America/Argentina/Buenos_Aires',
  horarios: {
    lunes: null,
    martes: [['19:00', '23:30']],
    miercoles: [['19:00', '23:30']],
    jueves: [['19:00', '23:30']],
    viernes: [['19:00', '00:30']],
    sabado: [['12:00', '15:00'], ['19:00', '00:30']],
    domingo: [['19:00', '23:30']],
  },
};

// Los horarios del local son de Buenos Aires (UTC-3).
test('abierto dentro del turno', () => {
  assert.equal(estaAbierto(negocio, new Date('2026-08-22T23:00:00Z')), true); // sábado 20:00
});

test('cerrado fuera del turno', () => {
  assert.equal(estaAbierto(negocio, new Date('2026-08-22T20:00:00Z')), false); // sábado 17:00
});

test('el turno que cruza la medianoche sigue abierto', () => {
  assert.equal(estaAbierto(negocio, new Date('2026-08-23T03:00:00Z')), true); // domingo 00:00
  assert.equal(estaAbierto(negocio, new Date('2026-08-23T04:00:00Z')), false); // domingo 01:00
});

test('el lunes está cerrado y avisa cuándo abre', () => {
  const lunes = new Date('2026-08-24T23:00:00Z'); // lunes 20:00
  assert.equal(estaAbierto(negocio, lunes), false);
  assert.match(proximaApertura(negocio, lunes), /mañana a las 19:00/);
});

test('el texto de horarios lista los siete días', () => {
  assert.equal(horariosEnTexto(negocio).split('\n').length, 7);
});
