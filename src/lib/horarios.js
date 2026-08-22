const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const ETIQUETAS = {
  domingo: 'Domingo', lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles',
  jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado',
};
const MAPA_EN = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function aMinutos(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

/** Día de la semana y minuto del día, en la zona horaria del local. */
export function momentoLocal(fecha = new Date(), zona = 'America/Argentina/Buenos_Aires') {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(fecha);

  const buscar = (tipo) => partes.find((p) => p.type === tipo)?.value;
  const indiceDia = MAPA_EN[buscar('weekday')] ?? 0;
  const hora = Number(buscar('hour')) % 24;
  const minuto = Number(buscar('minute'));

  return { indiceDia, dia: DIAS[indiceDia], minutos: hora * 60 + minuto };
}

function rangosDe(negocio, indiceDia) {
  return negocio.horarios[DIAS[indiceDia]] || [];
}

/** ¿El local está abierto en este momento? */
export function estaAbierto(negocio, fecha = new Date()) {
  const { indiceDia, minutos } = momentoLocal(fecha, negocio.zonaHoraria);

  for (const [ini, fin] of rangosDe(negocio, indiceDia)) {
    const desde = aMinutos(ini);
    const hasta = aMinutos(fin);
    if (hasta > desde ? minutos >= desde && minutos < hasta : minutos >= desde) return true;
  }
  // turnos de ayer que cruzan la medianoche (ej: viernes 19:00 a 00:30)
  const ayer = (indiceDia + 6) % 7;
  for (const [ini, fin] of rangosDe(negocio, ayer)) {
    const desde = aMinutos(ini);
    const hasta = aMinutos(fin);
    if (hasta <= desde && minutos < hasta) return true;
  }
  return false;
}

/** Texto tipo "hoy a las 19:00" o "el sábado a las 12:00" con la próxima apertura. */
export function proximaApertura(negocio, fecha = new Date()) {
  const { indiceDia, minutos } = momentoLocal(fecha, negocio.zonaHoraria);

  for (let salto = 0; salto < 8; salto += 1) {
    const dia = (indiceDia + salto) % 7;
    const candidatos = rangosDe(negocio, dia)
      .map(([ini]) => aMinutos(ini))
      .filter((desde) => salto > 0 || desde > minutos)
      .sort((a, b) => a - b);

    if (candidatos.length) {
      const desde = candidatos[0];
      const hhmm = `${String(Math.floor(desde / 60)).padStart(2, '0')}:${String(desde % 60).padStart(2, '0')}`;
      if (salto === 0) return `hoy a las ${hhmm}`;
      if (salto === 1) return `mañana a las ${hhmm}`;
      return `el ${ETIQUETAS[DIAS[dia]].toLowerCase()} a las ${hhmm}`;
    }
  }
  return null;
}

/** Lista de horarios lista para mandar por WhatsApp. */
export function horariosEnTexto(negocio) {
  const orden = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
  return orden
    .map((dia) => {
      const rangos = negocio.horarios[dia];
      const detalle = rangos?.length
        ? rangos.map(([i, f]) => `${i} a ${f}`).join(' y ')
        : 'cerrado';
      return `• ${ETIQUETAS[dia]}: ${detalle}`;
    })
    .join('\n');
}

/** Frase corta sobre el estado actual, para pegar al final de una respuesta. */
export function estadoEnTexto(negocio, fecha = new Date()) {
  if (estaAbierto(negocio, fecha)) return '✅ Ahora estamos *abiertos*.';
  const proxima = proximaApertura(negocio, fecha);
  return proxima
    ? `🔴 Ahora estamos cerrados. Abrimos ${proxima}.`
    : '🔴 Ahora estamos cerrados.';
}

export { DIAS, ETIQUETAS };
