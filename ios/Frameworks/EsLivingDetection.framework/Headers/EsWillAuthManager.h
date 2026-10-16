//
//  EsWillAuthManager.h
//  EsLivingDetection
//

#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import "EsLivingDetectResult.h"

#ifndef ENABLE_WILL_AUTH
#define ENABLE_WILL_AUTH 0
#endif

#if ENABLE_WILL_AUTH

NS_ASSUME_NONNULL_BEGIN

@interface EsWillAuthManager : NSObject

+ (void)startWillAuth:(NSString *)url
       viewController:(UIViewController *)viewController
             callback:(EsLivingDetectCallback)callback;

+ (void)startWillAuth:(NSString *)url
       viewController:(UIViewController *)viewController
             callback:(EsLivingDetectCallback)callback
     windowSwitchType:(NSInteger)type;

+ (void)exit;

@end

NS_ASSUME_NONNULL_END

#endif // ENABLE_WILL_AUTH
