import pino from 'pino';
import { env } from './env';

/** Logger estructurado (JSON) unico de toda la app, nivel configurable via LOG_LEVEL. */
export const logger = pino({
  level: env.logLevel,
  base: { service: 'backend-clinica' },
});
