import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/** Origens liberadas no CORS; o front local roda em 4200 por padrao. */
function corsOrigins(): string[] {
  return (process.env.CORS_ORIGINS ?? 'http://localhost:4200')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({ origin: corsOrigins(), credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // Uma mensagem por campo: sem isso um obrigatorio ausente devolve junto as
      // falhas de tipo e de tamanho, e o front exibe as tres.
      stopAtFirstError: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
