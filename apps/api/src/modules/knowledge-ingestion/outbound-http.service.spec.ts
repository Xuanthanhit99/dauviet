import { ConfigService } from '@nestjs/config';
import * as http from 'node:http';
import { AddressInfo } from 'node:net';
import { OutboundHttpError, OutboundHttpService } from './outbound-http.service';

function fakeConfig(): ConfigService<any, true> {
  return {
    get: () => ({ wikimediaUserAgent: 'DauVietTest/1.0 (test@example.com)', wikimediaContact: 'test@example.com' }),
  } as any;
}

describe('OutboundHttpService (spec sections 56/57/87 - security proof)', () => {
  let service: OutboundHttpService;

  beforeEach(() => {
    service = new OutboundHttpService(fakeConfig());
  });

  it.each(['http://localhost:9000/x', 'http://127.0.0.1/x', 'http://169.254.169.254/latest/meta-data/', 'http://10.0.0.5/x', 'http://192.168.1.1/x', 'ftp://example.com/x'])(
    'refuses disallowed/SSRF-style target %s before making any request',
    async (url) => {
      await expect(service.get(url)).rejects.toMatchObject({ code: 'INGESTION_OUTBOUND_URL_REJECTED' });
    },
  );

  it('rejects a malformed URL with a clear error, not an unhandled exception', async () => {
    await expect(service.get('not a url')).rejects.toBeInstanceOf(OutboundHttpError);
  });

  it('enforces the declared Content-Length cap before reading any body (oversized-payload safety)', async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Length': String(50 * 1024 * 1024), 'Content-Type': 'text/plain' });
      res.end('x'); // server lies about length - client must trust the header and refuse up front
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    try {
      await expect(service.get(`http://127.0.0.1:${port}/`, { allowPrivateNetworkTarget: true, maxResponseBytes: 1024 })).rejects.toMatchObject({
        code: 'INGESTION_OUTBOUND_RESPONSE_TOO_LARGE',
      });
    } finally {
      server.close();
    }
  });

  it('aborts mid-stream once the byte cap is exceeded even when Content-Length is absent (chunked/streamed oversized response)', async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      // Stream well beyond the cap without ever declaring Content-Length.
      const chunk = Buffer.alloc(4096, 'a');
      let sent = 0;
      const interval = setInterval(() => {
        if (sent > 20 * 1024) {
          clearInterval(interval);
          res.end();
          return;
        }
        res.write(chunk);
        sent += chunk.length;
      }, 1);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    try {
      await expect(service.get(`http://127.0.0.1:${port}/`, { allowPrivateNetworkTarget: true, maxResponseBytes: 1024 })).rejects.toMatchObject({
        code: 'INGESTION_OUTBOUND_RESPONSE_TOO_LARGE',
      });
    } finally {
      server.close();
    }
  });

  it('re-validates the SSRF rule on every redirect hop (a redirect cannot smuggle a request to a disallowed target)', async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' });
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    try {
      await expect(service.get(`http://127.0.0.1:${port}/`, { allowPrivateNetworkTarget: true })).rejects.toMatchObject({
        code: 'INGESTION_OUTBOUND_URL_REJECTED',
      });
    } finally {
      server.close();
    }
  });

  it('injects the configured, policy-compliant User-Agent on every request (Wikimedia Foundation User-Agent policy)', async () => {
    let receivedUserAgent = '';
    const server = http.createServer((req, res) => {
      receivedUserAgent = req.headers['user-agent'] ?? '';
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    try {
      await service.get(`http://127.0.0.1:${port}/`, { allowPrivateNetworkTarget: true });
      expect(receivedUserAgent).toContain('DauVietTest/1.0');
      expect(receivedUserAgent).toContain('test@example.com');
    } finally {
      server.close();
    }
  });

  it('bounds the number of redirects followed - and, correctly, fails on the SSRF check at the first redirect hop before ever reaching that bound, since allowPrivateNetworkTarget applies only to the original URL (see the dedicated per-hop SSRF test above)', async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(302, { Location: req.url });
      res.end(); // infinite self-redirect to another private-network target
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    try {
      await expect(service.get(`http://127.0.0.1:${port}/loop`, { allowPrivateNetworkTarget: true, maxRedirects: 2 })).rejects.toMatchObject({
        code: 'INGESTION_OUTBOUND_URL_REJECTED',
      });
    } finally {
      server.close();
    }
  });
});
