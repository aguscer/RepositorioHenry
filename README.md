# 🍕 Bot de WhatsApp para pizzería

Atiende solo las consultas frecuentes que llegan por WhatsApp (horarios, carta,
envíos, medios de pago, promos) y, cuando el cliente decide pedir, le toma el
pedido y **le avisa al cajero en una pantalla que suena**, con todo el detalle
listo para cargarlo en el sistema del local y cobrarlo.

```
Cliente por WhatsApp ──► Webhook ──► Bot ──┬─► responde la consulta al instante
                                           │
                                           └─► arma el pedido ──► 🔔 Panel de caja
                                                                   (cargar y cobrar)
```

## Qué hace

**El bot, solo:**
- Responde las preguntas frecuentes (`src/data/faqs.json`), con horarios que se
  calculan de verdad: sabe si el local está abierto ahora y a qué hora abre.
- Muestra la carta con los precios de cada tamaño desde `src/data/menu.json`, y explica qué lleva cada pizza si le preguntás por una.
- Toma el pedido en lenguaje natural: entiende *"2 muzzarella 32"*,
  *"una vikinga individual"*, *"3 fugazza 32 y una chancha individual"*.
- Si no le dicen el tamaño, lo pregunta antes de poner un precio.
- Pregunta delivery o retiro, dirección, nombre y medio de pago; calcula el
  envío según la zona y avisa si no llega al mínimo.
- Muestra el resumen con el total y pide confirmación.

**Cuando el cliente confirma:**
- Se crea el pedido con un código corto (ej. `2208-007`).
- Suena la alerta en el panel de caja y aparece la tarjeta con todo el detalle.
- **El bot se calla en esa conversación**, así el cajero atiende sin que el bot
  le pise la charla.

**El cajero, desde el panel:**
- Ve los pedidos en vivo y los avanza: *Tomar → Cargado en el sistema → Cobrado*.
- En cada paso puede avisarle automáticamente al cliente por WhatsApp.
- Abre el chat, lee toda la conversación y responde a mano.
- Ve las consultas que el bot no supo resolver o en las que el cliente pidió
  hablar con una persona.
- Tiene el resumen del día: pedidos, pendientes, cobrados y facturado.

## Probarlo ahora (sin cuenta de WhatsApp)

```bash
npm install
cp .env.example .env      # viene con WHATSAPP_PROVIDER=mock
npm start
```

- Panel de caja: <http://localhost:3000/caja> (clave por defecto: `caja1234`)
- Simulador de cliente: <http://localhost:3000/simulador>

Abrí las dos pantallas una al lado de la otra: escribí como cliente en el
simulador y mirá cómo cae el pedido en la caja.

## Conectarlo al WhatsApp real

Se usa la **WhatsApp Cloud API oficial de Meta**. Es la opción recomendada para
un negocio: el número queda a nombre de la pizzería, no hay riesgo de bloqueo y
las conversaciones que inicia el cliente no tienen costo por mensaje.

1. Creá una app en <https://developers.facebook.com> y agregale el producto
   **WhatsApp**.
2. Anotá el **Token de acceso** y el **Phone number ID**.
3. Completá el `.env`:

   ```ini
   WHATSAPP_PROVIDER=cloud
   WHATSAPP_TOKEN=EAAG...
   WHATSAPP_PHONE_NUMBER_ID=123456789
   WHATSAPP_VERIFY_TOKEN=algo-secreto-que-inventás
   WHATSAPP_APP_SECRET=el-app-secret-de-tu-app
   ```

4. Publicá el servidor con HTTPS (un VPS con Nginx, Railway, Render, Fly.io o
   `ngrok http 3000` para probar).
5. En Meta → WhatsApp → Configuración → Webhook:
   - URL: `https://tu-dominio/webhook`
   - Token de verificación: el mismo `WHATSAPP_VERIFY_TOKEN`
   - Suscribite al campo **messages**.
6. Para producción hay que verificar el negocio en Meta Business y pasar el
   número a producción. Con el número de prueba se puede probar todo antes.

> `WHATSAPP_APP_SECRET` no es opcional en producción: con eso se valida la firma
> de cada webhook y se descartan los pedidos falsos.

## Adaptarlo a tu pizzería

Casi todo se cambia editando JSON, sin tocar código:

| Archivo | Qué configura |
|---|---|
| `src/data/negocio.json` | Nombre, dirección, teléfono, horarios, zonas de envío y costos, mínimo de delivery, medios de pago, demoras |
| `src/data/menu.json` | Tamaños, productos, precio por tamaño, alias (cómo los escribe la gente) y promos |
| `src/data/faqs.json` | Preguntas frecuentes: palabras clave y respuesta |

En las respuestas de las FAQs se pueden usar marcadores que se completan solos:
`{{nombre}}`, `{{direccion}}`, `{{telefono}}`, `{{horarios}}`, `{{estadoActual}}`,
`{{menu}}`, `{{promos}}`, `{{zonas}}`, `{{mediosPago}}`, `{{minimoDelivery}}`,
`{{demoraMostrador}}`, `{{demoraDelivery}}`, `{{vegetarianas}}`.

Los **alias** del menú son importantes: cuantos más pongas (`muza`, `napo`,
`birra`), mejor entiende el bot lo que le escriben.

## Cómo está armado

```
src/
  index.js              arranque del servidor
  server.js             webhook de WhatsApp + API del panel + eventos en vivo (SSE)
  config.js             lectura del .env
  salida.js             único punto de envío de mensajes al cliente
  bot/
    conversacion.js     máquina de estados de la charla (el cerebro)
    faq.js              busca la pregunta frecuente que corresponde
    pedido.js           interpreta el pedido en texto libre y calcula totales
    intenciones.js      detecta "quiero pedir", "hablar con alguien", "cancelar"
    catalogo.js         carga menú, negocio y FAQs
    plantillas.js       completa los {{marcadores}} de las respuestas
  lib/
    texto.js            normalización y comparación de textos (sin acentos)
    horarios.js         abierto/cerrado, incluso con turnos que cruzan la medianoche
    formato.js          precios y códigos de pedido
  store/                pedidos, sesiones y avisos (archivos JSON en ./datos)
  whatsapp/
    cloudApi.js         proveedor oficial de Meta
    mock.js             simulador para desarrollo
public/                 panel de caja y simulador
tests/                  51 pruebas automáticas
```

Los datos se guardan en archivos JSON dentro de `datos/` (se crea solo). Para
una pizzería alcanza de sobra; si algún día crece, se reemplaza `src/store/db.js`
por SQLite sin tocar el resto.

## Comandos

```bash
npm start     # arranca el servidor
npm run dev   # arranca con recarga automática
npm test      # corre las pruebas
```

## Seguridad

- El panel pide clave (`PANEL_CLAVE`). Si lo vas a exponer a internet, ponelo
  detrás de HTTPS y cambiá la clave por defecto.
- El webhook valida la firma `X-Hub-Signature-256` de Meta.
- El `.env` y la carpeta `datos/` no se suben al repositorio.

## Ideas para más adelante

- Botones interactivos de WhatsApp en vez de texto (ya está `enviarBotones`).
- Integración directa con el sistema de facturación del local.
- Link de pago de Mercado Pago para cobrar antes de que salga el pedido.
- Reportes por día y por producto.
