import { describe, expect, it, vi } from 'vitest';
import { checkCloudinaryCredentials } from './cloudinary-check';
import { captureLogger } from '../../test/capture-logger';

const URL_OK = 'cloudinary://key:secret@demo-cloud';

describe('checkCloudinaryCredentials', () => {
  it('pings with the parsed credentials and logs ok', async () => {
    const { lines, logger, flush } = captureLogger();
    const ping = vi.fn().mockResolvedValue({ status: 'ok' });

    await expect(checkCloudinaryCredentials(URL_OK, { ping, log: logger })).resolves.toBe(true);
    await flush();

    expect(ping).toHaveBeenCalledWith({
      cloudName: 'demo-cloud',
      apiKey: 'key',
      apiSecret: 'secret',
    });
    expect(lines[0]).toMatchObject({ level: 'info', cloudName: 'demo-cloud' });
    expect(JSON.stringify(lines)).not.toContain('secret');
  });

  it("logs Cloudinary's rejection message and http code", async () => {
    const { lines, logger, flush } = captureLogger();
    const ping = vi
      .fn()
      .mockRejectedValue({ error: { message: 'Invalid api_key key', http_code: 401 } });

    await expect(checkCloudinaryCredentials(URL_OK, { ping, log: logger })).resolves.toBe(false);
    await flush();

    expect(lines[0]).toMatchObject({
      level: 'error',
      cloudName: 'demo-cloud',
      message: 'Invalid api_key key',
      httpCode: 401,
    });
  });

  it('handles network errors', async () => {
    const { lines, logger, flush } = captureLogger();
    const ping = vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

    await expect(checkCloudinaryCredentials(URL_OK, { ping, log: logger })).resolves.toBe(false);
    await flush();

    expect(lines[0]).toMatchObject({
      level: 'error',
      message: 'getaddrinfo ENOTFOUND',
      httpCode: null,
    });
  });

  it('reports a malformed URL without pinging', async () => {
    const { lines, logger, flush } = captureLogger();
    const ping = vi.fn();

    await expect(checkCloudinaryCredentials('nope', { ping, log: logger })).resolves.toBe(false);
    await flush();

    expect(ping).not.toHaveBeenCalled();
    expect(lines[0]).toMatchObject({ level: 'error' });
  });
});
