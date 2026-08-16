import { describe, expect, it } from 'vitest';

import { checkSameOrigin, resolveRequestHost } from './same-origin';

function headers(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

describe('resolveRequestHost', () => {
  it('prefers x-forwarded-host over host so proxies do not break the check', () => {
    expect(
      resolveRequestHost(headers({ host: 'internal:8080', 'x-forwarded-host': 'admin.mmg.ng' })),
    ).toBe('admin.mmg.ng');
  });

  it('uses the first value of a forwarded-host chain', () => {
    expect(
      resolveRequestHost(headers({ 'x-forwarded-host': 'admin.mmg.ng, proxy.internal' })),
    ).toBe('admin.mmg.ng');
  });

  it('falls back to host when no forwarded host is present', () => {
    expect(resolveRequestHost(headers({ host: 'admin.mmg.ng' }))).toBe('admin.mmg.ng');
  });

  it('reports no host when neither header is present', () => {
    expect(resolveRequestHost(headers({}))).toBeNull();
  });
});

describe('checkSameOrigin', () => {
  it('allows a same-origin request', () => {
    expect(
      checkSameOrigin(headers({ host: 'admin.mmg.ng', origin: 'https://admin.mmg.ng' })),
    ).toEqual({ allowed: true });
  });

  it('allows a same-origin request behind a proxy that rewrites host', () => {
    expect(
      checkSameOrigin(
        headers({
          host: 'localhost:3000',
          'x-forwarded-host': 'admin.mmg.ng',
          origin: 'https://admin.mmg.ng',
        }),
      ),
    ).toEqual({ allowed: true });
  });

  it('rejects a cross-origin request', () => {
    expect(
      checkSameOrigin(headers({ host: 'admin.mmg.ng', origin: 'https://evil.example' })),
    ).toEqual({ allowed: false, reason: 'cross_origin' });
  });

  it('rejects a request whose origin only shares a suffix with the host', () => {
    expect(
      checkSameOrigin(headers({ host: 'admin.mmg.ng', origin: 'https://notadmin.mmg.ng' })),
    ).toEqual({ allowed: false, reason: 'cross_origin' });
  });

  it('fails closed when the origin header is absent', () => {
    // The previous implementation returned early here, which let any client
    // that simply omitted Origin skip the check entirely.
    expect(checkSameOrigin(headers({ host: 'admin.mmg.ng' }))).toEqual({
      allowed: false,
      reason: 'missing_origin',
    });
  });

  it('accepts a missing origin only when Sec-Fetch-Site proves it is same-origin', () => {
    expect(
      checkSameOrigin(headers({ host: 'admin.mmg.ng', 'sec-fetch-site': 'same-origin' })),
    ).toEqual({ allowed: true });
  });

  it('rejects a missing origin when Sec-Fetch-Site says cross-site', () => {
    expect(
      checkSameOrigin(headers({ host: 'admin.mmg.ng', 'sec-fetch-site': 'cross-site' })),
    ).toEqual({ allowed: false, reason: 'missing_origin' });
  });

  it('rejects an unparseable origin', () => {
    expect(checkSameOrigin(headers({ host: 'admin.mmg.ng', origin: 'not-a-url' }))).toEqual({
      allowed: false,
      reason: 'invalid_origin',
    });
  });

  it('rejects the null origin used by sandboxed and cross-origin contexts', () => {
    expect(checkSameOrigin(headers({ host: 'admin.mmg.ng', origin: 'null' }))).toEqual({
      allowed: false,
      reason: 'invalid_origin',
    });
  });

  it('fails closed when the request host cannot be determined', () => {
    expect(checkSameOrigin(headers({ origin: 'https://admin.mmg.ng' }))).toEqual({
      allowed: false,
      reason: 'unknown_host',
    });
  });
});
