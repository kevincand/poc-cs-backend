import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

import filtersRoutes from './routes/filters.routes';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();
  
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.use('/filters', filtersRoutes);

  await app.listen(3000);
}

bootstrap();