export enum LivenessAction {
  Distance = 'distance',
  Blink = 'blink',
  TurnHead = 'turn_head',
  Nod = 'nod',
  OpenMouth = 'open_mouth',
  ColorFlash = 'color_flash',
}

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

export type LivenessLanguage = 'zh-CN' | 'zh-TW' | 'en' | 'ja' | 'ko' | 'th';

export type LivenessCamera = 'front' | 'rear';

export interface LivenessAppearance {
  backgroundColor?: string;
  textColor?: string;
  progressBackgroundColor?: string;
  progressStartColor?: string;
  progressEndColor?: string;
  progressWidth?: number;
}

export interface LivenessConfig {
  actions: readonly LivenessAction[];
  recordVideo?: boolean;
  strictMode?: boolean;
  saveActionImages?: boolean;
  showNavigation?: boolean;
  language?: LivenessLanguage;
  appearance?: LivenessAppearance;
}

export interface StartDetectionOptions {
  token: string;
  camera?: LivenessCamera;
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

export interface LivenessCapabilities {
  platform: 'android' | 'ios';
  actions: readonly LivenessAction[];
  cameras: readonly LivenessCamera[];
  languages: readonly LivenessLanguage[];
  supportsVideoRecording: boolean;
  supportsActionImages: boolean;
  supportsDiagnostics: boolean;
}

export interface LivenessSdkVersion {
  platform: 'android' | 'ios';
  version: string;
}

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

export type LivenessState =
  'idle' | 'preparing' | 'initializing' | 'ready' | 'detecting';
