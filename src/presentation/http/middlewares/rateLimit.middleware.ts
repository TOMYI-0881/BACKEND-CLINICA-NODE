import rateLimit from 'express-rate-limit';

/**
 * Limite global aplicado a todo el prefijo /api: proteccion basica contra abuso
 * sin penalizar trafico legitimo.
 */
export const globalRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Limite estricto para /auth/login: previene fuerza bruta de credenciales.
 */
export const loginRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesion. Intenta nuevamente en un minuto.' },
});
