import React, { createContext, useCallback, useContext, useMemo } from 'react';

import {
  presentReceipt as presentReceiptImpl,
  presentSheet as presentSheetImpl,
} from './index';
import type {
  PaymentResult,
  PresentReceiptOptions,
  PresentSheetOptions,
  ZennopayConfig,
} from './types';

interface ZennopayContextValue {
  config: ZennopayConfig;
}

const ZennopayContext = createContext<ZennopayContextValue | null>(null);

export interface ZennopayProviderProps {
  /** Default config applied to every `presentSheet` call under this provider. */
  config?: ZennopayConfig;
  children: React.ReactNode;
}

/**
 * Root provider that supplies a default {@link ZennopayConfig} to the
 * {@link useZennopay} hook. Mirrors `@stripe/stripe-react-native`'s provider.
 *
 * ```tsx
 * <ZennopayProvider config={{ environment: 'staging' }}>
 *   {children}
 * </ZennopayProvider>
 * ```
 */
export function ZennopayProvider(props: ZennopayProviderProps): JSX.Element {
  const value = useMemo<ZennopayContextValue>(
    () => ({ config: props.config ?? { environment: 'staging' } }),
    [props.config]
  );
  return (
    <ZennopayContext.Provider value={value}>
      {props.children}
    </ZennopayContext.Provider>
  );
}

export interface UseZennopay {
  presentSheet: (options: PresentSheetOptions) => Promise<PaymentResult>;
  presentReceipt: (options: PresentReceiptOptions) => Promise<void>;
}

/**
 * Hook returning `presentSheet` + `presentReceipt`, pre-bound to the provider's
 * default config (per-call `config` still overrides).
 */
export function useZennopay(): UseZennopay {
  const ctx = useContext(ZennopayContext);

  const presentSheet = useCallback(
    (options: PresentSheetOptions) =>
      presentSheetImpl({
        ...options,
        config: options.config ?? ctx?.config,
      }),
    [ctx]
  );

  const presentReceipt = useCallback(
    (options: PresentReceiptOptions) =>
      presentReceiptImpl({
        ...options,
        config: options.config ?? ctx?.config,
      }),
    [ctx]
  );

  return { presentSheet, presentReceipt };
}
