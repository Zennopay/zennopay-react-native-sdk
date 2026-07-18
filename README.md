# @zennopay/react-native

The React Native SDK for [Zennopay](https://zennopay.in) — let your app's
users scan local merchant QR codes abroad and pay from their wallet balance.

This package is a **thin native bridge** over the native Zennopay
[iOS](https://github.com/Zennopay/zennopay-ios-sdk) and
[Android](https://github.com/Zennopay/zennopay-android-sdk) PaymentSheets.
The camera scanner, slide-to-pay physics, and confirm/status UI all render
natively — nothing is re-implemented in JS. One `await presentSheet(...)`,
one `PaymentResult`. Both the legacy bridge and the new architecture
(Fabric/TurboModules) are supported.

Full documentation: [Zennopay/zennopay-docs](https://github.com/Zennopay/zennopay-docs)

## Requirements

- React Native 0.70+, React 17+
- iOS 16+ (the native `Zennopay` pod's deployment target) / Android
  `minSdkVersion` 24+
- The native Zennopay iOS/Android SDKs, pulled in automatically by
  `pod install` / Gradle (see below) — this package is the JS surface over them
- A backend session endpoint that creates the payment intent and mints the
  short-lived session JWT (your API keys never ship in the app)

## Installation

```sh
npm install @zennopay/react-native
```

> **Note:** if npm hasn't propagated the release yet, install from git:
> `npm install github:Zennopay/zennopay-react-native-sdk#v0.5.0`.

### Link the native SDKs

The native SDKs are linked automatically — `pod install` pulls in the
`Zennopay` CocoaPod and Gradle pulls in `in.zennopay:sdk`. (Expo Go cannot
load the native module; use a development build.)

**iOS** — the podspec depends on the native `Zennopay` pod
([zennopay-ios-sdk](https://github.com/Zennopay/zennopay-ios-sdk)), so
installing pods pulls it in:

```sh
cd ios && pod install
```

Then add the camera usage string to `ios/YourApp/Info.plist`:

```xml
<key>NSCameraUsageDescription</key>
<string>Scan a merchant QR code to pay.</string>
```

**Android** — the module's Gradle file depends on the native SDK
(`in.zennopay:sdk`,
[zennopay-android-sdk](https://github.com/Zennopay/zennopay-android-sdk)),
published on Maven Central — no extra repository declaration is needed beyond
`google()` and `mavenCentral()`. The `CAMERA` permission is merged from the
native SDK's manifest; the SDK requests it at runtime.

Rebuild the app after installing (`npx react-native run-ios` /
`run-android`) — a Metro-only reload will not pick up the native module.

## Quickstart

Wrap your app in `ZennopayProvider` (sets the default environment), then call
`presentSheet` from the `useZennopay()` hook:

```tsx
import { ZennopayProvider, useZennopay } from '@zennopay/react-native';

// Root:
export default function App() {
  return (
    <ZennopayProvider config={{ environment: 'staging' }}>
      <Wallet />
    </ZennopayProvider>
  );
}

// In a component:
function PayButton() {
  const { presentSheet } = useZennopay();

  const onScanAndPay = async () => {
    // 1. Ask YOUR backend for a checkout session (intent + session JWT).
    const session = await walletApi.createCheckoutSession();

    // 2. Present the native PaymentSheet and await the terminal result.
    const result = await presentSheet({
      intentId: session.intentId,
      sessionJwt: session.sessionJwt,
      refreshSession: async (intentId) => {
        // Called on session expiry (401): re-mint for the SAME intent,
        // or return null if you can't.
        const refreshed = await walletApi.refreshSession(intentId);
        return refreshed?.sessionJwt ?? null;
      },
    });

    // 3. One terminal case.
    switch (result.status) {
      case 'completed':
        showReceipt(result.receipt); // money moved — debit your ledger
        break;
      case 'pending':
        showPending(); // may still settle — reconcile via webhook/history
        break;
      case 'canceled':
        break; // user backed out; no money moved
      case 'failed':
        console.warn('payment failed', result.error.code);
        break;
    }
  };

  return <Button title="Scan & Pay" onPress={onScanAndPay} />;
}
```

There is also an imperative import if you don't want the provider:

```ts
import { presentSheet } from '@zennopay/react-native';

const result = await presentSheet({
  intentId,
  sessionJwt,
  config: { environment: 'staging' },
});
```

### Reopening a receipt

`presentReceipt(...)` presents the **authoritative** native receipt for a
payment intent — the same receipt / pending / failure screens the sheet shows
at the end of a payment — so users can reopen "view receipt" from your history.
The native SDK fetches the receipt, polls a pending receipt through to a
terminal state, shows refund copy when the intent was refunded, and re-mints
the receipt token via `refreshReceiptToken` on a `401` mid-poll. It is
read-only, so the promise resolves with no value once the user dismisses it
(and is available on the `useZennopay()` hook too).

```tsx
import { useZennopay } from '@zennopay/react-native';

function ViewReceiptButton({ intentId }: { intentId: string }) {
  const { presentReceipt } = useZennopay();

  const onViewReceipt = async () => {
    const { receiptToken } = await walletApi.mintReceiptToken(intentId);

    await presentReceipt({
      intentId,
      receiptToken,
      refreshReceiptToken: async (id) => {
        // Called on receipt-token expiry (401 mid-poll): re-mint for the
        // SAME intent, or return null if you can't.
        const refreshed = await walletApi.mintReceiptToken(id);
        return refreshed.receiptToken ?? null;
      },
    });
    // Resolves when the user dismisses the receipt — no PaymentResult to handle.
  };

  return <Button title="View receipt" onPress={onViewReceipt} />;
}
```

The promise **rejects** only for integration errors (`no_presentation_context`
on iOS / `no_activity` on Android). A payment failure resolves normally with
`{ status: 'failed', error }`, where `error.code` is a stable string from the
shared taxonomy (`invalid_jwt`, `intent_mismatch`, `jwt_expired`,
`quote_expired`, `limit_exceeded`, `network_error`, `timed_out`, …).
`pending` means status polling timed out — the payment may still settle;
reconcile via your webhook or transaction history.

### Theming

Theming is a plain JS object, serialized to the native `ZennopayAppearance`:

```ts
await presentSheet({
  intentId: session.intentId,
  sessionJwt: session.sessionJwt,
  appearance: {
    mode: 'automatic',
    colors: {
      primary: '#1B4FD8',
      dark: { primary: '#6E8EF5' },          // per-mode overrides
    },
    cornerRadius: { card: 10, slide: 12 },   // clamped to <= 12 natively
    primaryButton: { background: '#1B4FD8', textColor: '#FFFFFF', cornerRadius: 10 },
  },
});
```

Omit `appearance` for the default Zennopay look with system light/dark.

## How the bridge works

- `presentSheet` calls the native module's `present(...)`, which wraps
  `Zennopay.presentCheckout` on each platform and resolves exactly once with
  the terminal result.
- `presentReceipt` calls the native module's `presentReceipt(...)`, which wraps
  `Zennopay.presentReceipt` on each platform and resolves once the read-only
  receipt is dismissed.
- `refreshSession` / `refreshReceiptToken` are serviced over an event + reply:
  the native side emits `ZennopaySessionExpired` / `ZennopayReceiptTokenExpired`
  `{ intentId }`, the bridge runs your async callback, and replies with the
  fresh token — the bridge never blocks.
- The session JWT crosses the bridge once, into native memory; it is never
  placed in a URL. Confirm idempotency, retries, and relaunch recovery are
  owned by the native SDKs.

## Testing

On a simulator/emulator there is no usable camera — the native sheet falls
back to paste-QR; paste any VietQR payload string. If the module fails to
resolve at runtime, re-run `pod install` / a full Gradle build and rebuild the
app (a Metro-only reload does not pick up native changes).

## Versioning

Zennopay SDKs follow [semver](https://semver.org). `v0.x` releases are
pre-GA: minor versions may contain breaking API changes, called out in the
[CHANGELOG](CHANGELOG.md). **0.5.0** links the native SDKs so `presentSheet`
and `presentReceipt` invoke the real native PaymentSheet, and aligns the
version line with the iOS / Android / Flutter SDKs (no breaking API changes).

All four Zennopay SDKs — [iOS](https://github.com/Zennopay/zennopay-ios-sdk),
[Android](https://github.com/Zennopay/zennopay-android-sdk),
[Flutter](https://github.com/Zennopay/zennopay-flutter-sdk), and React Native —
release in lockstep: the same `vX.Y.Z` tag and GitHub Release is cut in each
repo per release. These standalone repos are release mirrors (squashed
release commits, not full development history).

## License

MIT — see [LICENSE](LICENSE).
