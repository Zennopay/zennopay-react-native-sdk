import {
  NativeEventEmitter,
  NativeModules,
  Platform,
  TurboModuleRegistry,
  type EmitterSubscription,
} from 'react-native';

import type { Spec } from './NativeZennopay';
import type {
  PaymentResult,
  PresentReceiptOptions,
  PresentSheetOptions,
} from './types';

export * from './types';
export { ZennopayProvider, useZennopay } from './ZennopayProvider';

const LINKING_ERROR =
  `The package '@zennopay/react-native' doesn't seem to be linked. Make sure:\n\n` +
  Platform.select({ ios: "- You ran 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

/**
 * Interop-compatible module resolution (spec §12.7): prefer the TurboModule
 * (new architecture), fall back to the legacy bridge `NativeModules` entry so
 * hosts not yet on Fabric/TurboModules still work.
 */
const ZennopayModule: Spec =
  (TurboModuleRegistry.get<Spec>('ZennopayReactNative') as Spec | null) ??
  (NativeModules.ZennopayReactNative as Spec | undefined) ??
  (new Proxy(
    {},
    {
      get() {
        throw new Error(LINKING_ERROR);
      },
    }
  ) as Spec);

const SESSION_EXPIRED_EVENT = 'ZennopaySessionExpired';
const RECEIPT_TOKEN_EXPIRED_EVENT = 'ZennopayReceiptTokenExpired';

/**
 * Present the native Zennopay PaymentSheet and resolve once with a terminal
 * {@link PaymentResult}. Mirrors Stripe RN's shape but collapses
 * init+present into one call (there is no payment-method collection to
 * pre-warm).
 *
 * The promise rejects only for integration errors (e.g. no presentation
 * context). A payment *failure* resolves with `{ status: 'failed', error }`.
 */
export async function presentSheet(
  options: PresentSheetOptions
): Promise<PaymentResult> {
  const { intentId, sessionJwt, refreshSession, appearance, config } = options;

  let subscription: EmitterSubscription | undefined;
  if (refreshSession) {
    const emitter = new NativeEventEmitter(
      NativeModules.ZennopayReactNative
    );
    subscription = emitter.addListener(
      SESSION_EXPIRED_EVENT,
      async (event: { intentId: string }) => {
        try {
          const jwt = await refreshSession(event.intentId);
          ZennopayModule.provideRefreshedSession(event.intentId, jwt ?? null);
        } catch {
          ZennopayModule.provideRefreshedSession(event.intentId, null);
        }
      }
    );
  }

  try {
    const json = await ZennopayModule.present(
      intentId,
      sessionJwt,
      JSON.stringify(config ?? { environment: 'staging' }),
      JSON.stringify(appearance ?? { mode: 'automatic' })
    );
    return JSON.parse(json) as PaymentResult;
  } finally {
    subscription?.remove();
  }
}

/**
 * Present the authoritative native Zennopay receipt for a payment intent and
 * resolve once the user dismisses it.
 *
 * A thin mirror of {@link presentSheet}: the native SDK fetches the receipt,
 * renders the native receipt / pending / failure screens, polls a pending
 * receipt through to a terminal state, shows refund copy when the intent was
 * refunded, and — on a `401` mid-poll — asks the host to re-mint the receipt
 * token via `refreshReceiptToken`. The receipt is read-only, so the promise
 * resolves with no value; it rejects only for integration errors (e.g. no
 * presentation context).
 */
export async function presentReceipt(
  options: PresentReceiptOptions
): Promise<void> {
  const { intentId, receiptToken, refreshReceiptToken, appearance, config } =
    options;

  let subscription: EmitterSubscription | undefined;
  if (refreshReceiptToken) {
    const emitter = new NativeEventEmitter(NativeModules.ZennopayReactNative);
    subscription = emitter.addListener(
      RECEIPT_TOKEN_EXPIRED_EVENT,
      async (event: { intentId: string }) => {
        try {
          const token = await refreshReceiptToken(event.intentId);
          ZennopayModule.provideRefreshedReceiptToken(
            event.intentId,
            token ?? null
          );
        } catch {
          ZennopayModule.provideRefreshedReceiptToken(event.intentId, null);
        }
      }
    );
  }

  try {
    await ZennopayModule.presentReceipt(
      intentId,
      receiptToken,
      JSON.stringify(config ?? { environment: 'staging' }),
      JSON.stringify(appearance ?? { mode: 'automatic' })
    );
  } finally {
    subscription?.remove();
  }
}

export default { presentSheet, presentReceipt };
