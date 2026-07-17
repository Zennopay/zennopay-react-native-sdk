import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * TurboModule spec (new architecture) for the native Zennopay bridge.
 *
 * The native side (iOS `ZennopayReactNative.swift`, Android
 * `ZennopayReactNativeModule.kt`) wraps `Zennopay.presentCheckout` and resolves
 * `present` exactly once with a JSON-encoded terminal `PaymentResult`. A
 * rejected promise is reserved for integration errors (no presentation
 * context) — payment failure resolves with `{ status: 'failed' }`.
 *
 * `refreshSession` is serviced asynchronously: native fires a
 * `ZennopaySessionExpired` event `{ intentId }`; JS replies via
 * `provideRefreshedSession` so the bridge never makes a synchronous hop.
 */
export interface Spec extends TurboModule {
  present(
    intentId: string,
    sessionJwt: string,
    /** serialized ZennopayConfig */
    configJson: string,
    /** serialized ZennopayAppearance */
    appearanceJson: string
  ): Promise<string>; // resolves once with a JSON PaymentResult

  /** JS -> native reply carrying a freshly minted JWT (or null). */
  provideRefreshedSession(intentId: string, jwt: string | null): void;

  // RN NativeEventEmitter contract (required on the spec for codegen).
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

/**
 * Resolves on the new architecture (codegen). The interop-compatible runtime
 * resolver (old + new arch) lives in `index.ts`; this export exists so codegen
 * can generate the native interface.
 */
export default TurboModuleRegistry.get<Spec>('ZennopayReactNative');
