import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const production = (config.get<string>('NODE_ENV') ?? 'development') === 'production';
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

      const isAllowedOrigin = frontendUrls.includes(origin) || (!production && devTunnelOrigin.test(origin));
      return callback(null, isAllowedOrigin);
    },
    credentials: true,
  });
  app.use(helmet());
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const trustProxyHops = Number(config.get<string>('TRUST_PROXY_HOPS') ?? 0);
  if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) {
    app.getHttpAdapter().getInstance().set('trust proxy', trustProxyHops);
  }

  const port = Number(config.get<string>('PORT') ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT_INVALID');
  const server = await app.listen(port, '0.0.0.0');
  const requestTimeout = Number(config.get<string>('REQUEST_TIMEOUT_MS') ?? 30000);
  if (Number.isInteger(requestTimeout) && requestTimeout >= 1000 && requestTimeout <= 120000) {
    server.requestTimeout = requestTimeout;
  }
}

void bootstrap();
