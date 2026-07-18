import Foundation
import React
#if canImport(UIKit)
import UIKit
#endif
// The native Zennopay iOS SDK (CocoaPods `Zennopay ~> 0.3.0`) that renders the
// PaymentSheet + receipt and exposes `Zennopay.presentCheckout(...)` /
// `Zennopay.presentReceipt(...)`.
import Zennopay

/// React Native bridge for the Zennopay PaymentSheet.
///
/// A NATIVE BRIDGE: it wraps `Zennopay.presentCheckout` / `Zennopay.presentReceipt`
/// from the native iOS SDK and resolves the JS promise exactly once with a
/// JSON-encoded `PaymentResult`. It does not render any UI itself — the native
/// SDK owns scan / amount / confirm / status / receipt.
///
/// Emits `ZennopaySessionExpired` so JS can service `refreshSession` without a
/// synchronous bridge hop, and receives the fresh JWT via
/// `provideRefreshedSession` (and the receipt-token equivalents).
@objc(ZennopayReactNative)
final class ZennopayReactNative: RCTEventEmitter {

  private var hasListeners = false
  /// Pending `refreshSession` continuations keyed by intent id.
  private var pendingRefresh: [String: (String?) -> Void] = [:]
  /// Pending `refreshReceiptToken` continuations keyed by intent id.
  private var pendingReceiptRefresh: [String: (String?) -> Void] = [:]

  override static func requiresMainQueueSetup() -> Bool { true }

  override func supportedEvents() -> [String]! {
    ["ZennopaySessionExpired", "ZennopayReceiptTokenExpired"]
  }

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
    Task { @MainActor [weak self] in
      guard let self else { return }
      guard let presenter = RCTPresentedViewController() else {
        reject("no_presentation_context",
               "No view controller available to present the Zennopay sheet.",
               nil)
        return
      }

      // Decode the serialized config + appearance passed from JS.
      let config = ZennopayBridgeCodec.config(from: configJson)
      let appearance = ZennopayBridgeCodec.appearance(from: appearanceJson)

      Zennopay.presentCheckout(
        from: presenter,
        intentID: intentId,
        sessionJWT: sessionJwt,
        refreshSession: { [weak self] intent in
          guard let self else { return nil }
          return await self.requestRefreshedSession(for: intent)
        },
        appearance: appearance,
        config: config
      ) { result in
        resolve(ZennopayBridgeCodec.json(from: result, intentId: intentId))
      }
    }
  }

  // MARK: - presentReceipt

  @objc(presentReceipt:receiptToken:configJson:appearanceJson:resolver:rejecter:)
  func presentReceipt(
    _ intentId: String,
    receiptToken: String,
    configJson: String,
    appearanceJson: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Task { @MainActor [weak self] in
      guard let self else { return }
      guard let presenter = RCTPresentedViewController() else {
        reject("no_presentation_context",
               "No view controller available to present the Zennopay receipt.",
               nil)
        return
      }

      // Decode the serialized config + appearance passed from JS.
      let config = ZennopayBridgeCodec.config(from: configJson)
      let appearance = ZennopayBridgeCodec.appearance(from: appearanceJson)

      Zennopay.presentReceipt(
        from: presenter,
        intentID: intentId,
        receiptToken: receiptToken,
        refreshReceiptToken: { [weak self] intent in
          guard let self else { return nil }
          return await self.requestRefreshedReceiptToken(for: intent)
        },
        config: config,
        appearance: appearance
      ) {
        // Read-only surface: resolve once the user dismisses the receipt.
        resolve("")
      }
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

  // MARK: - refreshReceiptToken round-trip

  /// Fired by the native SDK on a 401 mid-poll on the receipt: ask JS for a
  /// fresh receipt token.
  private func requestRefreshedReceiptToken(for intentId: String) async -> String? {
    guard hasListeners else { return nil }
    return await withCheckedContinuation { continuation in
      DispatchQueue.main.async {
        self.pendingReceiptRefresh[intentId] = { token in
          continuation.resume(returning: token)
        }
        self.sendEvent(withName: "ZennopayReceiptTokenExpired", body: ["intentId": intentId])
      }
    }
  }

  /// JS reply carrying the freshly minted receipt token (or null).
  @objc(provideRefreshedReceiptToken:token:)
  func provideRefreshedReceiptToken(_ intentId: String, token: String?) {
    DispatchQueue.main.async {
      let resume = self.pendingReceiptRefresh.removeValue(forKey: intentId)
      resume?(token)
    }
  }
}

/// Maps the serialized JS config / appearance dicts onto the native SDK's
/// `ZennopayConfig` / `ZennopayAppearance`, and a `PaymentResult` back onto the
/// JS `PaymentResult` JSON payload.
enum ZennopayBridgeCodec {

  // MARK: JSON helpers

  private static func object(from json: String) -> [String: Any] {
    guard let data = json.data(using: .utf8),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return [:] }
    return obj
  }

  // MARK: Config

  /// `{ environment?: 'staging'|'production', apiBaseUrl?: string }`.
  static func config(from json: String) -> ZennopayConfig {
    let dict = object(from: json)
    if let base = dict["apiBaseUrl"] as? String,
       !base.isEmpty,
       let url = URL(string: base) {
      return ZennopayConfig(apiBaseURL: url)
    }
    if let env = dict["environment"] as? String, env == "production",
       let url = URL(string: "https://api.zennopay.com") {
      return ZennopayConfig(apiBaseURL: url)
    }
    return .staging
  }

  // MARK: Appearance

  static func appearance(from json: String) -> ZennopayAppearance {
    let dict = object(from: json)
    var appearance = ZennopayAppearance()

    if let mode = dict["mode"] as? String {
      switch mode {
      case "light": appearance.mode = .light
      case "dark": appearance.mode = .dark
      default: appearance.mode = .automatic
      }
    }

    if let colors = dict["colors"] as? [String: Any] {
      let dark = colors["dark"] as? [String: Any]
      var c = appearance.colors
      func set(_ key: String, _ apply: (UIColor) -> Void) {
        if let col = color(light: colors[key] as? String, dark: dark?[key] as? String) {
          apply(col)
        }
      }
      set("primary") { c.primary = $0 }
      set("background") { c.background = $0 }
      set("surface") { c.surface = $0 }
      set("textPrimary") { c.textPrimary = $0 }
      set("textSecondary") { c.textSecondary = $0 }
      set("textTertiary") { c.textTertiary = $0 }
      set("border") { c.border = $0 }
      set("success") { c.success = $0 }
      set("pending") { c.pending = $0 }
      set("failure") { c.failure = $0 }
      appearance.colors = c
    }

    if let cr = dict["cornerRadius"] as? [String: Any] {
      let input = cgFloat(cr["input"]) ?? appearance.cornerRadius.input
      let card = cgFloat(cr["card"]) ?? appearance.cornerRadius.card
      let slide = cgFloat(cr["slide"]) ?? appearance.cornerRadius.slide
      appearance.cornerRadius = ZennopayAppearance.CornerRadius(
        input: input, card: card, slide: slide
      )
    }

    if let f = dict["font"] as? [String: Any] {
      let family = (f["family"] as? String) ?? appearance.font.family
      let scale = cgFloat(f["scale"]) ?? appearance.font.scale
      appearance.font = ZennopayAppearance.Font(family: family, scale: scale)
    }

    if let pb = dict["primaryButton"] as? [String: Any] {
      let bg = color(light: pb["background"] as? String, dark: nil)
        ?? appearance.primaryButton.background
      let textColor = color(light: pb["textColor"] as? String, dark: nil)
        ?? appearance.primaryButton.textColor
      let radius = cgFloat(pb["cornerRadius"]) ?? appearance.primaryButton.cornerRadius
      appearance.primaryButton = ZennopayAppearance.PrimaryButton(
        background: bg, textColor: textColor, cornerRadius: radius
      )
    }

    // Logo: only local file paths are loaded synchronously; a remote URI is not
    // fetched here (that would block the main thread) — the header falls back to
    // the corridor branding.
    if let logo = dict["logo"] as? String, let image = loadImage(logo) {
      appearance.logo = image
    }

    return appearance
  }

  // MARK: Result

  static func json(from result: PaymentResult, intentId: String) -> String {
    var obj: [String: Any] = ["intentId": result.intentID]
    switch result {
    case .completed:
      obj["status"] = "completed"
    case .canceled:
      obj["status"] = "canceled"
    case .pending:
      obj["status"] = "pending"
    case let .failed(_, error):
      obj["status"] = "failed"
      obj["error"] = ["code": errorCode(for: error)]
    }
    if let data = try? JSONSerialization.data(withJSONObject: obj),
       let string = String(data: data, encoding: .utf8) {
      return string
    }
    return "{\"status\":\"failed\",\"intentId\":\"\(intentId)\",\"error\":{\"code\":\"network_error\"}}"
  }

  /// Collapse the native error taxonomy onto the stable JS error codes.
  private static func errorCode(for error: ZennopayError) -> String {
    switch error {
    case .invalidJWT, .malformedToken, .jwtMissingClaim: return "invalid_jwt"
    case .intentMismatch: return "intent_mismatch"
    case .jwtExpired: return "jwt_expired"
    case .sessionExpired: return "session_refresh_failed"
    case .confirmReplay: return "jti_replay"
    case .invalidQRCode: return "qr_invalid"
    case .quoteExpired: return "quote_expired"
    case .paymentFailed: return "payment_declined"
    case .userCanceled: return "canceled"
    case .cameraPermissionDenied: return "camera_denied"
    case .timedOut: return "timed_out"
    case .presentationContextMissing: return "network_error"
    case .networkError: return "network_error"
    case .serverError: return "network_error"
    }
  }

  // MARK: Color / number helpers

  private static func cgFloat(_ value: Any?) -> CGFloat? {
    if let n = value as? NSNumber { return CGFloat(truncating: n) }
    if let d = value as? Double { return CGFloat(d) }
    return nil
  }

  /// Build a `UIColor` from optional light/dark CSS-hex strings. Returns a
  /// dynamic (trait-resolving) color when both are supplied, a static color when
  /// only one is, and nil when neither parses (keeping the default).
  private static func color(light: String?, dark: String?) -> UIColor? {
    let l = light.flatMap(rgb(from:))
    let d = dark.flatMap(rgb(from:))
    switch (l, d) {
    case let (l?, d?): return UIColor(zpLight: l, zpDark: d)
    case let (l?, nil): return UIColor(zpRGB: l)
    case let (nil, d?): return UIColor(zpRGB: d)
    default: return nil
    }
  }

  /// Parse `#RGB` / `#RRGGBB` / `#RRGGBBAA` (alpha ignored) into a packed
  /// `0xRRGGBB`.
  private static func rgb(from hex: String) -> UInt32? {
    var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if s.hasPrefix("#") { s.removeFirst() }
    if s.count == 3 {
      s = s.map { "\($0)\($0)" }.joined()
    }
    guard s.count >= 6 else { return nil }
    return UInt32(s.prefix(6), radix: 16)
  }

  private static func loadImage(_ uri: String) -> UIImage? {
    if uri.hasPrefix("file://"), let url = URL(string: uri) {
      return UIImage(contentsOfFile: url.path)
    }
    if uri.hasPrefix("/") {
      return UIImage(contentsOfFile: uri)
    }
    return nil
  }
}
