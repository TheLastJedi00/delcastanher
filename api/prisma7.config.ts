import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Configuracao do Prisma CLI. A `DATABASE_URL` do Neon e a conexao "pooled"
 * (pgbouncer), otima para a aplicacao mas incompativel com o statement cache
 * usado pelas migrations — por isso as migrations usam a conexao direta
 * (`DATABASE_URL_UNPOOLED`) quando ela existe.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
    directUrl: process.env['DATABASE_URL_UNPOOLED'] ?? process.env['DATABASE_URL'],
    shadowDatabaseUrl: process.env['SHADOW_DATABASE_URL'],
  },
});
