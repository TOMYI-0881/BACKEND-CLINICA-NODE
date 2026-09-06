import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  REDIS_URL: z.string().min(1, 'REDIS_URL es obligatoria'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET es obligatoria'),
  JWT_EXPIRES_IN: z.string().default('1d'),
  DISCORD_WEBHOOK_URL: z.string().optional().default(''),
  GITHUB_WEBHOOK_SECRET: z.string().optional().default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Origen(es) permitidos para CORS, separados por coma. '*' (default) refleja cualquier
  // origen -- seguro aca porque la API usa Bearer tokens, no cookies (no hay CSRF que mitigar).
  CORS_ORIGIN: z.string().default('*'),
  // Notificaciones por email (paciente notificado cuando se cancela su cita). Vacias =
  // no-op, mismo patron que DISCORD_WEBHOOK_URL: no rompe docker-compose up sin credenciales.
  EMAIL_USER: z.string().optional().default(''),
  EMAIL_PASSWORD: z.string().optional().default(''),
  EMAIL_FROM_NAME: z.string().optional().default('Clinica'),
  // Host/puerto SMTP opcionales -- si se omiten, se usa el shorthand 'gmail' de nodemailer.
  EMAIL_HOST: z.string().optional().default(''),
  // preprocess: EMAIL_PORT='' (valor por defecto en .env.template) coercería a 0 con
  // z.coerce.number() directo, y 0 no es .positive() -- se trata como "no seteado".
  EMAIL_PORT: z.preprocess(
    (val) => (val === '' || val === undefined ? undefined : val),
    z.coerce.number().int().positive().optional(),
  ),
  // Foto de perfil de medicos/pacientes (opcional, una sola por usuario). Directorio relativo
  // a la raiz del proyecto donde se guardan los archivos subidos; se sirve via /uploads
  // (express.static, ver app.ts).
  UPLOAD_DIR: z.string().optional().default('uploads'),
  MAX_PHOTO_SIZE_MB: z.coerce.number().int().positive().optional().default(2),
});

export type Env = Readonly<{
  port: number;
  databaseUrl: string;
  redisUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  discordWebhookUrl: string;
  githubWebhookSecret: string;
  logLevel: string;
  nodeEnv: 'development' | 'test' | 'production';
  corsOrigin: string;
  emailUser: string;
  emailPassword: string;
  emailFromName: string;
  emailHost: string;
  emailPort: number | undefined;
  uploadDir: string;
  maxPhotoSizeMb: number;
}>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Variables de entorno invalidas o faltantes:\n${details}`);
  }

  const data = parsed.data;

  return {
    port: data.PORT,
    databaseUrl: data.DATABASE_URL,
    redisUrl: data.REDIS_URL,
    jwtSecret: data.JWT_SECRET,
    jwtExpiresIn: data.JWT_EXPIRES_IN,
    discordWebhookUrl: data.DISCORD_WEBHOOK_URL,
    githubWebhookSecret: data.GITHUB_WEBHOOK_SECRET,
    logLevel: data.LOG_LEVEL,
    nodeEnv: data.NODE_ENV,
    corsOrigin: data.CORS_ORIGIN,
    emailUser: data.EMAIL_USER,
    emailPassword: data.EMAIL_PASSWORD,
    emailFromName: data.EMAIL_FROM_NAME,
    emailHost: data.EMAIL_HOST,
    emailPort: data.EMAIL_PORT,
    uploadDir: data.UPLOAD_DIR,
    maxPhotoSizeMb: data.MAX_PHOTO_SIZE_MB,
  };
}

export const env = loadEnv();
