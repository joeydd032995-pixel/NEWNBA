import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import cookieParser = require('cookie-parser');
import helmet = require('helmet');
import { VercelCoreModule } from './vercel-core.module';

/**
 * Vercel entrypoint.
 *
 * Keep this file intentionally conventional: Vercel's zero-config NestJS
 * detector expects src/main.ts and a statically identifiable module passed to
 * NestFactory.create(). The complete non-Vercel application starts from
 * full-main.ts via nest-cli.json.
 */
async function bootstrap() {
  const startTime = Date.now();
  console.log(`[bootstrap] Starting Vercel core NestJS application... (${new Date().toISOString()})`);

  const app = await NestFactory.create(VercelCoreModule, {
    logger: ['error', 'warn', 'log', 'debug'],
    rawBody: true,
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const frontendUrl = configService.get<string>('FRONTEND_URL');
  const vercelProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : undefined;

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.enableCors({
    origin: [frontendUrl, vercelProductionUrl, 'http://localhost:3000', 'http://localhost:5173'].filter(Boolean) as string[],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('NBA Betting Analytics API')
    .setDescription('NBA betting analytics production core API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  await app.listen(port);
  console.log(`[bootstrap] Vercel core backend ready in ${Date.now() - startTime}ms`);
}

bootstrap().catch((err) => {
  console.error('[bootstrap] FATAL: Vercel core application failed to start:', err);
  process.exit(1);
});
