import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const frontendUrls = (config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
  const devTunnelOrigin = /^https:\/\/[\w.-]+\.devtunnels\.ms$/i;

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) {
        return callback(null, true);
      }

      const isAllowedOrigin = frontendUrls.includes(origin) || devTunnelOrigin.test(origin);
      return callback(null, isAllowedOrigin);
    },
    credentials: true,
  });
  app.use(helmet());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
}

void bootstrap();
