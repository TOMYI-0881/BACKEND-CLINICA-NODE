import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './env';

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Backend Sistema de Reservas Clinicas',
      version: '1.0.0',
      description: 'API de reservas de turnos medicos y cola de espera en vivo.',
    },
    servers: [{ url: `http://localhost:${env.port}/api` }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
  },
  apis: ['src/presentation/http/routes/*.ts', 'dist/presentation/http/routes/*.js'],
});

export { swaggerSpec };
