import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Aísla el almacenamiento de cada archivo de test en una carpeta temporal,
 * para que las pruebas no se pisen entre sí ni ensucien los datos reales.
 * Hay que llamarla ANTES de importar cualquier módulo del store.
 */
export function usarCarpetaTemporal() {
  process.env.CARPETA_DATOS = mkdtempSync(join(tmpdir(), 'pizzeria-test-'));
}
