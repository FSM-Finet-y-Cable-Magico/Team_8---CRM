import { ConfigService } from '@nestjs/config';
import { AddressInfo } from 'node:net';
import { createServer } from 'node:net';
import { MailService } from './mail.service';

describe('MailService', () => {
  it('informa que SMTP no esta configurado sin intentar enviar', async () => {
    const config = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    const service = new MailService(config);

    await expect(
      service.sendQuote({
        to: 'cliente@example.com',
        prospectName: 'Cliente Demo',
        companyName: 'FiNet',
        pdf: Buffer.from('pdf'),
        filename: 'cotizacion.pdf',
      }),
    ).resolves.toEqual({ status: 'not_configured' });
  });

  it('envia la cotizacion como adjunto mediante SMTP', async () => {
    let receivedMessage = '';
    const server = createServer((socket) => {
      let buffer = '';
      let readingData = false;
      socket.write('220 smtp.test ESMTP\r\n');
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        let lineEnd = buffer.indexOf('\n');

        while (lineEnd >= 0) {
          const line = buffer.slice(0, lineEnd).replace(/\r$/, '');
          buffer = buffer.slice(lineEnd + 1);

          if (readingData) {
            if (line === '.') {
              readingData = false;
              socket.write('250 2.0.0 accepted\r\n');
            } else {
              receivedMessage += `${line}\n`;
            }
          } else if (line.startsWith('EHLO')) {
            socket.write('250-smtp.test\r\n250 SIZE 10000000\r\n');
          } else if (line.startsWith('MAIL FROM') || line.startsWith('RCPT TO')) {
            socket.write('250 2.1.0 ok\r\n');
          } else if (line === 'DATA') {
            readingData = true;
            socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
          } else if (line === 'QUIT') {
            socket.write('221 2.0.0 bye\r\n');
            socket.end();
          }

          lineEnd = buffer.indexOf('\n');
        }
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const values: Record<string, string> = {
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(port),
      SMTP_STARTTLS: 'false',
      SMTP_FROM: 'cotizaciones@finet.local',
      SMTP_FROM_NAME: 'CRM FiNet',
    };
    const config = { get: jest.fn((name: string) => values[name]) } as unknown as ConfigService;
    const service = new MailService(config);

    try {
      await expect(
        service.sendQuote({
          to: 'cliente@example.com',
          prospectName: 'Cliente Demo',
          companyName: 'FiNet',
          pdf: Buffer.from('%PDF-demo'),
          filename: 'cotizacion-10.pdf',
        }),
      ).resolves.toEqual({ status: 'sent' });
      expect(receivedMessage).toContain('To: cliente@example.com');
      expect(receivedMessage).toContain('Content-Type: application/pdf');
      expect(receivedMessage).toContain('filename="cotizacion-10.pdf"');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });
});
