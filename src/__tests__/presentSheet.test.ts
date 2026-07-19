/**
 * Exercises the real bridge glue in src/index.ts (default config/appearance
 * serialization + native JSON -> PaymentResult parsing) against a mocked
 * react-native native module.
 */
jest.mock('react-native', () => {
  const present = jest.fn(async () =>
    JSON.stringify({ status: 'completed', intentId: 'zp_native' })
  );
  const presentReceipt = jest.fn(async () => '');
  const module = { present, presentReceipt };
  return {
    Platform: { select: (spec: { default?: string }) => spec.default ?? '' },
    NativeModules: { ZennopayReactNative: module },
    TurboModuleRegistry: { get: () => module },
    NativeEventEmitter: class {
      addListener() {
        return { remove() {} };
      }
    },
  };
});

import { NativeModules } from 'react-native';

import { presentSheet } from '../index';

type MockedModule = { present: jest.Mock };

describe('presentSheet bridge', () => {
  beforeEach(() => {
    (NativeModules.ZennopayReactNative as MockedModule).present.mockClear();
  });

  it('parses the native JSON string into a PaymentResult', async () => {
    const result = await presentSheet({
      intentId: 'zp_1',
      sessionJwt: 'session.jwt.value',
    });
    expect(result).toEqual({ status: 'completed', intentId: 'zp_native' });
  });

  it('defaults config to sandbox and appearance to automatic', async () => {
    await presentSheet({ intentId: 'zp_1', sessionJwt: 'session.jwt.value' });

    const present = (NativeModules.ZennopayReactNative as MockedModule).present;
    const call = present.mock.calls[0] as [string, string, string, string];
    const [intentId, sessionJwt, configJson, appearanceJson] = call;

    expect(intentId).toBe('zp_1');
    expect(sessionJwt).toBe('session.jwt.value');
    expect(JSON.parse(configJson)).toEqual({ environment: 'sandbox' });
    expect(JSON.parse(appearanceJson)).toEqual({ mode: 'automatic' });
  });

  it('forwards an explicit config + appearance verbatim', async () => {
    await presentSheet({
      intentId: 'zp_2',
      sessionJwt: 'jwt',
      config: { environment: 'production' },
      appearance: { mode: 'dark' },
    });

    const present = (NativeModules.ZennopayReactNative as MockedModule).present;
    const call = present.mock.calls[0] as [string, string, string, string];
    expect(JSON.parse(call[2])).toEqual({ environment: 'production' });
    expect(JSON.parse(call[3])).toEqual({ mode: 'dark' });
  });
});
