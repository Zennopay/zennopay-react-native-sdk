package com.zennopay.reactnative

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.CompletableDeferred
import java.util.concurrent.ConcurrentHashMap
// The native Zennopay Android SDK (android-sdk, com.zennopay:sdk) that renders
// the PaymentSheet and exposes `Zennopay.presentCheckout(...)`.
// import com.zennopay.sdk.Zennopay

/**
 * React Native bridge for the Zennopay PaymentSheet.
 *
 * NATIVE BRIDGE stub: wraps `com.zennopay.sdk.Zennopay.presentCheckout` against
 * the current Activity and resolves the JS promise exactly once with a
 * JSON-encoded [PaymentResult]. It renders no UI itself — the native SDK owns
 * scan / amount / confirm / status.
 *
 * `refreshSession` is serviced asynchronously: native emits
 * `ZennopaySessionExpired` `{ intentId }`; JS replies via
 * [provideRefreshedSession].
 */
class ZennopayReactNativeModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  /** Pending refreshSession round-trips keyed by intent id. */
  private val pendingRefresh = ConcurrentHashMap<String, CompletableDeferred<String?>>()

  override fun getName(): String = NAME

  @ReactMethod
  fun present(
    intentId: String,
    sessionJwt: String,
    configJson: String,
    appearanceJson: String,
    promise: Promise,
  ) {
    val activity = currentActivity
    if (activity == null) {
      promise.reject(
        "no_presentation_context",
        "No current Activity to present the Zennopay sheet.",
      )
      return
    }

    // Decode the serialized config + appearance passed from JS.
    // val config = ZennopayBridgeCodec.config(configJson)
    // val appearance = ZennopayBridgeCodec.appearance(appearanceJson)

    // Wire the native SDK entrypoint. Uncomment once the native SDK is linked.
    /*
    Zennopay.presentCheckout(
      activity = activity as ComponentActivity,
      intentId = intentId,
      sessionJwt = sessionJwt,
      refreshSession = { intent -> requestRefreshedSession(intent) },
      appearance = appearance,
      config = config,
    ) { result ->
      promise.resolve(ZennopayBridgeCodec.json(result, intentId))
    }
    */

    // Bridge stub: fail fast until the native SDK is linked so integration
    // wiring is testable end-to-end without a silent no-op.
    promise.reject(
      "native_sdk_unavailable",
      "The native Zennopay Android SDK is not linked yet.",
    )
  }

  /** Fired by the native SDK on 401/expiry: ask JS for a fresh JWT. */
  private suspend fun requestRefreshedSession(intentId: String): String? {
    val deferred = CompletableDeferred<String?>()
    pendingRefresh[intentId] = deferred
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("ZennopaySessionExpired", com.facebook.react.bridge.Arguments.createMap().apply {
        putString("intentId", intentId)
      })
    return deferred.await()
  }

  /** JS reply carrying the freshly minted JWT (or null). */
  @ReactMethod
  fun provideRefreshedSession(intentId: String, jwt: String?) {
    pendingRefresh.remove(intentId)?.complete(jwt)
  }

  // Required for RN NativeEventEmitter (no-op; events fire via the emitter).
  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit

  companion object {
    const val NAME = "ZennopayReactNative"
  }
}
