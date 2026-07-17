# Changelog

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
