package com.zennopay.reactnative

import androidx.activity.ComponentActivity
import androidx.compose.ui.unit.dp
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.zennopay.sdk.PaymentResult
import com.zennopay.sdk.Zennopay
import com.zennopay.sdk.ZennopayConfig
import com.zennopay.sdk.ZennopayError
import com.zennopay.sdk.ui.ZennopayAppearance
import kotlinx.coroutines.CompletableDeferred
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/**
 * React Native bridge for the Zennopay PaymentSheet.
 *
 * Wraps `com.zennopay.sdk.Zennopay.presentCheckout` / `presentReceipt` against
 * the current Activity and resolves the JS promise exactly once with a
 * JSON-encoded [PaymentResult]. It renders no UI itself — the native SDK owns
 * scan / amount / confirm / status / receipt.
 *
 * `refreshSession` / `refreshReceiptToken` are serviced asynchronously: native
 * emits `ZennopaySessionExpired` / `ZennopayReceiptTokenExpired` `{ intentId }`;
 * JS replies via [provideRefreshedSession] / [provideRefreshedReceiptToken].
 */
class ZennopayReactNativeModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  /** Pending refreshSession round-trips keyed by intent id. */
  private val pendingRefresh = ConcurrentHashMap<String, CompletableDeferred<String?>>()

  /** Pending refreshReceiptToken round-trips keyed by intent id. */
  private val pendingReceiptRefresh = ConcurrentHashMap<String, CompletableDeferred<String?>>()

  override fun getName(): String = NAME

  @ReactMethod
  fun present(
    intentId: String,
    sessionJwt: String,
    configJson: String,
    appearanceJson: String,
    promise: Promise,
  ) {
    val activity = currentActivity as? ComponentActivity
    if (activity == null) {
      promise.reject(
        "no_activity",
        "No current ComponentActivity to present the Zennopay sheet.",
      )
      return
    }

    val config = parseConfig(configJson)
    val appearance = parseAppearance(appearanceJson)

    activity.runOnUiThread {
      Zennopay.presentCheckout(
        activity = activity,
        intentId = intentId,
        sessionJwt = sessionJwt,
        refreshSession = { intent -> requestRefreshedSession(intent) },
        appearance = appearance,
        config = config,
      ) { result ->
        promise.resolve(resultJson(result, intentId))
      }
    }
  }

  @ReactMethod
  fun presentReceipt(
    intentId: String,
    receiptToken: String,
    configJson: String,
    appearanceJson: String,
    promise: Promise,
  ) {
    val activity = currentActivity as? ComponentActivity
    if (activity == null) {
      promise.reject(
        "no_activity",
        "No current ComponentActivity to present the Zennopay receipt.",
      )
      return
    }

    val config = parseConfig(configJson)
    val appearance = parseAppearance(appearanceJson)

    activity.runOnUiThread {
      Zennopay.presentReceipt(
        activity = activity,
        intentId = intentId,
        receiptToken = receiptToken,
        refreshReceiptToken = { intent -> requestRefreshedReceiptToken(intent) },
        config = config,
        appearance = appearance,
      ) {
        // Read-only surface: resolve once the user dismisses the receipt.
        promise.resolve("")
      }
    }
  }

  /** Fired by the native SDK on 401/expiry: ask JS for a fresh JWT. */
  private suspend fun requestRefreshedSession(intentId: String): String? {
    val deferred = CompletableDeferred<String?>()
    pendingRefresh[intentId] = deferred
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("ZennopaySessionExpired", Arguments.createMap().apply {
        putString("intentId", intentId)
      })
    return deferred.await()
  }

  /** JS reply carrying the freshly minted JWT (or null). */
  @ReactMethod
  fun provideRefreshedSession(intentId: String, jwt: String?) {
    pendingRefresh.remove(intentId)?.complete(jwt)
  }

  /** Fired by the native SDK on a 401 mid-poll on the receipt: ask JS for a
   * fresh receipt token. */
  private suspend fun requestRefreshedReceiptToken(intentId: String): String? {
    val deferred = CompletableDeferred<String?>()
    pendingReceiptRefresh[intentId] = deferred
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("ZennopayReceiptTokenExpired", Arguments.createMap().apply {
        putString("intentId", intentId)
      })
    return deferred.await()
  }

  /** JS reply carrying the freshly minted receipt token (or null). */
  @ReactMethod
  fun provideRefreshedReceiptToken(intentId: String, token: String?) {
    pendingReceiptRefresh.remove(intentId)?.complete(token)
  }

  // Required for RN NativeEventEmitter (no-op; events fire via the emitter).
  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit

  // ---- codec: JS dicts <-> native config / appearance / result --------------

  /**
   * `{ environment?: 'sandbox'|'production', apiBaseUrl?: string }`.
   * `'staging'` is accepted as a deprecated alias for `'sandbox'`.
   */
  private fun parseConfig(json: String): ZennopayConfig {
    val o = runCatching { JSONObject(json) }.getOrNull() ?: return sandboxConfig()
    val base = o.optString("apiBaseUrl").takeIf { it.isNotBlank() }
    if (base != null) {
      return ZennopayConfig(
        apiBaseUrl = base,
        environment = ZennopayConfig.Environment.CUSTOM,
      )
    }
    return when (o.optString("environment")) {
      "production" -> ZennopayConfig.PRODUCTION
      else -> sandboxConfig()
    }
  }

  /**
   * Sandbox preset with the partner-facing host. Constructed explicitly (rather
   * than a native `SANDBOX` companion) so the bridge builds against the pinned
   * native SDK version regardless of which release introduced that companion;
   * the sheet still shows the sandbox chrome (non-production environment).
   */
  private fun sandboxConfig(): ZennopayConfig = ZennopayConfig(
    apiBaseUrl = "https://api.sandbox.zennopay.in",
    environment = ZennopayConfig.Environment.STAGING,
  )

  private fun parseAppearance(json: String): ZennopayAppearance {
    val o = runCatching { JSONObject(json) }.getOrNull() ?: return ZennopayAppearance.Automatic

    val mode = when (o.optString("mode")) {
      "light" -> ZennopayAppearance.Mode.Light
      "dark" -> ZennopayAppearance.Mode.Dark
      else -> ZennopayAppearance.Mode.Automatic
    }

    val defaults = ZennopayAppearance.Colors()
    val colors = o.optJSONObject("colors")?.let { c ->
      ZennopayAppearance.Colors(
        primary = parseColor(c, "primary", defaults.primary),
        background = parseColor(c, "background", defaults.background),
        surface = parseColor(c, "surface", defaults.surface),
        textPrimary = parseColor(c, "textPrimary", defaults.textPrimary),
        textSecondary = parseColor(c, "textSecondary", defaults.textSecondary),
        textTertiary = parseColor(c, "textTertiary", defaults.textTertiary),
        border = parseColor(c, "border", defaults.border),
        success = parseColor(c, "success", defaults.success),
        pending = parseColor(c, "pending", defaults.pending),
        failure = parseColor(c, "failure", defaults.failure),
      )
    } ?: defaults

    val shapeDefaults = ZennopayAppearance.Shapes()
    val shapes = o.optJSONObject("cornerRadius")?.let { cr ->
      ZennopayAppearance.Shapes(
        input = cr.optDouble("input", shapeDefaults.input.value.toDouble()).toFloat().dp,
        card = cr.optDouble("card", shapeDefaults.card.value.toDouble()).toFloat().dp,
        slide = cr.optDouble("slide", shapeDefaults.slide.value.toDouble()).toFloat().dp,
      )
    } ?: shapeDefaults

    val typography = o.optJSONObject("font")?.let { f ->
      // Mapping a JS font family name to a Compose FontFamily requires the font
      // to be bundled by the host; only the Dynamic-Type scale is honored here.
      ZennopayAppearance.Typography(scale = f.optDouble("scale", 1.0).toFloat())
    } ?: ZennopayAppearance.Typography()

    val buttonDefaults = ZennopayAppearance.PrimaryButton()
    val primaryButton = o.optJSONObject("primaryButton")?.let { p ->
      ZennopayAppearance.PrimaryButton(
        background = parseColor(p, "background", buttonDefaults.background),
        textColor = parseColor(p, "textColor", buttonDefaults.textColor),
        cornerRadius = p.optDouble(
          "cornerRadius",
          buttonDefaults.cornerRadius.value.toDouble(),
        ).toFloat().dp,
      )
    } ?: buttonDefaults

    // Logo is a @DrawableRes on Android; a JS URI string can't be resolved to a
    // drawable resource id here, so a partner logo is not mapped on Android.
    return ZennopayAppearance(
      mode = mode,
      colors = colors,
      shapes = shapes,
      typography = typography,
      primaryButton = primaryButton,
    )
  }

  private fun parseColor(o: JSONObject, key: String, fallback: Long): Long {
    val s = o.optString(key).takeIf { it.isNotBlank() } ?: return fallback
    return hexToArgb(s) ?: fallback
  }

  /** Parse `#RGB` / `#RRGGBB` / `#RRGGBBAA` (alpha included) into a packed ARGB Long. */
  private fun hexToArgb(hex: String): Long? {
    var s = hex.trim().removePrefix("#")
    if (s.length == 3) s = s.map { "$it$it" }.joinToString("")
    return when (s.length) {
      6 -> "FF$s".toLongOrNull(16)
      8 -> s.toLongOrNull(16)
      else -> null
    }
  }

  private fun resultJson(result: PaymentResult, intentId: String): String {
    val obj = JSONObject()
    when (result) {
      is PaymentResult.Completed -> {
        obj.put("status", "completed")
        obj.put("intentId", result.intentId)
      }
      is PaymentResult.Pending -> {
        obj.put("status", "pending")
        obj.put("intentId", result.intentId)
      }
      is PaymentResult.Canceled -> {
        obj.put("status", "canceled")
        obj.put("intentId", result.intentId ?: intentId)
      }
      is PaymentResult.Failed -> {
        obj.put("status", "failed")
        obj.put("intentId", result.intentId ?: intentId)
        obj.put("error", JSONObject().put("code", mapErrorCode(result.error)))
      }
    }
    return obj.toString()
  }

  /** Collapse the native error taxonomy onto the stable JS error codes. */
  private fun mapErrorCode(error: ZennopayError): String = when (error) {
    ZennopayError.InvalidJwt,
    ZennopayError.MalformedToken,
    ZennopayError.InvalidIssuer,
    ZennopayError.MissingIntentId -> "invalid_jwt"
    ZennopayError.IntentMismatch,
    ZennopayError.IntentIdMismatch -> "intent_mismatch"
    ZennopayError.JwtExpired -> "jwt_expired"
    ZennopayError.CameraPermissionDenied -> "camera_denied"
    ZennopayError.QrUndecodable,
    ZennopayError.ScanValidationFailed -> "qr_invalid"
    ZennopayError.QuoteExpired,
    ZennopayError.QuoteMismatch,
    ZennopayError.QuoteSuperseded -> "quote_expired"
    ZennopayError.NotScanned,
    ZennopayError.InvalidState -> "confirm_failed"
    ZennopayError.DynamicAmountOverride -> "amount_not_allowed"
    ZennopayError.JtiReplay -> "jti_replay"
    ZennopayError.SessionRefreshFailed -> "session_refresh_failed"
    ZennopayError.Unauthorized -> "unauthorized"
    ZennopayError.PaymentDeclined -> "payment_declined"
    ZennopayError.PollingTimeout -> "timed_out"
    is ZennopayError.NetworkError -> "network_error"
    is ZennopayError.Unknown -> "network_error"
  }

  companion object {
    const val NAME = "ZennopayReactNative"
  }
}
