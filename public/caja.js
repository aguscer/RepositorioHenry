/* Panel de la caja: escucha los pedidos que arma el bot y permite responder. */

const $ = (selector) => document.querySelector(selector);

const estado = {
  pedidos: [],
  avisos: [],
  moneda: '$',
  filtro: 'activos',
  telefonoAbierto: null,
  sonido: localStorage.getItem('sonido') !== 'no',
};

const ETIQUETAS = {
  nuevo: 'Nuevo', tomado: 'Tomado', cargado: 'En cocina', cobrado: 'Cobrado', cancelado: 'Cancelado',
};

const plata = (valor) => `${estado.moneda} ${Number(valor || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
const hora = (ms) => new Date(ms).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
const escapar = (texto) => String(texto ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ── Alerta sonora ───────────────────────────────────────────────────────── */
let audio;
function sonar() {
  if (!estado.sonido) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    [0, 0.18, 0.36].forEach((retraso, i) => {
      const osc = audio.createOscillator();
      const vol = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = [880, 1180, 1480][i];
      vol.gain.setValueAtTime(0.0001, audio.currentTime + retraso);
      vol.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + retraso + 0.02);
      vol.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + retraso + 0.16);
      osc.connect(vol).connect(audio.destination);
      osc.start(audio.currentTime + retraso);
      osc.stop(audio.currentTime + retraso + 0.18);
    });
  } catch { /* si el navegador bloquea el audio, seguimos sin sonido */ }
}

/* ── API ─────────────────────────────────────────────────────────────────── */
async function api(ruta, opciones = {}) {
  const respuesta = await fetch(ruta, {
    headers: { 'Content-Type': 'application/json' },
    ...opciones,
    body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
  });
  if (respuesta.status === 401) { mostrarIngreso(); throw new Error('No autorizado'); }
  if (!respuesta.ok) throw new Error((await respuesta.json().catch(() => ({}))).error || 'Error');
  return respuesta.json();
}

/* ── Render ──────────────────────────────────────────────────────────────── */
function pedidosVisibles() {
  if (estado.filtro === 'nuevo') return estado.pedidos.filter((p) => p.estado === 'nuevo');
  if (estado.filtro === 'todos') return estado.pedidos;
  return estado.pedidos.filter((p) => ['nuevo', 'tomado', 'cargado'].includes(p.estado));
}

function tarjetaPedido(pedido) {
  const items = (pedido.items || [])
    .map((i) => `<div><span>${i.cantidad} × ${escapar(i.nombre)}</span><span>${plata(i.precioUnitario * i.cantidad)}</span></div>`)
    .join('');

  const datos = [];
  datos.push(`<span class="dato">${pedido.modalidad === 'delivery' ? '🛵 Delivery' : '🏠 Retira'}</span>`);
  if (pedido.direccion) datos.push(`<span class="dato">📍 ${escapar(pedido.direccion)}</span>`);
  if (pedido.pago) datos.push(`<span class="dato">💳 ${escapar(pedido.pago)}</span>`);
  if (pedido.modalidad === 'delivery' && !pedido.zona) datos.push('<span class="dato alerta">⚠️ Zona sin confirmar</span>');
  if (pedido.localAbierto === false) datos.push('<span class="dato alerta">⚠️ Entró con el local cerrado</span>');
  if (pedido.notasCaja) datos.push(`<span class="dato">📝 ${escapar(pedido.notasCaja)}</span>`);

  const cerrado = ['cobrado', 'cancelado'].includes(pedido.estado);
  const botones = cerrado ? '' : `
    <div class="botones">
      ${pedido.estado === 'nuevo' ? `<button class="principal" data-accion="tomado" data-id="${pedido.id}">Tomar pedido</button>` : ''}
      ${pedido.estado === 'tomado' ? `<button class="principal" data-accion="cargado" data-id="${pedido.id}">Cargado en el sistema</button>` : ''}
      ${pedido.estado === 'cargado' ? `<button class="ok" data-accion="cobrado" data-id="${pedido.id}">Cobrado</button>` : ''}
      <button data-chat="${escapar(pedido.telefono)}" data-nombre="${escapar(pedido.nombre)}">💬 Chat</button>
      <button class="peligro" data-accion="cancelado" data-id="${pedido.id}">Cancelar</button>
    </div>`;

  return `
    <article class="tarjeta ${pedido.estado}">
      <div class="cabecera">
        <div>
          <div class="codigo">#${escapar(pedido.codigo)}</div>
          <div class="cliente">${escapar(pedido.nombre)} · ${escapar(pedido.telefono)} · ${hora(pedido.creadoEn)}${pedido.atendidoPor ? ` · ${escapar(pedido.atendidoPor)}` : ''}</div>
        </div>
        <span class="estado-tag">${ETIQUETAS[pedido.estado] || pedido.estado}</span>
      </div>
      <div class="items">${items}</div>
      <div class="datos">${datos.join('')}</div>
      <div class="total"><span>Total${pedido.envio ? ` (envío ${plata(pedido.envio)})` : ''}</span><span>${plata(pedido.total)}</span></div>
      ${botones}
    </article>`;
}

function tarjetaAviso(aviso) {
  return `
    <article class="tarjeta ${aviso.estado === 'abierto' ? 'nuevo' : 'cobrado'}">
      <div class="cabecera">
        <div>
          <div class="codigo" style="font-size:15px">${escapar(aviso.nombre || 'Cliente')}</div>
          <div class="cliente">${escapar(aviso.telefono)} · ${hora(aviso.creadoEn)}</div>
        </div>
        <span class="estado-tag">${aviso.estado === 'abierto' ? 'A responder' : 'Cerrado'}</span>
      </div>
      <div class="items"><div><span>${escapar(aviso.motivo)}</span></div></div>
      ${aviso.mensaje ? `<div class="datos"><span class="dato">💬 “${escapar(aviso.mensaje)}”</span></div>` : ''}
      <div class="botones">
        <button data-chat="${escapar(aviso.telefono)}" data-nombre="${escapar(aviso.nombre)}">💬 Responder</button>
        ${aviso.estado === 'abierto' ? `<button data-cerrar-aviso="${aviso.id}">Marcar atendido</button>` : ''}
      </div>
    </article>`;
}

function pintar() {
  const pedidos = pedidosVisibles();
  $('#listaPedidos').innerHTML = pedidos.length
    ? pedidos.map(tarjetaPedido).join('')
    : '<div class="vacio">Sin pedidos por ahora. Cuando un cliente confirme por WhatsApp, aparece acá y suena la alerta.</div>';

  const avisos = estado.avisos.filter((a) => a.estado === 'abierto');
  $('#listaAvisos').innerHTML = avisos.length
    ? avisos.map(tarjetaAviso).join('')
    : '<div class="vacio">Ninguna consulta pendiente. El bot está respondiendo solo.</div>';

  const pendientes = estado.pedidos.filter((p) => ['nuevo', 'tomado'].includes(p.estado)).length;
  document.title = pendientes ? `(${pendientes}) Caja · Pedidos` : 'Caja · Pedidos';
}

function pintarResumen(resumen) {
  $('#mPendientes').textContent = resumen.pendientes;
  $('#mTotal').textContent = resumen.total;
  $('#mCobrados').textContent = resumen.cobrados;
  $('#mFacturado').textContent = plata(resumen.facturado);
}

/* ── Datos en vivo ───────────────────────────────────────────────────────── */
function guardarPedido(pedido) {
  const indice = estado.pedidos.findIndex((p) => p.id === pedido.id);
  if (indice >= 0) estado.pedidos[indice] = pedido;
  else estado.pedidos.unshift(pedido);
}

async function cargar() {
  const datos = await api('/api/caja/estado');
  estado.pedidos = datos.pedidos;
  estado.avisos = datos.avisos;
  estado.moneda = datos.negocio.moneda || '$';
  $('#nombreNegocio').textContent = `${datos.negocio.nombre} · ${datos.proveedor === 'mock' ? 'modo prueba' : 'WhatsApp'}`;
  pintarResumen(datos.resumen);
  pintar();
}

function conectar() {
  const flujo = new EventSource('/api/caja/eventos');

  flujo.onopen = () => {
    $('#conexion').textContent = '● En vivo';
    $('#conexion').className = 'chip on';
  };
  flujo.onerror = () => {
    $('#conexion').textContent = '● Reconectando…';
    $('#conexion').className = 'chip off';
  };

  flujo.addEventListener('pedido-nuevo', (evento) => {
    guardarPedido(JSON.parse(evento.data));
    sonar();
    pintar();
    api('/api/caja/estado').then((d) => pintarResumen(d.resumen)).catch(() => {});
  });

  flujo.addEventListener('pedido-actualizado', (evento) => {
    guardarPedido(JSON.parse(evento.data));
    pintar();
    api('/api/caja/estado').then((d) => pintarResumen(d.resumen)).catch(() => {});
  });

  flujo.addEventListener('aviso-nuevo', (evento) => {
    estado.avisos.unshift(JSON.parse(evento.data));
    sonar();
    pintar();
  });

  flujo.addEventListener('aviso-actualizado', (evento) => {
    const aviso = JSON.parse(evento.data);
    const indice = estado.avisos.findIndex((a) => a.id === aviso.id);
    if (indice >= 0) estado.avisos[indice] = aviso;
    pintar();
  });

  flujo.addEventListener('mensaje', (evento) => {
    const mensaje = JSON.parse(evento.data);
    if (mensaje.telefono === estado.telefonoAbierto) abrirChat(estado.telefonoAbierto);
  });
}

/* ── Conversación ────────────────────────────────────────────────────────── */
async function abrirChat(telefono, nombre = '') {
  estado.telefonoAbierto = telefono;
  const datos = await api(`/api/caja/conversacion/${encodeURIComponent(telefono)}`);

  $('#cajonNombre').textContent = datos.nombre || nombre || 'Cliente';
  $('#cajonTelefono').textContent = telefono;
  $('#btnBot').textContent = datos.botEnPausa ? '🤖 bot pausado' : '🤖 bot activo';
  $('#btnBot').className = `chip ${datos.botEnPausa ? 'off' : 'on'}`;

  $('#charla').innerHTML = datos.historial
    .map((m) => `<div class="burbuja ${m.quien}"><span class="quien">${m.quien} · ${hora(m.en)}</span>${escapar(m.texto)}</div>`)
    .join('');

  $('#cajon').classList.add('abierto');
  $('#charla').scrollTop = $('#charla').scrollHeight;
}

/* ── Eventos de la interfaz ──────────────────────────────────────────────── */
document.addEventListener('click', async (evento) => {
  const boton = evento.target.closest('button');
  if (!boton) return;

  if (boton.dataset.accion) {
    const { accion, id } = boton.dataset;
    if (accion === 'cancelado' && !confirm('¿Cancelar el pedido y avisarle al cliente?')) return;
    boton.disabled = true;
    try {
      await api(`/api/caja/pedidos/${id}/estado`, {
        method: 'POST',
        cuerpo: { estado: accion, avisar: true },
      });
    } catch (error) {
      alert(error.message);
      boton.disabled = false;
    }
    return;
  }

  if (boton.dataset.chat) {
    await abrirChat(boton.dataset.chat, boton.dataset.nombre);
    return;
  }

  if (boton.dataset.cerrarAviso) {
    await api(`/api/caja/avisos/${boton.dataset.cerrarAviso}/cerrar`, { method: 'POST', cuerpo: {} });
    return;
  }

  if (boton.dataset.filtro) {
    estado.filtro = boton.dataset.filtro;
    document.querySelectorAll('#filtros button').forEach((b) => b.classList.toggle('activo', b === boton));
    pintar();
  }
});

$('#btnCerrarCajon').addEventListener('click', () => {
  $('#cajon').classList.remove('abierto');
  estado.telefonoAbierto = null;
});

$('#btnEnviar').addEventListener('click', async () => {
  const texto = $('#mensaje').value.trim();
  if (!texto || !estado.telefonoAbierto) return;
  $('#btnEnviar').disabled = true;
  try {
    await api('/api/caja/mensaje', { method: 'POST', cuerpo: { telefono: estado.telefonoAbierto, texto } });
    $('#mensaje').value = '';
    await abrirChat(estado.telefonoAbierto);
  } catch (error) {
    alert(`No se pudo enviar: ${error.message}`);
  }
  $('#btnEnviar').disabled = false;
});

$('#mensaje').addEventListener('keydown', (evento) => {
  if (evento.key === 'Enter' && !evento.shiftKey) {
    evento.preventDefault();
    $('#btnEnviar').click();
  }
});

$('#btnBot').addEventListener('click', async () => {
  if (!estado.telefonoAbierto) return;
  const pausado = $('#btnBot').classList.contains('off');
  await api(`/api/caja/conversacion/${encodeURIComponent(estado.telefonoAbierto)}/bot`, {
    method: 'POST',
    cuerpo: { activar: pausado },
  });
  await abrirChat(estado.telefonoAbierto);
});

$('#btnSonido').addEventListener('click', () => {
  estado.sonido = !estado.sonido;
  localStorage.setItem('sonido', estado.sonido ? 'si' : 'no');
  $('#btnSonido').textContent = estado.sonido ? '🔔 Sonido' : '🔕 Silencio';
  if (estado.sonido) sonar();
});

/* ── Ingreso ─────────────────────────────────────────────────────────────── */
function mostrarIngreso() {
  $('#ingreso').classList.remove('oculto');
  $('#tablero').classList.add('oculto');
}

function mostrarTablero() {
  $('#ingreso').classList.add('oculto');
  $('#tablero').classList.remove('oculto');
  $('#btnSonido').textContent = estado.sonido ? '🔔 Sonido' : '🔕 Silencio';
  cargar().then(conectar).catch(() => {});
}

$('#formIngreso').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  $('#errorIngreso').textContent = '';
  const respuesta = await fetch('/api/caja/ingresar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clave: $('#clave').value }),
  });
  if (!respuesta.ok) {
    $('#errorIngreso').textContent = 'Clave incorrecta';
    return;
  }
  mostrarTablero();
});

// Si ya hay cookie válida entramos directo.
fetch('/api/caja/estado').then((r) => (r.ok ? mostrarTablero() : mostrarIngreso()));
