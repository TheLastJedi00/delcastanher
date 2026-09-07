import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { corsOrigins } from './config/cors.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.enableCors({ origin: corsOrigins(config), credentials: true });
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

  await app.listen(config.get<string>('PORT') ?? 3000);
}
bootstrap();
