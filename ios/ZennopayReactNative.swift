import Foundation
import React
// The native Zennopay iOS SDK (ios-sdk/Sources/Zennopay) that renders the
// PaymentSheet and exposes `Zennopay.presentCheckout(...)`.
// import Zennopay

/// React Native bridge for the Zennopay PaymentSheet.
///
/// This is a NATIVE BRIDGE stub: it wraps `Zennopay.presentCheckout` from the
/// native iOS SDK (built in parallel) and resolves the JS promise exactly once
/// with a JSON-encoded `PaymentResult`. It does not render any UI itself — the
/// native SDK owns scan / amount / confirm / status.
///
/// Emits `ZennopaySessionExpired` so JS can service `refreshSession` without a
/// synchronous bridge hop, and receives the fresh JWT via
/// `provideRefreshedSession`.
@objc(ZennopayReactNative)
final class ZennopayReactNative: RCTEventEmitter {

  private var hasListeners = false
  /// Pending `refreshSession` continuations keyed by intent id.
  private var pendingRefresh: [String: (String?) -> Void] = [:]

  override static func requiresMainQueueSetup() -> Bool { true }

  override func supportedEvents() -> [String]! { ["ZennopaySessionExpired"] }

  override func startObserving() { hasListeners = true }
  override func stopObserving() { hasListeners = false }

  // MARK: - present

  @objc(present:sessionJwt:configJson:appearanceJson:resolver:rejecter:)
  func present(
    _ intentId: String,
    sessionJwt: String,
    configJson: String,
    appearanceJson: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      guard let presenter = RCTPresentedViewController() else {
        reject("no_presentation_context",
               "No view controller available to present the Zennopay sheet.",
               nil)
        return
      }

      // Decode the serialized config + appearance passed from JS.
      let config = ZennopayBridgeCodec.config(from: configJson)
      let appearance = ZennopayBridgeCodec.appearance(from: appearanceJson)

      // Wire the native SDK entrypoint. Uncomment once the native SDK is linked.
      /*
      Zennopay.presentCheckout(
        from: presenter,
        intentID: intentId,
        sessionJWT: sessionJwt,
        refreshSession: { [weak self] intent in
          await self?.requestRefreshedSession(for: intent)
        },
        appearance: appearance,
        config: config
      ) { result in
        resolve(ZennopayBridgeCodec.json(from: result, intentId: intentId))
      }
      */

      // Bridge stub: fail fast until the native SDK is linked, so integration
      // wiring is testable end-to-end without a silent no-op.
      _ = (presenter, config, appearance)
      reject("native_sdk_unavailable",
             "The native Zennopay iOS SDK is not linked yet.",
             nil)
    }
  }

  // MARK: - refreshSession round-trip

  /// Fired by the native SDK on 401/expiry: ask JS for a fresh JWT.
  private func requestRefreshedSession(for intentId: String) async -> String? {
    guard hasListeners else { return nil }
    return await withCheckedContinuation { continuation in
      DispatchQueue.main.async {
        self.pendingRefresh[intentId] = { jwt in continuation.resume(returning: jwt) }
        self.sendEvent(withName: "ZennopaySessionExpired", body: ["intentId": intentId])
      }
    }
  }

  /// JS reply carrying the freshly minted JWT (or null).
  @objc(provideRefreshedSession:jwt:)
  func provideRefreshedSession(_ intentId: String, jwt: String?) {
    DispatchQueue.main.async {
      let resume = self.pendingRefresh.removeValue(forKey: intentId)
      resume?(jwt)
    }
  }
}

/// Placeholder codec for serialized config / appearance / result. The real
/// implementation maps to the native SDK's `ZennopayConfig`, `ZennopayAppearance`,
/// and `PaymentResult` types.
enum ZennopayBridgeCodec {
  static func config(from json: String) -> [String: Any] {
    guard let data = json.data(using: .utf8),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return [:] }
    return obj
  }

  static func appearance(from json: String) -> [String: Any] {
    config(from: json)
  }
}
