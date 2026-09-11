/**
 * Aplica a politica de CORS do bucket do Firebase Storage.
 *
 *   npm run storage:cors            # aplica as origens de CORS_ORIGINS
 *   npm run storage:cors -- --show  # apenas mostra a politica atual
 *
 * Por que isto existe: o upload da Spec 010 vai **do navegador direto para o
 * bucket** (decisao 3). Um bucket sem CORS aceita o PUT vindo do servidor e
 * recusa o mesmo PUT vindo de uma pagina — e o navegador esconde a resposta,
 * entao o front so ve status 0 e exibe "nao foi possivel falar com o
 * servidor". Sem este passo o painel de upload nao funciona em nenhum
 * ambiente, por mais correto que esteja o codigo.
 *
 * As origens sao as mesmas do CORS da API (`CORS_ORIGINS`), porque quem sobe
 * arquivo e exatamente a pagina que fala com a API.
 */
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../src/app.module';
import { FirebaseService } from '../src/firebase/firebase.service';
import { storageBucket } from '../src/config/media.config';
import { corsOrigins } from '../src/config/cors.config';

/**
 * Somente o que o upload precisa. `GET`/`HEAD` ficam porque o download de
 * material tambem sai por URL assinada, e um `<a download>` de outra origem
 * passa pelo mesmo portao.
 */
const METHODS = ['GET', 'HEAD', 'PUT', 'OPTIONS'];

/** Cabecalhos que o navegador pode mandar no PUT assinado. */
const HEADERS = ['Content-Type', 'Content-Length', 'x-goog-resumable'];

/** Uma hora: o preflight nao precisa se repetir a cada arquivo. */
const MAX_AGE_SECONDS = 3600;

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  try {
    const firebase = app.get(FirebaseService);
    const config = app.get(ConfigService);
    const bucket = firebase.storage.bucket(storageBucket(config));

    if (process.argv.includes('--show')) {
      const [metadata] = await bucket.getMetadata();
      console.log(JSON.stringify(metadata.cors ?? [], null, 2));

      return;
    }

    const origin = corsOrigins(config);

    await bucket.setCorsConfiguration([
      { origin, method: METHODS, responseHeader: HEADERS, maxAgeSeconds: MAX_AGE_SECONDS },
    ]);

    console.log(`CORS aplicado em ${bucket.name} para: ${origin.join(', ')}`);
  } finally {
    await app.close();
  }
}

main().catch((error: Error) => {
  console.error(`Falha ao configurar o CORS do bucket: ${error.message}`);
  process.exit(1);
});
