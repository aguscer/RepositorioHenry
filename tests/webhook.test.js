import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

process.env.WHATSAPP_APP_SECRET = 'secreto-de-prueba';
const cloud = await import('../src/whatsapp/cloudApi.js');

const cuerpoMeta = {
  entry: [{
    changes: [{
      value: {
        contacts: [{ wa_id: '5491133334444', profile: { name: 'Vale' } }],
        messages: [{ id: 'wamid.1', from: '5491133334444', type: 'text', text: { body: 'hola' } }],
      },
    }],
  }],
};

test('traduce el webhook de Meta a mensajes simples', () => {
  const [mensaje] = cloud.parsearEntrantes(cuerpoMeta);
  assert.equal(mensaje.telefono, '5491133334444');
  assert.equal(mensaje.nombre, 'Vale');
  assert.equal(mensaje.texto, 'hola');
});

test('ignora los avisos de estado (entregado, leído)', () => {
  const soloEstados = { entry: [{ changes: [{ value: { statuses: [{ status: 'delivered' }] } }] }] };
  assert.deepEqual(cloud.parsearEntrantes(soloEstados), []);
});

test('lee la respuesta de un botón interactivo', () => {
  const conBoton = {
    entry: [{ changes: [{ value: { messages: [{
      id: 'wamid.2', from: '549113', type: 'interactive',
      interactive: { button_reply: { id: 'pedir', title: 'Quiero pedir' } },
    }] } }] }],
  };
  assert.equal(cloud.parsearEntrantes(conBoton)[0].texto, 'Quiero pedir');
});

test('acepta la firma correcta y rechaza la adulterada', () => {
  const crudo = Buffer.from(JSON.stringify(cuerpoMeta));
  const firma = `sha256=${createHmac('sha256', 'secreto-de-prueba').update(crudo).digest('hex')}`;

  assert.equal(cloud.firmaValida(crudo, firma), true);
  assert.equal(cloud.firmaValida(Buffer.from('{"otra":"cosa"}'), firma), false);
  assert.equal(cloud.firmaValida(crudo, 'sha256=00'), false);
  assert.equal(cloud.firmaValida(crudo, undefined), false);
});
