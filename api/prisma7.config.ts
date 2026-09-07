import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Configuracao do Prisma CLI (migrations e generate). A `DATABASE_URL` do Neon
 * passa pelo pgbouncer; quando a conexao direta (`DATABASE_URL_UNPOOLED`)
 * existe, e ela que atende as migrations, que precisam de sessao dedicada.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL_UNPOOLED'] ?? process.env['DATABASE_URL'],
  },
});
