import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNativeCrashReporter } from './native-crashlytics';
const mocks = vi.hoisted(() => ({ project: 'mmg-concierge-dev', extra: { firebaseEnvironment: 'development', crashReportingEnabled: true }, enabled: vi.fn(), attributes: vi.fn(), record: vi.fn(), track: vi.fn() }));
vi.mock('promise/setimmediate/rejection-tracking', () => ({ default: { enable: mocks.track } }));
vi.mock('expo-constants', () => ({ default: { expoConfig: { get extra() { return mocks.extra; }, ios: { buildNumber: 'test' } } } }));
vi.mock('@react-native-firebase/app', () => ({ getApp: () => ({ options: { projectId: mocks.project } }) }));
vi.mock('@react-native-firebase/crashlytics', () => ({ getCrashlytics: () => ({}), setCrashlyticsCollectionEnabled: mocks.enabled, setAttributes: mocks.attributes, recordError: mocks.record }));
beforeEach(() => { vi.clearAllMocks(); mocks.project = 'mmg-concierge-dev'; mocks.extra = { firebaseEnvironment: 'development', crashReportingEnabled: true }; });
describe('development Crashlytics transport', () => {
  it('sets only safe environment/build attributes', async () => {
    const reporter = await createNativeCrashReporter(); expect(reporter).not.toBeNull();
    expect(mocks.enabled).toHaveBeenCalledWith({}, true);
    expect(mocks.attributes).toHaveBeenCalledWith({}, { environment: 'development', build: 'test', commit: 'local' });
  });
  it('fails closed for the production Firebase project despite a development config flag', async () => {
    mocks.project = 'mmg-concierge'; expect(await createNativeCrashReporter()).toBeNull();
    expect(mocks.enabled).toHaveBeenCalledWith({}, false); expect(mocks.attributes).not.toHaveBeenCalled();
    mocks.track.mock.calls[0][0].onUnhandled(1, new Error('private@example.com'));
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it('replaces the SDK promise handler with a sanitized reporter', async () => {
    await createNativeCrashReporter();
    mocks.track.mock.calls[0][0].onUnhandled(1, new Error('private@example.com token=SECRET'));
    expect(mocks.record).toHaveBeenCalledWith({}, expect.objectContaining({ message: 'MMG javascript failure' }));
    expect(mocks.record.mock.calls[0][1].stack).not.toContain('SECRET');
  });
});
