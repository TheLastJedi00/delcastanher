/**
 * Mantém a política de CORS do bucket do Firebase Storage.
 *
 *   npm run storage:cors                      # acrescenta as origens declaradas
 *   npm run storage:cors -- https://x.app     # acrescenta também esta origem
 *   npm run storage:cors -- --show            # mostra a política atual
 *   npm run storage:cors -- --replace         # troca a lista pela declarada
 *
 * Por que isto existe: o upload da Spec 010 vai **do navegador direto para o
 * bucket** (decisão 3). Um bucket sem CORS aceita o `PUT` vindo do servidor e
 * recusa o mesmo `PUT` vindo de uma página — e o navegador esconde a resposta,
 * então o painel só mostra "não foi possível falar com o servidor".
 *
 * **O bucket é um só, compartilhado por todos os ambientes.** Não existe
 * "CORS de preview" e "CORS de produção": a política é global e a lista de
 * origens precisa ser a UNIÃO de tudo que legitimamente sobe arquivo. Por isso
 * o padrão aqui é **acrescentar**, e não substituir — rodar este script na
 * máquina de alguém não pode derrubar o painel publicado.
 *
 * A lista vem de `STORAGE_CORS_ORIGINS` quando declarada. Sem ela, cai nas
 * origens de `CORS_ORIGINS` mais o front local, que é o mínimo para o
 * desenvolvimento funcionar contra o bucket real.
 *
 * Vale lembrar que **CORS não é o controle de acesso aqui**: quem autoriza a
 * escrita é a assinatura da URL, emitida pela API só para uma sessão de
 * administrador. A política de CORS apenas diz de que páginas o navegador
 * aceita usar essa URL — acrescentar uma origem não afrouxa a segurança do
 * bucket, só permite que mais um front consuma a mesma URL assinada.
 */
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../src/app.module';
import { FirebaseService } from '../src/firebase/firebase.service';
import { storageBucket } from '../src/config/media.config';
import { corsOrigins } from '../src/config/cors.config';

/**
 * Somente o que o upload precisa. `GET`/`HEAD` ficam porque o download de
 * material também sai por URL assinada, e um download de outra origem passa
 * pelo mesmo portão.
 */
const METHODS = ['GET', 'HEAD', 'PUT', 'OPTIONS'];

/** Cabeçalhos que o navegador pode mandar no PUT assinado. */
const HEADERS = ['Content-Type', 'Content-Length', 'x-goog-resumable'];

/** Uma hora: o preflight não precisa se repetir a cada arquivo. */
const MAX_AGE_SECONDS = 3600;

/** Front local. Entra sempre, para o desenvolvimento não depender de deploy. */
const DEV_ORIGIN = 'http://localhost:4200';

interface CorsRule {
  origin?: string[];
  method?: string[];
  responseHeader?: string[];
  maxAgeSeconds?: number;
}

/** Origens declaradas para o bucket, já sem duplicata e em ordem estável. */
function declaredOrigins(config: ConfigService, extras: string[]): string[] {
  const declared = (config.get<string>('STORAGE_CORS_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const base = declared.length > 0 ? declared : [...corsOrigins(config), DEV_ORIGIN];

  return [...new Set([...base, ...extras])].sort();
}

/** Origens já presentes na política do bucket, de qualquer regra. */
function currentOrigins(rules: CorsRule[]): string[] {
  return [...new Set(rules.flatMap((rule) => rule.origin ?? []))];
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  try {
    const firebase = app.get(FirebaseService);
    const config = app.get(ConfigService);
    const bucket = firebase.storage.bucket(storageBucket(config));

    const args = process.argv.slice(2);
    const replace = args.includes('--replace');
    const extras = args.filter((arg) => !arg.startsWith('--'));

    const [metadata] = await bucket.getMetadata();
    const existing = (metadata.cors ?? []) as CorsRule[];

    if (args.includes('--show')) {
      console.log(JSON.stringify(existing, null, 2));

      return;
    }

    const declared = declaredOrigins(config, extras);
    const origin = replace ? declared : [...new Set([...currentOrigins(existing), ...declared])].sort();

    const added = origin.filter((value) => !currentOrigins(existing).includes(value));
    const removed = currentOrigins(existing).filter((value) => !origin.includes(value));

    await bucket.setCorsConfiguration([
      { origin, method: METHODS, responseHeader: HEADERS, maxAgeSeconds: MAX_AGE_SECONDS },
    ]);

    console.log(`Bucket: ${bucket.name}`);
    console.log(`Origens liberadas (${origin.length}):`);
    origin.forEach((value) => console.log(`  ${value}`));

    if (added.length > 0) {
      console.log(`\nAcrescentadas: ${added.join(', ')}`);
    }

    if (removed.length > 0) {
      console.log(`Removidas (--replace): ${removed.join(', ')}`);
    }

    if (added.length === 0 && removed.length === 0) {
      console.log('\nNada mudou: a política já estava correta.');
    }
  } finally {
    await app.close();
  }
}

main().catch((error: Error) => {
  console.error(`Falha ao configurar o CORS do bucket: ${error.message}`);
  process.exit(1);
});
