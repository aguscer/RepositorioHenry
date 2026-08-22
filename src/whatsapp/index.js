import { config } from '../config.js';
import * as cloud from './cloudApi.js';
import * as mock from './mock.js';

const proveedores = { cloud, mock };

export const whatsapp = proveedores[config.proveedor] || mock;

if (!proveedores[config.proveedor]) {
  console.warn(
    `[whatsapp] proveedor "${config.proveedor}" desconocido, se usa "mock". ` +
    'Valores válidos: cloud, mock.',
  );
}
