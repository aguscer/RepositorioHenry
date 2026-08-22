import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const CARPETA = process.env.CARPETA_DATOS || join(process.cwd(), 'datos');

/**
 * Almacén mínimo en archivos JSON. Alcanza de sobra para una pizzería
 * y evita tener que instalar y administrar una base de datos.
 * Si el día de mañana crece, se reemplaza esta clase por SQLite/Postgres
 * sin tocar el resto del código.
 */
export class Coleccion {
  constructor(nombre, valorInicial) {
    this.archivo = join(CARPETA, `${nombre}.json`);
    this.datos = valorInicial;
    this.pendiente = null;
    this.cargar();
  }

  cargar() {
    try {
      if (existsSync(this.archivo)) {
        this.datos = JSON.parse(readFileSync(this.archivo, 'utf8'));
      }
    } catch (error) {
      console.error(`[db] no se pudo leer ${this.archivo}:`, error.message);
    }
  }

  /** Guarda en disco, agrupando escrituras seguidas para no castigar el FS. */
  guardar() {
    if (this.pendiente) return;
    this.pendiente = setTimeout(() => {
      this.pendiente = null;
      try {
        mkdirSync(CARPETA, { recursive: true });
        const temporal = `${this.archivo}.tmp`;
        writeFileSync(temporal, JSON.stringify(this.datos, null, 2));
        renameSync(temporal, this.archivo); // escritura atómica
      } catch (error) {
        console.error(`[db] no se pudo guardar ${this.archivo}:`, error.message);
      }
    }, 150);
    this.pendiente.unref?.();
  }

  /** Fuerza el guardado inmediato (se usa al apagar el proceso). */
  guardarYa() {
    if (this.pendiente) {
      clearTimeout(this.pendiente);
      this.pendiente = null;
    }
    try {
      mkdirSync(CARPETA, { recursive: true });
      writeFileSync(this.archivo, JSON.stringify(this.datos, null, 2));
    } catch (error) {
      console.error(`[db] no se pudo guardar ${this.archivo}:`, error.message);
    }
  }
}
