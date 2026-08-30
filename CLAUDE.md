# Bot de WhatsApp — Pizzería Vikings

Contexto para retomar el proyecto en una sesión nueva. Si estás leyendo esto por
primera vez, empezá por acá y después mirá el `README.md`, que explica cómo se usa.

## Qué es

Bot que atiende el WhatsApp de la pizzería: responde solo las consultas
frecuentes y, cuando el cliente decide pedir, le toma el pedido y avisa al
cajero en un panel en tiempo real para que lo cargue en el sistema y lo cobre.

El local: **Pizzería Vikings**, San Martín 5096, Neuquén. Martes a domingo.
El dueño es Agustín (`aguscer` en GitHub).

## Cómo se corre

```bash
npm install
cp .env.example .env      # viene en modo prueba (WHATSAPP_PROVIDER=mock)
npm start
```

- Panel de caja: `localhost:3000/caja` — clave por defecto `caja1234`
- Simulador de cliente: `localhost:3000/simulador` — sólo existe en modo mock

`npm test` corre 51 pruebas con `node --test`. **Corrélas antes de dar por buena
cualquier modificación**: varias cubren casos de parsing que ya se rompieron una vez.

## Cómo está armado

```
src/
  server.js             webhook de WhatsApp + API del panel + eventos SSE
  salida.js             único punto de envío de mensajes al cliente
  bot/
    conversacion.js     máquina de estados de la charla (el cerebro)
    faq.js              elige la pregunta frecuente que corresponde
    pedido.js           interpreta el pedido en texto libre y calcula totales
    intenciones.js      detecta "quiero pedir", "hablar con alguien", "cancelar"
    catalogo.js         carga menú, negocio y FAQs; búsquedas por nombre y tamaño
  lib/texto.js          normalización y similitud (sin acentos, tolerante a typos)
  lib/horarios.js       abierto/cerrado, con turnos que cruzan la medianoche
  store/                pedidos, sesiones y avisos en archivos JSON (carpeta datos/)
  whatsapp/             proveedor Cloud API de Meta + proveedor simulado
public/                 panel de caja y simulador
```

### Convenciones

- **Todo el código está en español**: nombres de funciones, variables y comentarios.
  Mantenelo así, es lo que hace que Agustín pueda leerlo.
- **Sin dependencias más allá de Express.** El `.env` se lee a mano, la
  persistencia son archivos JSON, los eventos en vivo son SSE. Es deliberado:
  para una pizzería no hace falta más, y evita mantenimiento. No agregues
  librerías sin una razón concreta.
- Los datos del negocio viven en `src/data/*.json`, no en el código. Cambiar
  precios, horarios o respuestas no debería requerir tocar un `.js`.

### Decisiones que ya se tomaron

- **Proveedor de WhatsApp: Cloud API oficial de Meta.** Se descartó
  `whatsapp-web.js` por riesgo de bloqueo del número del local.
- **Al confirmar un pedido, el bot se calla en esa conversación** y la atiende
  una persona (`sesiones.pausarBot`). Es a propósito: evita que el bot pise al
  cajero mientras habla con el cliente.
- **Si el bot no entiende dos veces seguidas, deriva a una persona** en vez de
  seguir insistiendo.
- Los tamaños se leen del propio mensaje ("2 muzzarella 32"). Si no vienen, el
  bot los pregunta antes de poner un precio.

## Estado de los datos: qué es real y qué no

`src/data/negocio.json` y `menu.json` tienen una clave `_pendiente` que lista lo
que falta. **Es importante no confundir lo cargado con lo confirmado.**

Real, confirmado por el dueño:

- Nombre, dirección y teléfono (+54 9 299 412-8606).
- Martes a domingo de 20:00 a 00:30. Lunes cerrado.
- La carta: 20 pizzas a la piedra en Individual y 32 cm, con los precios del
  flyer oficial.

Todavía inventado, **no usar como referencia**:

- Zonas de reparto y costos de envío (Centro, Barrio Norte, Villa Sur).
- Pedido mínimo de delivery ($6.000).
- Medios de pago.
- Demoras estimadas.

Falta que el dueño pase:

- Precios de las pizzas de **42 cm** y **52 cm** (hay dos flyers más).
- Precio de la **Vasca en 32 cm**: en el flyer figura S/C. Hoy el bot la toma
  sin precio y la marca para que la caja lo confirme.

Tres cosas sin resolver, que cambian el comportamiento del bot:

1. El flyer dice "martes a domingo de 20 a 23 hs", el dueño dijo hasta 00:30.
   Está cargado 00:30. **Hay que confirmarlo.**
2. El flyer dice **"solo take away"**. Si las pizzas a la piedra no salen por
   delivery, el bot no debería ofrecerlo y sobra medio flujo de pedido.
3. Si venden bebidas, empanadas o postres, esas categorías no están cargadas.

## Integración con el sistema de la pizzería

Agustín ya tiene un sistema de gestión propio, andando en producción en la
notebook del local: `Documents\Pizza_vikings`. **Mismo stack que el bot**:
Node.js + Express + SQL.

Lo que se sabe de su estructura:

```
backend/server.js            Express
backend/db.js                conexión a la base
backend/middleware/auth.js   autenticación propia
backend/routes/pedidos.js    ← el punto de enganche
backend/routes/productos.js  ← la carta ya vive acá
backend/routes/imprimir.js   comanda por impresora térmica (escpos.js)
backend/routes/cierre.js     cierres de turno
```

### Plan acordado

1. **No cargar pedidos en el sistema sin que una persona confirme**, al menos al
   principio. El bot puede equivocarse interpretando un pedido, y uno mal
   cargado es plata y un cliente enojado.
2. El enganche natural es el botón **"Tomar pedido"** del panel de caja: el
   cajero mira la pantalla, ve que está bien, aprieta, y recién ahí el pedido se
   carga en el sistema y sale la comanda.
3. Técnicamente ya hay por dónde: `store/pedidos.js` emite `pedido:nuevo` y
   `pedido:actualizado` en el bus de `lib/bus.js`. La integración es un módulo
   nuevo que escuche esos eventos y llame a la API del sistema. **No hace falta
   reescribir nada.**
4. **La carta debería leerse desde `routes/productos.js` del sistema**, no del
   `menu.json` de acá. Hoy los precios están duplicados y se van a
   desincronizar el día que suban precios.

Para avanzar hace falta ver `routes/pedidos.js`, `server.js`, `middleware/auth.js`,
`routes/productos.js` y el esquema de las tablas de pedidos.

## Seguridad

- **`backend\.env` del sistema de la pizzería nunca va a GitHub**: tiene la
  contraseña de la base y las claves de sesión. Lo mismo con `backend\cierres\`,
  que son los cierres de caja reales del negocio.
- En este repo, `.env` y `datos/` están en el `.gitignore`. Que siga así.
- El panel de caja se protege con una clave simple. Si algún día queda expuesto
  a internet, hay que ponerlo detrás de HTTPS y cambiar la clave por defecto.
- El webhook valida la firma `X-Hub-Signature-256` de Meta cuando hay
  `WHATSAPP_APP_SECRET` configurado. En producción no es opcional.

## Cosas que ya se rompieron una vez

Contexto útil, porque son los lugares frágiles del proyecto:

- La cantidad se perdía cuando el pedido arrancaba con muletillas
  ("dale, quiero pedir 2 muzzarella" anotaba 1). Se resuelve descartando
  muletillas iniciales, cuidando de no romper nombres con números
  ("gaseosa 1.5"). Hay pruebas que lo cubren.
- El aviso de "estamos cerrados" usaba el reloj del sistema en vez de la hora
  del mensaje y llegó a contradecirse a sí mismo.
- El separador " y " no puede partir a ciegas: rompe "jamón y queso". Sólo corta
  cuando lo que sigue arranca con una cantidad.
