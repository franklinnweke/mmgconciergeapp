import Constants from 'expo-constants';
import { getApp } from '@react-native-firebase/app';
import { getCrashlytics, recordError, setAttributes, setCrashlyticsCollectionEnabled } from '@react-native-firebase/crashlytics';
import tracking from 'promise/setimmediate/rejection-tracking';
import { developmentCrashReportingAllowed, safeCrashError } from './crash-reporting-policy';

export async function createNativeCrashReporter() {
  const extra = Constants.expoConfig?.extra;
  const sdk = getCrashlytics();
  const enabled = developmentCrashReportingAllowed(extra?.firebaseEnvironment, extra?.crashReportingEnabled, getApp().options.projectId);
  // RNFirebase 26.2 installs a promise reporter independently of its raw-JS
  // crash flag. Replace that exact tracker immediately, before any await, so
  // rejected command data cannot bypass our application-error privacy boundary.
  let collecting = false;
  let reportedRejection = false;
  tracking.enable({
    allRejections: true,
    onUnhandled(_id, error) {
      if (!collecting || reportedRejection) return;
      try {
        recordError(sdk, safeCrashError(error, 'javascript'));
        reportedRejection = true;
      } catch { /* Diagnostics are non-blocking. */ }
    },
    onHandled() { /* No original exception or payload logging. */ },
  });
  await setCrashlyticsCollectionEnabled(sdk, enabled);
  if (!enabled) return null;
  await setAttributes(sdk, {
    environment: 'development',
    build: String(Constants.expoConfig?.ios?.buildNumber ?? 'unknown'),
    commit: /^[a-f0-9]{40}$/.test(String(extra?.easBuildCommit)) ? String(extra?.easBuildCommit) : 'local',
  });
  collecting = true;
  return { record: (error: Error) => { recordError(sdk, error); } };
}
