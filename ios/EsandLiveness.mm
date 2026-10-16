#import "EsandLiveness.h"
#import <EsLivingDetection/EsLivingDetection.h>

static NSString *const EsandDiagnosticCurrentKey = @"esand.liveness.diagnostic.current";
static NSString *const EsandDiagnosticPreviousKey = @"esand.liveness.diagnostic.previous";
static NSString *const EsandPackageVersion = @"0.1.0";
static NSUInteger const EsandMaxTraceLength = 12000;

@interface EsandLiveness ()
@property(nonatomic, assign) BOOL operationInProgress;
@property(nonatomic, assign) BOOL initialized;
@end

@implementation EsandLiveness

- (void)prepare:(RCTPromiseResolveBlock)resolve
         reject:(RCTPromiseRejectBlock)reject
{
  NSString *callId = [NSUUID UUID].UUIDString;
  NSTimeInterval startedAt = NSDate.date.timeIntervalSince1970 * 1000;
  if (![self beginOperation:@"prepare" callId:callId startedAt:startedAt reject:reject]) {
    return;
  }

  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    @try {
      [EsLivingDetectionManager InitEngine];
      [self appendDiagnostic:@"prepare" callId:callId stage:@"native-prepare-complete" startedAt:startedAt detail:@""];
      resolve(nil);
    } @catch (NSException *exception) {
      [self appendDiagnostic:@"prepare" callId:callId stage:@"native-exception" startedAt:startedAt detail:exception.name];
      reject(@"native_bridge_error", exception.reason ?: @"Native preparation failed.", nil);
    } @finally {
      [self finishOperation];
    }
  });
}

- (void)initialize:(NSDictionary *)config
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject
{
  NSString *callId = [NSUUID UUID].UUIDString;
  NSTimeInterval startedAt = NSDate.date.timeIntervalSince1970 * 1000;
  if (![self beginOperation:@"initialize" callId:callId startedAt:startedAt reject:reject]) {
    return;
  }

  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    @try {
      NSArray *actions = config[@"actions"];
      NSInteger livingType = [self encodeActions:actions];
      [self applyConfiguration:config];
      [self appendDiagnostic:@"initialize" callId:callId stage:@"native-initialize-start" startedAt:startedAt detail:@""];

      EsLivingDetectResult *nativeResult = [EsLivingDetectionManager verifyInit:(int)livingType];
      NSString *nativeCode = [self safeString:[nativeResult getCodeStr]];
      self.initialized = [nativeCode isEqualToString:@"ELD_SUCCESS"] || [nativeCode isEqualToString:@"0"];
      [self appendDiagnostic:@"initialize" callId:callId stage:@"native-initialize-complete" startedAt:startedAt detail:[NSString stringWithFormat:@"code=%@", nativeCode]];
      resolve([self initializeResult:nativeResult callId:callId]);
    } @catch (NSException *exception) {
      self.initialized = NO;
      [self appendDiagnostic:@"initialize" callId:callId stage:@"native-exception" startedAt:startedAt detail:exception.name];
      reject(@"native_bridge_error", exception.reason ?: @"Native initialization failed.", nil);
    } @finally {
      [self finishOperation];
    }
  });
}

- (void)startDetection:(NSDictionary *)options
               resolve:(RCTPromiseResolveBlock)resolve
                reject:(RCTPromiseRejectBlock)reject
{
  if (!self.initialized) {
    reject(@"not_initialized", @"initialize() must complete successfully first.", nil);
    return;
  }

  NSString *camera = [self safeString:options[@"camera"]];
  if (camera.length > 0 && ![camera isEqualToString:@"front"]) {
    reject(@"unsupported_option", @"The supplied iOS SDK only exposes front-camera startup.", nil);
    return;
  }

  NSString *token = [[self safeString:options[@"token"]] stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
  if (token.length == 0) {
    reject(@"invalid_configuration", @"token must be a non-empty string.", nil);
    return;
  }

  NSString *callId = [NSUUID UUID].UUIDString;
  NSTimeInterval startedAt = NSDate.date.timeIntervalSince1970 * 1000;
  if (![self beginOperation:@"startDetection" callId:callId startedAt:startedAt reject:reject]) {
    return;
  }
  __block BOOL completed = NO;

  dispatch_async(dispatch_get_main_queue(), ^{
    UIViewController *viewController = [self topViewController];
    if (viewController == nil) {
      [self appendDiagnostic:@"startDetection" callId:callId stage:@"no-active-screen" startedAt:startedAt detail:@""];
      [self finishOperation];
      reject(@"no_active_screen", @"A foreground UIViewController is required.", nil);
      return;
    }

    @try {
      [self appendDiagnostic:@"startDetection" callId:callId stage:@"native-detection-start" startedAt:startedAt detail:@""];
      [EsLivingDetectionManager startDetect2:token
                              viewController:viewController
                                    callback:^(EsLivingDetectResult *nativeResult) {
        @synchronized (self) {
          if (completed) return;
          completed = YES;
        }
        NSString *nativeCode = [self safeString:[nativeResult getCodeStr]];
        [self appendDiagnostic:@"startDetection" callId:callId stage:@"native-detection-callback" startedAt:startedAt detail:[NSString stringWithFormat:@"code=%@", nativeCode]];
        resolve([self detectionResult:nativeResult callId:callId]);
        [self finishOperation];
      }
                            windowSwitchType:2];
    } @catch (NSException *exception) {
      @synchronized (self) {
        if (completed) return;
        completed = YES;
      }
      [self appendDiagnostic:@"startDetection" callId:callId stage:@"native-exception" startedAt:startedAt detail:exception.name];
      [self finishOperation];
      reject(@"native_bridge_error", exception.reason ?: @"Native detection failed.", nil);
    }
  });
}

- (void)getCapabilities:(RCTPromiseResolveBlock)resolve
                 reject:(RCTPromiseRejectBlock)reject
{
  resolve(@{
    @"platform": @"ios",
    @"actions": @[@"distance", @"blink", @"turn_head", @"nod", @"open_mouth", @"color_flash"],
    @"cameras": @[@"front"],
    @"languages": @[@"zh-CN", @"zh-TW", @"en", @"ja", @"ko", @"th"],
    @"supportsVideoRecording": @YES,
    @"supportsActionImages": @YES,
    @"supportsDiagnostics": @YES,
  });
}

- (void)getSdkVersion:(RCTPromiseResolveBlock)resolve
               reject:(RCTPromiseRejectBlock)reject
{
  resolve(@{
    @"platform": @"ios",
    @"version": [self safeString:[EsLivingDetectionManager getSdkVersion]],
  });
}

- (void)getDiagnosticInfo:(RCTPromiseResolveBlock)resolve
                   reject:(RCTPromiseRejectBlock)reject
{
  NSUserDefaults *defaults = NSUserDefaults.standardUserDefaults;
  resolve(@{
    @"current": [self parseTrace:[defaults stringForKey:EsandDiagnosticCurrentKey] ?: @""],
    @"previous": [self parseTrace:[defaults stringForKey:EsandDiagnosticPreviousKey] ?: @""],
  });
}

- (void)clearDiagnosticInfo:(RCTPromiseResolveBlock)resolve
                     reject:(RCTPromiseRejectBlock)reject
{
  NSUserDefaults *defaults = NSUserDefaults.standardUserDefaults;
  [defaults removeObjectForKey:EsandDiagnosticCurrentKey];
  [defaults removeObjectForKey:EsandDiagnosticPreviousKey];
  resolve(nil);
}

- (BOOL)beginOperation:(NSString *)api
                callId:(NSString *)callId
             startedAt:(NSTimeInterval)startedAt
                reject:(RCTPromiseRejectBlock)reject
{
  @synchronized (self) {
    if (self.operationInProgress) {
      reject(@"operation_in_progress", @"Another liveness operation is running.", nil);
      return NO;
    }
    self.operationInProgress = YES;
  }
  [self beginDiagnostic:api callId:callId startedAt:startedAt];
  return YES;
}

- (void)finishOperation
{
  @synchronized (self) {
    self.operationInProgress = NO;
  }
}

- (NSInteger)encodeActions:(NSArray *)actions
{
  if (![actions isKindOfClass:NSArray.class] || actions.count < 1 || actions.count > 4) {
    @throw [NSException exceptionWithName:@"InvalidConfiguration" reason:@"actions must contain between one and four items." userInfo:nil];
  }

  NSDictionary *codes = @{
    @"distance": @1,
    @"blink": @2,
    @"turn_head": @3,
    @"nod": @4,
    @"open_mouth": @5,
    @"color_flash": @6,
  };
  NSMutableSet *seen = [NSMutableSet set];
  NSMutableString *encoded = [NSMutableString string];
  for (NSString *action in actions) {
    NSNumber *code = codes[action];
    if (code == nil || [seen containsObject:action]) {
      @throw [NSException exceptionWithName:@"InvalidConfiguration" reason:@"actions contains an unsupported or duplicate value." userInfo:nil];
    }
    [seen addObject:action];
    [encoded appendString:code.stringValue];
  }
  return encoded.integerValue;
}

- (void)applyConfiguration:(NSDictionary *)config
{
  EsLivingConfig *nativeConfig = [EsLivingDetectionManager LivingConfigInstance];
  [nativeConfig SetIsRecordLdtVideo:[config[@"recordVideo"] boolValue]];
  [nativeConfig SetUseStrictMode:[config[@"strictMode"] boolValue]];
  [nativeConfig SetIsSaveImgEveryType:[config[@"saveActionImages"] boolValue]];
  [nativeConfig SetNavigateShow:[config[@"showNavigation"] boolValue]];
  [nativeConfig SetIsAutoUploadVerifyMsg:NO];
  [nativeConfig SetLanguage:[self languageValue:config[@"language"]]];

  NSDictionary *appearance = config[@"appearance"];
  if (![appearance isKindOfClass:NSDictionary.class]) {
    return;
  }
  EsLivingViewStyle *style = [EsLivingDetectionManager LivingViewStyleInstance];
  if (appearance[@"backgroundColor"]) [style setBackGroundColor:appearance[@"backgroundColor"]];
  if (appearance[@"textColor"]) [style setTextColor:appearance[@"textColor"]];
  if (appearance[@"progressBackgroundColor"]) [style setProgressBgColor:appearance[@"progressBackgroundColor"]];
  if (appearance[@"progressStartColor"]) [style setProgressStaGradient:appearance[@"progressStartColor"]];
  if (appearance[@"progressEndColor"]) [style setProgressEndGradient:appearance[@"progressEndColor"]];
  if (appearance[@"progressWidth"]) [style setProgressWidth:[appearance[@"progressWidth"] floatValue]];
}

- (LANGUAGE_E)languageValue:(NSString *)language
{
  if ([language isEqualToString:@"zh-CN"]) return CN;
  if ([language isEqualToString:@"zh-TW"]) return TCN;
  if ([language isEqualToString:@"ja"]) return JP;
  if ([language isEqualToString:@"ko"]) return KR;
  if ([language isEqualToString:@"th"]) return THA;
  return EN;
}

- (NSDictionary *)initializeResult:(EsLivingDetectResult *)result callId:(NSString *)callId
{
  NSMutableDictionary *mapped = [[self baseResult:result callId:callId] mutableCopy];
  mapped[@"initializationPayload"] = [self safeString:result.data];
  return mapped;
}

- (NSDictionary *)detectionResult:(EsLivingDetectResult *)result callId:(NSString *)callId
{
  NSMutableDictionary *mapped = [[self baseResult:result callId:callId] mutableCopy];
  mapped[@"verificationPayload"] = [self safeString:result.data];
  mapped[@"token"] = [self safeString:result.token];
  NSString *videoPath = [EsLivingDetectionManager GetLdtVideoFilePath:[self safeString:result.token]];
  if (videoPath.length > 0) mapped[@"videoPath"] = videoPath;
  return mapped;
}

- (NSDictionary *)baseResult:(EsLivingDetectResult *)result callId:(NSString *)callId
{
  NSString *nativeCode = [self safeString:[result getCodeStr]];
  return @{
    @"code": [self normalizeCode:nativeCode],
    @"message": [self safeString:result.msg],
    @"nativeCode": nativeCode,
    @"diagnosticId": callId,
  };
}

- (NSString *)normalizeCode:(NSString *)code
{
  if ([code isEqualToString:@"ELD_SUCCESS"] || [code isEqualToString:@"0"]) return @"success";
  if ([code isEqualToString:@"ELD_FAILED"] || [code isEqualToString:@"1"]) return @"failed";
  if ([code isEqualToString:@"ELD_PARAME_ERROR"] || [code isEqualToString:@"2"]) return @"invalid_argument";
  if ([code isEqualToString:@"ELD_EXCEPTION"] || [code isEqualToString:@"3"]) return @"exception";
  if ([code isEqualToString:@"ELD_TIMEOUT"] || [code isEqualToString:@"4"]) return @"timeout";
  if ([code isEqualToString:@"ELD_PERMISSION"] || [code isEqualToString:@"5"]) return @"permission_denied";
  if ([code isEqualToString:@"ELD_UNSUPPORT"] || [code isEqualToString:@"6"]) return @"unsupported";
  if ([code isEqualToString:@"ELD_CANCEL"] || [code isEqualToString:@"ELD_EXIT"] || [code isEqualToString:@"7"]) return @"cancelled";
  if ([code isEqualToString:@"ELD_ENV_ERROR"] || [code isEqualToString:@"8"]) return @"environment_error";
  return @"exception";
}

- (UIViewController *)topViewController
{
  UIWindow *window = nil;
  for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
    if (scene.activationState != UISceneActivationStateForegroundActive || ![scene isKindOfClass:UIWindowScene.class]) continue;
    for (UIWindow *candidate in ((UIWindowScene *)scene).windows) {
      if (candidate.isKeyWindow) {
        window = candidate;
        break;
      }
    }
  }
  UIViewController *controller = window.rootViewController;
  while (controller.presentedViewController != nil) controller = controller.presentedViewController;
  if ([controller isKindOfClass:UINavigationController.class]) controller = ((UINavigationController *)controller).visibleViewController;
  if ([controller isKindOfClass:UITabBarController.class]) controller = ((UITabBarController *)controller).selectedViewController;
  return controller;
}

- (void)beginDiagnostic:(NSString *)api callId:(NSString *)callId startedAt:(NSTimeInterval)startedAt
{
  @synchronized (self) {
    NSUserDefaults *defaults = NSUserDefaults.standardUserDefaults;
    NSString *current = [defaults stringForKey:EsandDiagnosticCurrentKey] ?: @"";
    [defaults setObject:current forKey:EsandDiagnosticPreviousKey];
    [defaults setObject:@"" forKey:EsandDiagnosticCurrentKey];
  }
  [self appendDiagnostic:api callId:callId stage:@"call-received" startedAt:startedAt detail:@""];
}

- (void)appendDiagnostic:(NSString *)api
                  callId:(NSString *)callId
                   stage:(NSString *)stage
               startedAt:(NSTimeInterval)startedAt
                  detail:(NSString *)detail
{
  NSTimeInterval now = NSDate.date.timeIntervalSince1970 * 1000;
  NSDictionary *entry = @{
    @"version": @"1",
    @"platform": @"ios",
    @"sdkVersion": [self safeString:[EsLivingDetectionManager getSdkVersion]],
    @"packageVersion": EsandPackageVersion,
    @"api": api,
    @"callId": callId,
    @"stage": stage,
    @"timestamp": @(now),
    @"elapsedMs": @(now - startedAt),
    @"detail": detail.length > 512 ? [detail substringToIndex:512] : detail,
  };
  NSData *data = [NSJSONSerialization dataWithJSONObject:entry options:0 error:nil];
  NSString *line = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] ?: @"";
  @synchronized (self) {
    NSUserDefaults *defaults = NSUserDefaults.standardUserDefaults;
    NSString *current = [defaults stringForKey:EsandDiagnosticCurrentKey] ?: @"";
    NSString *updated = current.length == 0 ? line : [NSString stringWithFormat:@"%@\n%@", current, line];
    if (updated.length > EsandMaxTraceLength) {
      updated = [updated substringFromIndex:updated.length - EsandMaxTraceLength];
    }
    [defaults setObject:updated forKey:EsandDiagnosticCurrentKey];
  }
}

- (NSArray *)parseTrace:(NSString *)trace
{
  NSMutableArray *entries = [NSMutableArray array];
  for (NSString *line in [trace componentsSeparatedByString:@"\n"]) {
    if (line.length == 0) continue;
    NSData *data = [line dataUsingEncoding:NSUTF8StringEncoding];
    NSDictionary *entry = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
    if ([entry isKindOfClass:NSDictionary.class]) [entries addObject:entry];
  }
  return entries;
}

- (NSString *)safeString:(id)value
{
  return [value isKindOfClass:NSString.class] ? value : @"";
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<facebook::react::NativeEsandLivenessSpecJSI>(params);
}

+ (NSString *)moduleName
{
  return @"EsandLiveness";
}

@end
