# Changelog

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
