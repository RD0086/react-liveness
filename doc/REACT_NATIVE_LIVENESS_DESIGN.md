# React Native Liveness SDK Design

## 1. Document Status

- Status: Implemented in version 0.1.0
- Initial platforms: Android and iOS
- Reference implementation: `/Users/ReidLee/codes/myos/fldt_uniapp_plugin_for_hmos`
- Intended package name: `@esand/react-native-liveness`
- Intended example application: `example/`

## 2. Goals

1. Provide a typed React Native API for the ESand facial liveness SDK.
2. Support Android and iOS through one stable JavaScript contract.
3. Keep the reusable SDK package independent from the demo application, navigation, networking, and business UI.
4. Replace JSON-string bridge parameters with typed objects.
5. Normalize native result codes and field names across platforms.
6. Protect application secrets by keeping token acquisition and final verification behind the customer's backend.
7. Provide deterministic validation, concurrency control, diagnostics, and test coverage.

## 3. Non-Goals for Version 1

- HarmonyOS, web, Expo Go, and desktop support.
- An embedded camera preview React component. The native ESand SDK owns and presents the full-screen detection UI.
- A built-in production backend client or storage for customer credentials.
- A branded button, screen, navigation flow, or other business UI in the published package.
- Platform-only styling options that cannot be implemented consistently on both Android and iOS.

## 4. Product Boundary

The repository will contain two separate products:

| Product | Responsibility | Published |
| --- | --- | --- |
| SDK package | TypeScript API, React hook, native Android/iOS bridges, native SDK binaries, validation, diagnostics | Yes |
| Example app | User controls, backend adapter example, end-to-end flow, result and diagnostic display | No |

The example app may depend on the SDK package through the workspace. The SDK package must never import files from `example/`.

The SDK is primarily a headless React Native module because detection is presented by the native SDK. React integration is provided by an optional hook, not by a mandatory visual component.

## 5. End-to-End Flow

```text
React Native application
  1. prepare()                         optional engine warm-up
  2. initialize(config)                returns initializationPayload
  3. customer backend createSession()  exchanges payload for token
  4. startDetection({ token })         opens native UI and returns verificationPayload
  5. customer backend verifySession()  returns the authoritative business result
```

Only steps 1, 2, and 4 belong to the SDK package. Steps 3 and 5 belong to the host application's backend integration.

No production AppCode, secret key, or vendor gateway credential may be compiled
into the SDK. The example app may use a test-only credential copied from the
reference demo for end-to-end verification.

## 6. Proposed Repository Layout

```text
react-liveness/
|-- android/
|   |-- build.gradle
|   |-- libs/esfaceauth-release.aar
|   `-- src/main/java/com/esand/liveness/
|       |-- EsandLivenessModule.kt
|       |-- EsandLivenessPackage.kt
|       |-- NativeResultMapper.kt
|       `-- NativeConfigMapper.kt
|-- ios/
|   |-- Frameworks/EsLivingDetection.framework
|   |-- EsandLiveness.h
|   |-- EsandLiveness.mm
|   `-- EsandLivenessDiagnostics.swift
|-- src/
|   |-- index.ts
|   |-- NativeEsandLiveness.ts
|   |-- client.ts
|   |-- constants.ts
|   |-- errors.ts
|   |-- validation.ts
|   |-- types.ts
|   `-- useLivenessDetection.ts
|-- example/
|   |-- android/
|   |-- ios/
|   `-- src/
|       |-- api/LivenessBackend.ts
|       |-- api/HttpLivenessBackend.ts
|       |-- screens/LivenessDemoScreen.tsx
|       `-- components/
|-- __tests__/
|-- doc/
|-- package.json
|-- react-native.config.js
`-- react-native-esand-liveness.podspec
```

The library should use the standard React Native library build and autolinking conventions. The native module contract should be codegen-compatible so the same TypeScript surface can support React Native's New Architecture without changing consumer code. Exact React Native version ranges will be fixed after a compatibility spike with the supplied native binaries.

## 7. Public TypeScript API

### 7.1 Exports

```ts
export {
  Liveness,
  LivenessError,
  useLivenessDetection,
  LivenessAction,
  LivenessResultCode,
} from '@esand/react-native-liveness';

export type {
  LivenessConfig,
  LivenessAppearance,
  InitializeResult,
  StartDetectionOptions,
  DetectionResult,
  LivenessCapabilities,
  LivenessDiagnosticInfo,
} from '@esand/react-native-liveness';
```

### 7.2 Actions and Configuration

```ts
export enum LivenessAction {
  Distance = 'distance',
  Blink = 'blink',
  TurnHead = 'turn_head',
  Nod = 'nod',
  OpenMouth = 'open_mouth',
  ColorFlash = 'color_flash',
}

export type LivenessLanguage =
  | 'zh-CN'
  | 'zh-TW'
  | 'en'
  | 'ja'
  | 'ko'
  | 'th';

export interface LivenessAppearance {
  backgroundColor?: string;
  textColor?: string;
  progressBackgroundColor?: string;
  progressStartColor?: string;
  progressEndColor?: string;
  progressWidth?: number;
}

export interface LivenessConfig {
  /** Ordered list with one to four unique actions. */
  actions: readonly LivenessAction[];
  recordVideo?: boolean;
  strictMode?: boolean;
  saveActionImages?: boolean;
  showNavigation?: boolean;
  language?: LivenessLanguage;
  appearance?: LivenessAppearance;
}
```

The TypeScript facade converts the ordered action array into the native `livingType` representation. Consumers must not construct packed values such as `12` or `1234`.

Colors use `#RRGGBB` or `#AARRGGBB`. Invalid colors and unsupported values are rejected before entering native code.

### 7.3 Detection Input

```ts
export type LivenessCamera = 'front' | 'rear';

export interface StartDetectionOptions {
  token: string;
  camera?: LivenessCamera;
}
```

`camera` defaults to `front`. A platform must reject an unsupported camera choice with `unsupported_option`; it must not silently substitute another camera.

### 7.4 Results

```ts
export enum LivenessResultCode {
  Success = 'success',
  Failed = 'failed',
  InvalidArgument = 'invalid_argument',
  Exception = 'exception',
  Timeout = 'timeout',
  PermissionDenied = 'permission_denied',
  Unsupported = 'unsupported',
  Cancelled = 'cancelled',
  EnvironmentError = 'environment_error',
}

export interface LivenessResultBase {
  code: LivenessResultCode;
  message: string;
  nativeCode: string;
  diagnosticId: string;
}

export interface InitializeResult extends LivenessResultBase {
  initializationPayload: string;
}

export interface DetectionResult extends LivenessResultBase {
  verificationPayload: string;
  token: string;
  videoPath?: string;
}
```

The public fields use descriptive English names. Native names are mapped as follows:

| Native field | Public field |
| --- | --- |
| `msg` | `message` |
| initialization `data` | `initializationPayload` |
| detection `data` | `verificationPayload` |
| `videoPath` or `videopath` | `videoPath` |
| symbolic or numeric code | `code` plus original `nativeCode` |

SDK business outcomes, including cancellation, permission denial, timeout, and failed liveness, resolve to a typed result. Programming and bridge failures reject with `LivenessError`.

```ts
export type LivenessErrorCode =
  | 'native_module_unavailable'
  | 'invalid_configuration'
  | 'not_initialized'
  | 'operation_in_progress'
  | 'no_active_screen'
  | 'unsupported_option'
  | 'native_bridge_error';

export class LivenessError extends Error {
  readonly code: LivenessErrorCode;
  readonly details?: Readonly<Record<string, unknown>>;
}
```

### 7.5 Client Methods

```ts
export interface LivenessClient {
  prepare(): Promise<void>;
  initialize(config: LivenessConfig): Promise<InitializeResult>;
  startDetection(options: StartDetectionOptions): Promise<DetectionResult>;
  getCapabilities(): Promise<LivenessCapabilities>;
  getSdkVersion(): Promise<{ android?: string; ios?: string }>;
  getDiagnosticInfo(): Promise<LivenessDiagnosticInfo>;
  clearDiagnosticInfo(): Promise<void>;
}

export const Liveness: LivenessClient;
```

`prepare()` is optional. `initialize()` performs lazy preparation when necessary.

### 7.6 Optional React Hook

```ts
export interface UseLivenessDetectionValue {
  state: 'idle' | 'preparing' | 'initializing' | 'ready' | 'detecting';
  error: LivenessError | null;
  prepare(): Promise<void>;
  initialize(config: LivenessConfig): Promise<InitializeResult>;
  startDetection(options: StartDetectionOptions): Promise<DetectionResult>;
  resetError(): void;
}

export function useLivenessDetection(): UseLivenessDetectionValue;
```

The hook only manages React state around the SDK calls. It does not request backend tokens, verify results, render UI, or own navigation.

## 8. State and Concurrency Model

```text
unprepared -> prepared -> initialized -> detecting -> initialized
                  |             |
                  +-- initialize again replaces the active configuration
```

Rules:

1. Only one `prepare`, `initialize`, or `startDetection` operation may execute at a time.
2. `startDetection` requires a successful `initialize` call.
3. A second concurrent call rejects with `operation_in_progress`.
4. Completion, cancellation, native exceptions, and React Native host teardown must release the operation lock.
5. Native layers also enforce single-flight execution because JavaScript guards alone do not protect reloads or multiple React contexts.
6. Calls that present UI must run on the main thread and require a current foreground Activity or UIViewController.

## 9. Native Bridge Design

### 9.1 Shared Native Contract

The JavaScript-to-native boundary accepts structured dictionaries and returns structured dictionaries. JSON strings are not part of the public or internal bridge contract.

Native method names:

```text
prepare()
initialize(config)
startDetection(options)
getCapabilities()
getSdkVersion()
getDiagnosticInfo()
clearDiagnosticInfo()
```

All returned dictionaries must contain non-null scalar values for required fields. Optional values must be omitted instead of returned as platform null objects.

### 9.2 Android

- Implement the bridge in Kotlin.
- Keep an application-scoped `EsLivingDetectionManager` and acquire the current Activity only when presenting detection UI.
- Map actions to `livingType`: distance `1`, blink `2`, turn head `3`, nod `4`, open mouth `5`, color flash `6`.
- Call `EsLivingDetectionManager.Init()` from `prepare()`.
- Build `EsLDTInitConfig` and apply all supported options explicitly.
- Call `startLivingDetect(cameraId, token, callback)` and resolve the Promise exactly once.
- Read video output through the result file or manager API and return an absolute path only when a file exists.
- Package the supplied AAR through Gradle without exposing its transitive implementation details to JavaScript consumers.
- Minimum Android API is 23, matching the reference AAR.
- Required ABI support in version 1 is `armeabi-v7a` and `arm64-v8a`, matching the reference binary.
- Declare camera requirements in the library manifest and document any host-level permission or foreground-service requirements.

### 9.3 iOS

- Use an Objective-C++ React Native adapter so the existing Objective-C framework can be called directly and remain compatible with React Native codegen.
- Call `InitEngine` from `prepare()`.
- Apply configuration through `LivingConfigInstance` and style through `LivingViewStyleInstance` before `verifyInit`.
- Present detection from the top-most view controller on the main queue using `startDetect2`.
- Resolve the Promise exactly once from the native callback.
- Obtain recorded video with `GetLdtVideoFilePath` when recording is enabled.
- Bundle `EsLivingDetection.framework` and its resources through the podspec.
- Minimum iOS version is 12.0, matching the reference plugin configuration.
- Document `NSCameraUsageDescription` as a required host application setting.

### 9.4 Capability Reporting

```ts
export interface LivenessCapabilities {
  platform: 'android' | 'ios';
  actions: readonly LivenessAction[];
  cameras: readonly LivenessCamera[];
  languages: readonly LivenessLanguage[];
  supportsVideoRecording: boolean;
  supportsActionImages: boolean;
  supportsDiagnostics: boolean;
}
```

Capabilities come from the native adapter and its bundled SDK version. The demo uses them to disable unavailable options. The JavaScript API does not assume feature parity when the native binaries differ.

## 10. Configuration Defaults

The wrapper must define defaults rather than relying on mutable native singletons:

| Option | Version 1 default |
| --- | --- |
| `camera` | `front` |
| `recordVideo` | `false` |
| `strictMode` | `false` |
| `saveActionImages` | `false` |
| `showNavigation` | `false` |
| `language` | `en` |

The implementation must reset all supported native singleton fields on every `initialize()` call. This prevents configuration from a previous call or React Native reload from leaking into the next session.

Automatic upload behavior must remain disabled in the wrapper's first release. The host application owns the initialization and verification server calls. This default must be validated against the target Android and iOS SDK binaries during the native integration spike.

## 11. Diagnostics and Logging

Both platforms will expose the same diagnostic API, even though the reference implementation currently provides persistent diagnostics only on iOS.

```ts
export interface LivenessDiagnosticEntry {
  version: '1';
  platform: 'android' | 'ios';
  sdkVersion: string;
  packageVersion: string;
  api: 'prepare' | 'initialize' | 'startDetection';
  callId: string;
  stage: string;
  timestamp: number;
  elapsedMs: number;
  detail?: string;
}

export interface LivenessDiagnosticInfo {
  current: readonly LivenessDiagnosticEntry[];
  previous: readonly LivenessDiagnosticEntry[];
}
```

Diagnostic rules:

- Persist only the current and previous call traces.
- Generate a unique `diagnosticId`/`callId` for every public native call.
- Never persist or log tokens, initialization payloads, verification payloads, images, video content, credentials, or complete configuration objects.
- Redact native exception details that may contain sensitive values.
- Keep stored traces bounded in size.
- Clear diagnostics only after the host confirms successful upload to its own logging system.

## 12. Example Application Design

The example app demonstrates integration without becoming part of the SDK API.

### 12.1 Screens and Controls

- Ordered action selector with a maximum of four actions.
- Toggles for video recording, strict mode, action images, and navigation.
- Language selector and common appearance controls.
- Capability summary for the active platform.
- Start button with explicit disabled/loading states.
- Result view showing normalized code, message, diagnostic ID, and whether payload/video fields were returned. Sensitive payloads are hidden by default.
- Diagnostics view with clear and export actions.

### 12.2 Backend Boundary

```ts
export interface LivenessBackend {
  createSession(input: {
    initializationPayload: string;
  }): Promise<{ token: string }>;

  verifySession(input: {
    token: string;
    verificationPayload: string;
  }): Promise<{ passed: boolean; raw?: unknown }>;
}
```

`HttpLivenessBackend` reads only a customer-controlled `DEMO_API_BASE_URL`. It does not accept AppCode or secret-key environment variables. A local mock adapter may be provided for UI development, but it must clearly state that it cannot complete real liveness verification.

### 12.3 Demo Orchestration

```ts
const init = await Liveness.initialize(config);
if (init.code !== LivenessResultCode.Success) return;

const { token } = await backend.createSession({
  initializationPayload: init.initializationPayload,
});

const detection = await Liveness.startDetection({ token, camera: 'front' });
if (detection.code !== LivenessResultCode.Success) return;

const verification = await backend.verifySession({
  token: detection.token,
  verificationPayload: detection.verificationPayload,
});
```

## 13. Validation Rules

- `actions` must contain one to four unique supported actions.
- Action order is significant and must be preserved.
- `token` must be a non-empty string after trimming.
- Colors must use a supported hexadecimal format.
- `progressWidth` must be finite, positive, and within a documented native-safe range.
- Unknown object keys are ignored at the native boundary but should be caught by TypeScript during normal use.
- Runtime validation is still required because JavaScript callers and persisted data can bypass TypeScript.
- Inputs must be copied before asynchronous native use; callers must not be able to mutate in-flight configuration.

## 14. Error-Code Normalization

The mapper must accept both symbolic codes, such as `ELD_SUCCESS`, and numeric codes, such as `0`, because the reference Android and iOS bridges do not currently return one consistent representation.

| Native code | Normalized code |
| --- | --- |
| `ELD_SUCCESS`, `0` | `success` |
| `ELD_FAILED`, `1` | `failed` |
| `ELD_PARAME_ERROR`, `2` | `invalid_argument` |
| `ELD_EXCEPTION`, `3` | `exception` |
| `ELD_TIMEOUT`, `4` | `timeout` |
| `ELD_PERMISSION`, `5` | `permission_denied` |
| `ELD_UNSUPPORT`, `6` | `unsupported` |
| `ELD_CANCEL`, `ELD_EXIT`, `7` | `cancelled` |
| `ELD_ENV_ERROR`, `8` | `environment_error` |

Unknown native values map to `exception`, while the original value remains available in `nativeCode` and diagnostics.

## 15. Security and Privacy Requirements

1. Vendor and customer credentials must exist only on a trusted backend.
2. Tokens and payloads must not be written to logs or persistent diagnostics.
3. The package must document camera usage, video recording, image capture, retention, and upload behavior.
4. Video paths are local device paths and must not be uploaded automatically by the React Native wrapper.
5. The host app is responsible for consent, privacy notices, retention rules, and secure transport to its backend.
6. The demo must mask sensitive values and provide an explicit reveal action for development use.
7. Release builds must not enable verbose native logging by default.

## 16. Testing Strategy

### 16.1 TypeScript Unit Tests

- Action encoding and order preservation.
- Duplicate and excessive action rejection.
- Default application.
- Color and token validation.
- Native result normalization for symbolic, numeric, null, and unknown values.
- Concurrency guard and lock release after every completion path.
- Hook state transitions.

### 16.2 Native Unit Tests

- Config mapping on Android and iOS.
- Result mapping with missing optional native fields.
- Exactly-once Promise resolution.
- Diagnostics redaction and bounded persistence.
- Foreground screen/activity errors.

Native SDK calls should be placed behind small adapters so unit tests can use fakes without loading camera binaries.

### 16.3 Example and Device Tests

- Android API 23 and a current Android release on physical arm devices.
- iOS 12 minimum compatibility build and a current iOS release on a physical device.
- Success, cancellation, permission denial, timeout, backgrounding, rotation, repeated sessions, and React Native reload.
- Front/rear camera capability behavior.
- Video enabled/disabled behavior and file existence.
- App termination during initialization/detection followed by diagnostic recovery.
- New Architecture enabled and disabled for the supported React Native version range.

Camera and liveness behavior cannot be considered verified using simulators alone.

## 17. Build and Distribution

- Build JavaScript output and type declarations with the standard React Native library toolchain.
- Use peer dependencies for `react` and `react-native`; do not bundle them.
- Use React Native autolinking for Android and CocoaPods.
- Keep native SDK binaries versioned and checksummed in release records.
- Verify that binary redistribution terms allow npm package distribution before publishing.
- Publish only package source/output, native bridge code, required native binaries/resources, license files, and integration documentation.
- Exclude the example app, local environment files, signing files, test artifacts, and customer endpoints from the npm package.

## 18. Compatibility Decisions Requiring an Integration Spike

Before implementation is considered stable, verify the following against the exact Android AAR and iOS framework selected for release:

1. Native SDK versions and redistribution rights.
2. Supported React Native version range and codegen behavior.
3. Automatic verification upload semantics and the correct way to disable them.
4. Rear-camera support on iOS.
5. Thai language support in both selected binaries.
6. Common behavior for strict mode, saved action images, navigation, and progress width.
7. Required Android permissions on modern scoped-storage releases.
8. Required iOS framework resources and static/dynamic linkage settings.
9. Video file lifetime and deletion behavior on both platforms.

Unsupported or inconsistent items must be omitted from the common version 1 API or exposed through capability reporting. They must not be silently accepted.

## 19. Implementation Phases

### Phase 1: Scaffold and Contract

- Create the React Native library and example workspaces.
- Add TypeScript types, validation, result normalization, native spec, and tests.
- Add CI for linting, type checking, unit tests, Android build, and iOS build.

### Phase 2: Android

- Integrate the AAR and Kotlin adapter.
- Implement lifecycle, permissions, configuration, detection, video path, diagnostics, and native tests.
- Validate on physical Android devices.

### Phase 3: iOS

- Integrate the framework, resources, and Objective-C++ adapter.
- Implement presentation, configuration, detection, video path, diagnostics, and native tests.
- Validate on physical iOS devices.

### Phase 4: Example and Release Hardening

- Implement the backend interface and demo screen.
- Complete end-to-end tests against a customer-controlled test backend.
- Write installation, privacy, troubleshooting, API, and migration documentation.
- Confirm binary licenses, package contents, version matrix, and release checklist.

## 20. Acceptance Criteria

- The package and example app build independently.
- The package contains no demo UI, backend URL, AppCode, secret, or navigation dependency.
- One TypeScript API works on Android and iOS without platform checks for common features.
- All public APIs and documentation use English names and text.
- Inputs and outputs are structured objects, not JSON strings.
- Native code never resolves a Promise more than once.
- Concurrent detection calls fail deterministically.
- Result codes and field names are identical across Android and iOS.
- Sensitive values are absent from logs and persisted diagnostics.
- The full initialization, token, detection, and verification flow succeeds on physical Android and iOS devices.
