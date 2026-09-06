// Corre antes de cualquier import de la app: evita que pino-http y el logger
// estructurado ensucien la salida de `npm test` (los tests ya verifican
// comportamiento, no necesitan ver cada request/error logueado).
process.env.LOG_LEVEL = 'silent';
