import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Socket, createConnection } from 'node:net';
import { TLSSocket, connect as connectTls } from 'node:tls';

type SmtpSocket = Socket | TLSSocket;

type SmtpResponse = {
  code: number;
  lines: string[];
};

export type QuoteEmail = {
  to: string;
  prospectName: string;
  companyName: string;
  pdf: Buffer;
  filename: string;
};

export type MailDeliveryResult = {
  status: 'sent' | 'not_configured';
};

class SmtpResponseReader {
  private buffer = '';
  private currentLines: string[] = [];
  private responses: SmtpResponse[] = [];
  private waiters: Array<{ resolve: (response: SmtpResponse) => void; reject: (error: Error) => void }> = [];

  private readonly onData = (chunk: Buffer) => {
    this.buffer += chunk.toString('utf8');
    this.flushLines();
  };

  private readonly onError = (error: Error) => {
    this.rejectWaiters(error);
  };

  private readonly onClose = () => {
    this.rejectWaiters(new Error('El servidor SMTP cerro la conexion'));
  };

  constructor(private readonly socket: SmtpSocket) {
    socket.on('data', this.onData);
    socket.on('error', this.onError);
    socket.on('close', this.onClose);
  }

  next() {
    const response = this.responses.shift();

    if (response) {
      return Promise.resolve(response);
    }

    return new Promise<SmtpResponse>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  detach() {
    this.socket.off('data', this.onData);
    this.socket.off('error', this.onError);
    this.socket.off('close', this.onClose);
  }

  private flushLines() {
    let newlineIndex = this.buffer.indexOf('\n');

    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex).replace(/\r$/, '');
      this.buffer = this.buffer.slice(newlineIndex + 1);
      this.consumeLine(line);
      newlineIndex = this.buffer.indexOf('\n');
    }
  }

  private consumeLine(line: string) {
    this.currentLines.push(line);
    const match = /^(\d{3})([ -])/.exec(line);

    if (!match || match[2] !== ' ') {
      return;
    }

    const response = {
      code: Number(match[1]),
      lines: this.currentLines,
    };
    this.currentLines = [];
    const waiter = this.waiters.shift();

    if (waiter) {
      waiter.resolve(response);
    } else {
      this.responses.push(response);
    }
  }

  private rejectWaiters(error: Error) {
    const waiters = this.waiters.splice(0);
    waiters.forEach((waiter) => waiter.reject(error));
  }
}

@Injectable()
export class MailService {
  constructor(private readonly config: ConfigService) {}

  async sendQuote(message: QuoteEmail): Promise<MailDeliveryResult> {
    const host = this.value('SMTP_HOST');
    const from = this.value('SMTP_FROM') ?? this.value('SMTP_USER');

    if (!host || !from) {
      return { status: 'not_configured' };
    }

    const secure = this.booleanValue('SMTP_SECURE', false);
    const startTls = this.booleanValue('SMTP_STARTTLS', !secure);
    const port = this.numberValue('SMTP_PORT', secure ? 465 : 587);
    const rejectUnauthorized = this.booleanValue('SMTP_REJECT_UNAUTHORIZED', true);
    const user = this.value('SMTP_USER');
    const password = this.value('SMTP_PASSWORD');

    if (Boolean(user) !== Boolean(password)) {
      throw new Error('SMTP_USER y SMTP_PASSWORD deben configurarse juntos');
    }

    let socket = secure
      ? await this.openTls(host, port, rejectUnauthorized)
      : await this.openPlain(host, port);
    let reader = new SmtpResponseReader(socket);

    try {
      this.expect(await reader.next(), [220]);
      await this.command(socket, reader, `EHLO ${this.value('SMTP_HELO') ?? 'crm-finet.local'}`, [250]);

      if (startTls && !secure) {
        await this.command(socket, reader, 'STARTTLS', [220]);
        reader.detach();
        socket = await this.upgradeTls(socket, host, rejectUnauthorized);
        reader = new SmtpResponseReader(socket);
        await this.command(socket, reader, `EHLO ${this.value('SMTP_HELO') ?? 'crm-finet.local'}`, [250]);
      }

      if (user && password) {
        await this.command(socket, reader, 'AUTH LOGIN', [334]);
        await this.command(socket, reader, Buffer.from(user).toString('base64'), [334]);
        await this.command(socket, reader, Buffer.from(password).toString('base64'), [235]);
      }

      await this.command(socket, reader, `MAIL FROM:<${this.headerValue(from)}>`, [250]);
      await this.command(socket, reader, `RCPT TO:<${this.headerValue(message.to)}>`, [250, 251]);
      await this.command(socket, reader, 'DATA', [354]);
      socket.write(`${this.buildMessage(message, from)}\r\n.\r\n`);
      this.expect(await reader.next(), [250]);
      await this.command(socket, reader, 'QUIT', [221]);

      return { status: 'sent' };
    } finally {
      reader.detach();
      socket.end();
    }
  }

  private async command(socket: SmtpSocket, reader: SmtpResponseReader, command: string, expected: number[]) {
    socket.write(`${command}\r\n`);
    this.expect(await reader.next(), expected);
  }

  private expect(response: SmtpResponse, expected: number[]) {
    if (!expected.includes(response.code)) {
      throw new Error(`Respuesta SMTP inesperada: ${response.lines.join(' | ')}`);
    }
  }

  private openPlain(host: string, port: number) {
    return new Promise<Socket>((resolve, reject) => {
      const socket = createConnection({ host, port });
      socket.once('connect', () => resolve(socket));
      socket.once('error', reject);
    });
  }

  private openTls(host: string, port: number, rejectUnauthorized: boolean) {
    return new Promise<TLSSocket>((resolve, reject) => {
      const socket = connectTls({ host, port, servername: host, rejectUnauthorized });
      socket.once('secureConnect', () => resolve(socket));
      socket.once('error', reject);
    });
  }

  private upgradeTls(socket: Socket, host: string, rejectUnauthorized: boolean) {
    return new Promise<TLSSocket>((resolve, reject) => {
      const secureSocket = connectTls({ socket, servername: host, rejectUnauthorized });
      secureSocket.once('secureConnect', () => resolve(secureSocket));
      secureSocket.once('error', reject);
    });
  }

  private buildMessage(message: QuoteEmail, from: string) {
    const boundary = `finet-${Date.now().toString(36)}`;
    const attachment = message.pdf
      .toString('base64')
      .match(/.{1,76}/g)
      ?.join('\r\n') ?? '';
    const subject = this.encodedHeader(`Cotizacion de servicio - ${message.companyName}`);
    const fromName = this.encodedHeader(this.value('SMTP_FROM_NAME') ?? 'CRM FiNet');
    const lines = [
      `From: ${fromName} <${this.headerValue(from)}>`,
      `To: ${this.headerValue(message.to)}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(
        `Hola ${message.prospectName},\n\nAdjuntamos la cotizacion solicitada para ${message.companyName}.\n\nSaludos,\nCRM FiNet`,
        'utf8',
      ).toString('base64'),
      `--${boundary}`,
      `Content-Type: application/pdf; name="${this.headerValue(message.filename)}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${this.headerValue(message.filename)}"`,
      '',
      attachment,
      `--${boundary}--`,
    ];

    return lines.map((line) => (line.startsWith('.') ? `.${line}` : line)).join('\r\n');
  }

  private encodedHeader(value: string) {
    return `=?UTF-8?B?${Buffer.from(this.headerValue(value), 'utf8').toString('base64')}?=`;
  }

  private headerValue(value: string) {
    return value.replace(/[\r\n]/g, '').trim();
  }

  private value(name: string) {
    return this.config.get<string>(name)?.trim() || undefined;
  }

  private numberValue(name: string, fallback: number) {
    const value = Number(this.value(name));
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }

  private booleanValue(name: string, fallback: boolean) {
    const value = this.value(name)?.toLowerCase();

    if (value === undefined) {
      return fallback;
    }

    return ['1', 'true', 'yes', 'si'].includes(value);
  }
}
