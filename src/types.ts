/**
 * Public TypeScript surface for @zennopay/react-native.
 *
 * This package is a NATIVE BRIDGE: a thin JS API over the native Zennopay
 * iOS/Android PaymentSheets. The UI (camera scan, slide-to-pay physics,
 * confirm/status) is rendered natively — nothing here re-implements it in JS.
 */

/**
 * The partner-facing environments.
 *
 * - `'sandbox'` → `https://api.sandbox.zennopay.in` (integration/testing).
 * - `'production'` → `https://api.zennopay.in` (live, money-moving traffic).
 * - `'staging'` is a **deprecated** alias for `'sandbox'` (same host); use
 *   `'sandbox'` in new code.
 */
export type ZennopayEnvironment = 'sandbox' | 'production' | 'staging';

export interface ZennopayConfig {
  /**
   * Selects the REST base URL + sandbox chrome. Defaults to `sandbox`.
   * `'staging'` is a deprecated alias for `'sandbox'`.
   */
  environment?: ZennopayEnvironment;
  /** Explicit REST base URL override (e.g. a local/custom backend). */
  apiBaseUrl?: string;
}

/** Per-mode color overrides. Each is a CSS-style color string. */
export interface ZennopayColors {
  primary?: string;
  background?: string;
  surface?: string;
  textPrimary?: string;
  textSecondary?: string;
  textTertiary?: string;
  border?: string;
  success?: string;
  pending?: string;
  failure?: string;
  /** Dark-mode overrides for any of the above. */
  dark?: Omit<ZennopayColors, 'dark'>;
}

/** Corner radii, clamped to <= 12px natively (DESIGN.md anti-slop rule). */
export interface ZennopayCornerRadius {
  input?: number;
  card?: number;
  slide?: number;
}

export interface ZennopayFont {
  family?: string;
  /** Honors Dynamic Type up to 1.5x. */
  scale?: number;
}

export interface ZennopayPrimaryButton {
  background?: string;
  textColor?: string;
  cornerRadius?: number;
}

/**
 * Theming API (spec §5). Restyles the sheet within the system; structural
 * rules (radius cap, accent-as-state, tabular-nums) are non-overridable.
 */
export interface ZennopayAppearance {
  mode?: 'automatic' | 'light' | 'dark';
  colors?: ZennopayColors;
  cornerRadius?: ZennopayCornerRadius;
  font?: ZennopayFont;
  primaryButton?: ZennopayPrimaryButton;
  /** A resolved image URI/asset for a partner logo in the sheet header. */
  logo?: string;
}

/**
 * Simplified error codes bridged from the native SDK taxonomy (the native
 * dotted codes, e.g. `confirm.quote_expired` / `payment.declined` /
 * `status.polling_timeout`, are collapsed to these stable identifiers).
 */
export type ZennopayErrorCode =
  | 'invalid_jwt'
  | 'jwt_expired'
  | 'jti_replay'
  | 'intent_mismatch'
  | 'unauthorized'
  | 'session_refresh_failed'
  | 'camera_denied'
  | 'qr_unsupported'
  | 'qr_invalid'
  | 'invalid_corridor'
  | 'quote_expired'
  | 'amount_not_allowed'
  | 'payment_declined'
  | 'confirm_failed'
  | 'limit_exceeded'
  | 'network_error'
  | 'timed_out'
  | 'canceled';

export interface ZennopayError {
  code: ZennopayErrorCode;
  /** Developer-facing; never shown to users. */
  message?: string;
  /** Correlates to server logs. */
  requestId?: string;
}

export interface Receipt {
  merchantName?: string;
  /** Local amount paid, in minor units (satang for THB; VND has none). */
  localAmountMinorUnits: number;
  /** Numeric ISO-4217, e.g. "764" THB, "704" VND. */
  localCurrency: string;
  /** USD debited from the wallet, in cents. */
  amountUsdCents: number;
  transactionId?: string;
  /** TH verifiable-QR payload; null for VN. */
  verifiableQrData?: string | null;
}

/**
 * Three terminal cases + `pending` (spec §4.5, promoted per §12.1).
 *
 * `pending` is delivered when the payment was confirmed but had not reached a
 * terminal state when the sheet closed — the user tapped Done while it was
 * still processing, or status polling timed out. The payment may still settle;
 * reconcile via webhook / `GET /v1/payment_intents/:id`. If it does not
 * complete, the money is refunded to the wallet automatically.
 */
export type PaymentResult =
  | { status: 'completed'; intentId: string; receipt?: Receipt }
  | { status: 'canceled'; intentId: string }
  | { status: 'failed'; intentId: string; error: ZennopayError }
  | { status: 'pending'; intentId: string; receipt?: Receipt };

export interface PresentSheetOptions {
  /** The Zennopay payment intent id your backend pre-created (e.g. `zp_...`). */
  intentId: string;
  /** The Zennopay-minted, intent-bound RS256 session token (<= 5 min),
   *  returned to your backend from `POST /v1/payment_intents`. */
  sessionJwt: string;
  /**
   * Host hook invoked on 401/expiry. Asks your backend for a fresh session
   * token for the SAME intent (it re-calls Zennopay's session endpoint), or
   * resolves `null` if it can't (then the SDK surfaces an auth error).
   * Serviced over a native event + reply so the bridge never blocks.
   */
  refreshSession?: (intentId: string) => Promise<string | null>;
  appearance?: ZennopayAppearance;
  config?: ZennopayConfig;
}

export interface PresentReceiptOptions {
  /** The Zennopay payment intent id to show the receipt for (e.g. `zp_...`). */
  intentId: string;
  /** The partner-minted, intent-bound receipt token. */
  receiptToken: string;
  /**
   * Host hook invoked on a 401/expiry while polling a pending receipt. Re-mints
   * a fresh receipt token for the SAME intent, or resolves `null` if it can't.
   * Serviced over a native event + reply so the bridge never blocks.
   */
  refreshReceiptToken?: (intentId: string) => Promise<string | null>;
  appearance?: ZennopayAppearance;
  config?: ZennopayConfig;
}
