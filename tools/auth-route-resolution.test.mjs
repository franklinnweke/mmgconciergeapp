import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

// Run the installed Expo Router CommonJS parser in isolation. Only its native
// platform dependency is shimmed: route discovery, config generation and path
// matching are real, unlike the Redirect spy in the component lifecycle tests.
const resolveRoutes = String.raw`
  const fs = require('node:fs');
  const Module = require('node:module');
  const load = Module._load;
  Module._load = function (id, ...args) {
    if (id === 'react-native') return {
      Platform: { OS: 'ios', select: x => x.ios ?? x.default }, Linking: {},
    };
    return load.call(this, id, ...args);
  };
  const { getRoutes } = require('expo-router/build/getRoutesCore');
  const { getReactNavigationConfig } = require('expo-router/build/getReactNavigationConfig');
  const { getStateFromPath } = require('expo-router/build/fork/getStateFromPath');
  const files = fs.readdirSync('apps/mobile/src/app', { recursive: true })
    .filter(path => /\.[jt]sx?$/.test(path)).map(path => './' + path);
  const context = () => ({ default: () => null });
  context.keys = () => files;
  const screens = getReactNavigationConfig(getRoutes(context, {
    platform: 'ios', ignoreEntryPoints: true, skipGenerated: true,
  }), true);
  // Expo's linking config wraps the app routes in its internal root slot.
  const config = { screens: { __root: { path: '', ...screens } } };
  function names(state) {
    const route = state.routes[state.index ?? 0];
    return [...(route.name === '__root' ? [] : [route.name]),
      ...(route.state ? names(route.state) : [])];
  }
  const from = [[], ['(renter)'], ['(renter)', 'account'], ['(owner)'],
    ['booking', 'review'], ['trip', '[tripId]'], ['vehicle', '[vehicleId]']];
  console.log(JSON.stringify({
    ambiguousRoot: ['(renter)', '(owner)'].map(group =>
      names(getStateFromPath('/', config, [group]))),
    auth: from.map(segments => names(getStateFromPath('/auth', config, segments))),
    journey: ['/auth', '/(renter)', '/auth', '/(owner)', '/auth', '/(renter)', '/auth']
      .map(path => names(getStateFromPath(path, config))),
  }));
`;

describe('Signed-out route resolution', () => {
  let result;

  beforeAll(() => {
    result = JSON.parse(execFileSync(process.execPath, ['-e', resolveRoutes], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      timeout: 15_000,
    }));
  });

  it('resolves /auth to the public entry from every protected route', () => {
    expect(result.auth).toEqual(Array.from({ length: 7 }, () => ['auth']));
  });

  it('reproduces why / must not be used as a signed-out redirect', () => {
    expect(result.ambiguousRoot).toEqual([
      ['(renter)', 'index'], ['(owner)', 'index'],
    ]);
  });

  it('does not resolve repeated logout or same-user relogin back to a protected index', () => {
    expect(result.journey).toEqual([
      ['auth'], ['(renter)', 'index'], ['auth'], ['(owner)', 'index'],
      ['auth'], ['(renter)', 'index'], ['auth'],
    ]);
  });

  it.each([
    '(renter)/_layout.tsx', '(owner)/_layout.tsx', 'booking/review.tsx',
    'vehicle/[vehicleId].tsx', 'trip/[tripId].tsx',
  ])('%s redirects signed-out users to the distinct public entry', (path) => {
    const source = readFileSync(`${repositoryRoot}/apps/mobile/src/app/${path}`, 'utf8');
    expect(source).toContain('<Redirect href="/auth" />');
    expect(source).not.toContain('<Redirect href="/" />');
  });
});
