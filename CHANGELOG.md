# Changelog

## 0.7.0

Partner package allowlist support, inherited from the native SDKs.

### Changed

- Bumped both native dependencies to the releases that send the
  `X-Zennopay-Package` header — iOS `Zennopay ~> 0.7.0`, Android
  `in.zennopay:sdk` **0.5.0 → 0.7.0**. The native PaymentSheet now stamps the
  host app's bundle id / `applicationId` on every REST call so partners can
  enable a package allowlist in Console → Developers → Security. No JS/TS API
  change; the bridge inherits the behavior transitively.

## 0.6.0

Partner-facing environment names + production fallback host fix.

### Fixed

- **Production fallback host.** The iOS bridge's config codec fell back to a
  stale, non-canonical host for `environment: 'production'`. It now resolves to
  `https://api.zennopay.in` (canonical). The Android bridge's default host is
  likewise aligned to `https://api.sandbox.zennopay.in`.

### Added

- `environment: 'sandbox'` → `https://api.sandbox.zennopay.in`, the environment
  partners integrate and test against. Now the default for `presentSheet` /
  `presentReceipt` / `ZennopayProvider`.

### Changed

- Default `environment` is now `'sandbox'` (was `'staging'`). Same behavior,
  partner-facing name.
- Native dependency bumped to `Zennopay ~> 0.6.0` (iOS). The Android native
  dependency stays at `in.zennopay:sdk:0.5.0` until `0.6.0` propagates to Maven
  Central; the bridge derives the sandbox host explicitly, so it is used
  regardless of the native default.

### Deprecated

- `environment: 'staging'` is a deprecated alias for `'sandbox'` — it now points
  at `https://api.sandbox.zennopay.in` (previously `https://api.staging.zennopay.in`).
  Existing code keeps working; migrate to `'sandbox'`.

## 0.5.0

**Native SDKs linked — `presentSheet` + `presentReceipt` now invoke the real
native PaymentSheet (previously stubbed).** The iOS
(`ZennopayReactNative.swift`) and Android (`ZennopayReactNativeModule.kt`)
bridge methods now call `Zennopay.presentCheckout(...)` /
`Zennopay.presentReceipt(...)` against the published native SDKs — the
`native_sdk_unavailable` stub reject is gone. The bridge maps the JS
`config` / `appearance` dicts onto the native `ZennopayConfig` /
`ZennopayAppearance` and the native `PaymentResult` back onto the JS
`{ status, intentId, error }` payload, and wires `refreshSession` /
`refreshReceiptToken` over the existing event round-trip.

- iOS: presents from `RCTPresentedViewController()` on the main actor; links
  the `Zennopay ~> 0.3.0` CocoaPod. Podspec iOS floor raised to 16.0 (the
  native pod's deployment target).
- Android: presents via `currentActivity` (a `ComponentActivity`) on the UI
  thread; links `in.zennopay:sdk:0.3.0` from Maven Central. Rejects with
  `no_activity` when there is no current Activity.
- The JS/TS surface is unchanged.

**Version-aligned with the iOS / Android / Flutter SDKs at 0.5.0.** All four
Zennopay SDKs now share the same version line; this release jumps the React
Native package from 0.3.0 to 0.5.0 to match (no breaking API changes).

## 0.3.0

**New: `presentReceipt(options)` — reopen the authoritative receipt.** A second
entrypoint (imperative + on the `useZennopay()` hook) that presents the
**native** iOS/Android Zennopay receipt for a payment intent and resolves
(`Promise<void>`) when the user dismisses it. The native SDK fetches the
receipt, renders the native receipt / pending / failure screens, polls a
pending receipt through to a terminal state, shows refund copy when the intent
was refunded, and — on a `401` mid-poll — asks the host to re-mint the receipt
token. A thin mirror of `presentSheet`; nothing is re-implemented in JS.

- JS API: `presentReceipt({ intentId, receiptToken, config?, appearance?,
  refreshReceiptToken? }): Promise<void>`, plus `presentReceipt` on the
  `useZennopay()` hook. New `PresentReceiptOptions` type.
- TurboModule spec gains `presentReceipt(...)` +
  `provideRefreshedReceiptToken(...)`; `refreshReceiptToken` is serviced over a
  `ZennopayReceiptTokenExpired` event + reply, mirroring `refreshSession`.
- iOS (`ZennopayReactNative.swift`/`.m`) + Android
  (`ZennopayReactNativeModule.kt`) bridge methods wrapping
  `Zennopay.presentReceipt`.
- Native SDK dependency bump: iOS `Zennopay ~> 0.3.0`, Android
  `in.zennopay:sdk:0.3.0` — the releases that expose `presentReceipt`.

## 0.2.0

First public release, version-locked with the native Zennopay SDKs
(iOS / Android v0.2.0 — the PaymentSheet release).

- Package metadata now points at the public
  [zennopay-react-native](https://github.com/Zennopay/zennopay-react-native-sdk)
  repository; license set to MIT.
- No API changes from 0.1.0.

## 0.1.0

Initial release of the Zennopay PaymentSheet native bridge for React Native.

- `presentSheet(options)` and the `useZennopay()` hook + `ZennopayProvider`,
  returning a `Promise<PaymentResult>` (`completed` / `canceled` / `failed` /
  `pending`).
- Full TypeScript surface: `PaymentResult`, `ZennopayAppearance`,
  `ZennopayConfig`, `ZennopayError`, `PresentSheetOptions`, `Receipt`.
- TurboModule spec (`src/NativeZennopay.ts`) with an interop-compatible runtime
  resolver (legacy bridge + new architecture).
- iOS bridge (`ios/ZennopayReactNative.swift` + `.m`) wrapping
  `Zennopay.presentCheckout` via `RCTPresentedViewController()`.
- Android bridge (`ZennopayReactNativeModule.kt` + package) wrapping
  `com.zennopay.sdk.Zennopay.presentCheckout` against the current Activity.
- `refreshSession` serviced over a `ZennopaySessionExpired` event +
  `provideRefreshedSession` reply so the bridge never blocks.
