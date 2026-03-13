import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const startTime = Date.now();
  console.log(`[bootstrap] Starting NestJS application... (${new Date().toISOString()})`);
  console.log(`[bootstrap] NODE_ENV=${process.env.NODE_ENV}, node=${process.version}`);

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });
  console.log(`[bootstrap] NestFactory.create completed in ${Date.now() - startTime}ms`);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const frontendUrl = configService.get<string>('FRONTEND_URL', 'http://localhost:5173');
  const dbUrl = configService.get<string>('DATABASE_URL', '');
  const dbHost = dbUrl ? new URL(dbUrl).host : 'unknown';
  console.log(`[bootstrap] Config: port=${port}, db=${dbHost}, redis=${configService.get('REDIS_HOST')}:${configService.get('REDIS_PORT')}`);

  // Security
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());

  // CORS
  app.enableCors({
    origin: [frontendUrl, 'http://localhost:3000', 'http://localhost:5173'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  });

  // Global prefix
  app.setGlobalPrefix('api');

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('NBA Betting Analytics API')
    .setDescription('Complete NBA sports betting analytics platform with genetic algorithms, ensemble models, and A/B testing')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(port);
  const totalMs = Date.now() - startTime;
  console.log(`🚀 Backend running at http://localhost:${port}/api (started in ${totalMs}ms)`);
  console.log(`📖 Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap().catch((err) => {
  console.error(`❌ [bootstrap] FATAL: Application failed to start:`, err);
  process.exit(1);
});
