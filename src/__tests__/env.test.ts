import {
  DEFAULT_ENVIRONMENT,
  ZENNOPAY_HOSTS,
  resolveApiBaseUrl,
} from '../env';

describe('resolveApiBaseUrl', () => {
  it('maps sandbox to the sandbox gateway', () => {
    expect(resolveApiBaseUrl({ environment: 'sandbox' })).toBe(
      'https://api.sandbox.zennopay.in'
    );
  });

  it('maps production to the live gateway', () => {
    expect(resolveApiBaseUrl({ environment: 'production' })).toBe(
      'https://api.zennopay.in'
    );
  });

  it('treats staging as a deprecated alias for sandbox', () => {
    expect(resolveApiBaseUrl({ environment: 'staging' })).toBe(
      ZENNOPAY_HOSTS.sandbox
    );
  });

  it('defaults to sandbox when environment + apiBaseUrl are absent', () => {
    expect(resolveApiBaseUrl()).toBe('https://api.sandbox.zennopay.in');
    expect(resolveApiBaseUrl({})).toBe('https://api.sandbox.zennopay.in');
    expect(DEFAULT_ENVIRONMENT).toBe('sandbox');
  });

  it('lets an explicit apiBaseUrl win and trims trailing slashes', () => {
    expect(
      resolveApiBaseUrl({
        environment: 'production',
        apiBaseUrl: 'https://localhost:8443/',
      })
    ).toBe('https://localhost:8443');
    expect(resolveApiBaseUrl({ apiBaseUrl: 'https://api.example.test///' })).toBe(
      'https://api.example.test'
    );
  });

  it('ignores a blank apiBaseUrl and falls back to the environment host', () => {
    expect(
      resolveApiBaseUrl({ environment: 'production', apiBaseUrl: '   ' })
    ).toBe('https://api.zennopay.in');
  });
});
