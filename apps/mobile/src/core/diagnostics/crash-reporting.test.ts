import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { developmentCrashReportingAllowed, safeCrashError } from './crash-reporting-policy';

const mocks = vi.hoisted(() => ({ create: vi.fn(), record: vi.fn() }));
vi.mock('./native-crashlytics', () => ({ createNativeCrashReporter: mocks.create }));
const globalWithErrors = globalThis as typeof globalThis & { ErrorUtils?: { getGlobalHandler(): (error: Error, fatal?: boolean) => void; setGlobalHandler(handler: (error: Error, fatal?: boolean) => void): void } };
const original = globalWithErrors.ErrorUtils;
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); mocks.create.mockResolvedValue({ record: mocks.record }); });
afterEach(() => { globalWithErrors.ErrorUtils = original; });
describe('privacy-bounded native crash reporting', () => {
  it.each([
    ['production', true, 'mmg-concierge'], ['development', true, 'mmg-concierge'],
    ['unknown', true, 'mmg-concierge-dev'], ['development', false, 'mmg-concierge-dev'],
  ])('does not enable reporting for %s / %s / %s', (environment, enabled, project) => {
    expect(developmentCrashReportingAllowed(environment, enabled, project)).toBe(false);
  });
  it('requires the explicit development flag and actual development Firebase app', () => {
    expect(developmentCrashReportingAllowed('development', true, 'mmg-concierge-dev')).toBe(true);
  });
  it('drops original messages, signed URLs, identities and exact locations from remote errors', () => {
    const raw = new Error('phone +2348012345678 email private@example.com at 6.45,3.43');
    raw.stack = 'Error: private@example.com\n at booking (https://private.example/image?token=SECRET:123:45)\n at /Users/customer/private:70:2';
    const safe = safeCrashError(raw, 'render');
    expect(safe.stack).toContain('main.jsbundle:123:45');
    for (const value of ['private', 'SECRET', '+234', '6.45', 'customer']) expect(JSON.stringify({ message: safe.message, stack: safe.stack })).not.toContain(value);
  });
  it('tolerates an exception with a broken stack getter', () => {
    const raw = new Error('private'); Object.defineProperty(raw, 'stack', { get() { throw new Error('getter failed'); } });
    expect(() => safeCrashError(raw, 'render')).not.toThrow();
  });
  it('initializes once and preserves fatal handling with a sanitized exception', async () => {
    let handler!: (error: Error, fatal?: boolean) => void; const previous = vi.fn();
    globalWithErrors.ErrorUtils = { getGlobalHandler: () => previous, setGlobalHandler: (value) => { handler = value; } };
    const reporting = await import('./crash-reporting');
    await Promise.all([reporting.initializeCrashReporting(), reporting.initializeCrashReporting()]);
    handler(new Error('private@example.com'), true);
    expect(mocks.create).toHaveBeenCalledOnce(); expect(mocks.record).toHaveBeenCalledOnce();
    expect(previous).toHaveBeenCalledWith(expect.objectContaining({ message: 'MMG javascript failure' }), true);
    expect(mocks.record.mock.calls[0][0].message).not.toContain('private');
  });
  it('does not replace global handling when reporting is disabled', async () => {
    mocks.create.mockResolvedValueOnce(null); const replace = vi.fn();
    globalWithErrors.ErrorUtils = { getGlobalHandler: vi.fn(), setGlobalHandler: replace };
    const reporting = await import('./crash-reporting'); await reporting.initializeCrashReporting();
    reporting.reportUnexpectedMobileError(new Error('private'), 'render');
    expect(replace).not.toHaveBeenCalled(); expect(mocks.record).not.toHaveBeenCalled();
  });
  it('caps repeated refresh failures per launch without silencing other categories', async () => {
    const reporting = await import('./crash-reporting'); await reporting.initializeCrashReporting();
    reporting.reportUnexpectedMobileError(new Error('offline'), 'request_refresh');
    reporting.reportUnexpectedMobileError(new Error('still offline'), 'request_refresh');
    reporting.reportUnexpectedMobileError(new Error('render'), 'render');
    expect(mocks.record).toHaveBeenCalledTimes(2);
  });
  it('never breaks the app when diagnostics fail', async () => {
    mocks.create.mockRejectedValueOnce(new Error('SDK unavailable')); const reporting = await import('./crash-reporting');
    await expect(reporting.initializeCrashReporting()).resolves.toBeUndefined();
    expect(() => reporting.reportUnexpectedMobileError(new Error('private'), 'render')).not.toThrow();
  });
});
