import { apiHostLabel, apiUrl } from './client';

describe('apiUrl', () => {
  const previous = process.env.EXPO_PUBLIC_API_BASE_URL;

  afterEach(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = previous;
  });

  it('joins the base URL and path without a double slash', () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://kiwi.taildb44.ts.net:38420/';
    expect(apiUrl('/health')).toBe('http://kiwi.taildb44.ts.net:38420/health');
    expect(apiUrl('/v1/sites/nearby')).toBe(
      'http://kiwi.taildb44.ts.net:38420/v1/sites/nearby',
    );
  });

  it('throws when the base URL is missing', () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = '';
    expect(() => apiUrl('/health')).toThrow(/EXPO_PUBLIC_API_BASE_URL/);
  });
});

describe('apiHostLabel', () => {
  it('strips the scheme so the HUD can show the Tailscale host', () => {
    expect(apiHostLabel('http://kiwi.taildb44.ts.net:38420')).toBe(
      'kiwi.taildb44.ts.net:38420',
    );
  });

  it('says unset when the base URL is empty', () => {
    expect(apiHostLabel('')).toBe('API unset');
  });
});
