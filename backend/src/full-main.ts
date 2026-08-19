import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import cookieParser = require('cookie-parser');
import helmet = require('helmet');
import { AppModule } from './app.module';

/** Full application entrypoint for local, Docker and non-Vercel runtimes. */
async function bootstrap() {
  const startTime = Date.now();
  console.log(`[bootstrap] Starting full NestJS application... (${new Date().toISOString()})`);

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
    rawBody: true,
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const frontendUrl = configService.get<string>('FRONTEND_URL', 'http://localhost:5173');
  const dbUrl = configService.get<string>('DATABASE_URL', '');
  const dbHost = dbUrl ? new URL(dbUrl).host : 'unknown';
  console.log(`[bootstrap] Config: port=${port}, db=${dbHost}`);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.enableCors({
    origin: [frontendUrl, 'http://localhost:3000', 'http://localhost:5173'],
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
    .setDescription('Complete NBA sports betting analytics platform with genetic algorithms, ensemble models, and A/B testing')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  await app.listen(port);
  console.log(`[bootstrap] Full backend ready in ${Date.now() - startTime}ms`);
}

bootstrap().catch((err) => {
  console.error('[bootstrap] FATAL: Full application failed to start:', err);
  process.exit(1);
});
