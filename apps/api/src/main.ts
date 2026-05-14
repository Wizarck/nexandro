// OTel SDK MUST initialize before any NestJS import — NestJS startup
// spans (module-init hooks) are emitted before AppModule resolves and are
// lost if the SDK initializes inside a provider's onModuleInit.
// See ADR-VISION-OTEL-PRE-BOOTSTRAP. Do NOT reorder this import.
import './otel-bootstrap';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global validation pipe — rejects bad input before it reaches any controller
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS — allow the Next.js frontend to talk to us
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  // Swagger / OpenAPI — MCP-ready documentation (ADR-002)
  const swaggerConfig = new DocumentBuilder()
    .setTitle('openTrattOS API')
    .setDescription(
      'The Open Source Back-of-House (BOH) & Kitchen Traceability OS. ' +
      'Every endpoint is designed to be wrapped as an MCP Tool for AI agents.',
    )
    .setVersion('0.1.0')
    .setLicense('AGPL-3.0', 'https://www.gnu.org/licenses/agpl-3.0.html')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`🍷 openTrattOS API running on http://localhost:${port}`);
  console.log(`📖 Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap();
