#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

// Exposes the Swift `ZennopayReactNative` (RCTEventEmitter) to the RN bridge.
// On the new architecture the TurboModule spec (src/NativeZennopay.ts) drives
// codegen; this legacy declaration keeps the module usable on the old bridge
// too (interop-compatible, spec §12.7).
@interface RCT_EXTERN_MODULE(ZennopayReactNative, RCTEventEmitter)

RCT_EXTERN_METHOD(present:(NSString *)intentId
                  sessionJwt:(NSString *)sessionJwt
                  configJson:(NSString *)configJson
                  appearanceJson:(NSString *)appearanceJson
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(provideRefreshedSession:(NSString *)intentId
                  jwt:(NSString *)jwt)

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

@end
