import { EventEmitter } from 'node:events';

/** Canal interno de eventos: la caja escucha acá lo que pasa en el bot. */
export const bus = new EventEmitter();
bus.setMaxListeners(50);
