import NativeEsandLiveness from './NativeEsandLiveness';
import { LivenessError, toLivenessError } from './errors';
import {
  LivenessResultCode,
  type DetectionResult,
  type InitializeResult,
  type LivenessCapabilities,
  type LivenessConfig,
  type LivenessDiagnosticInfo,
  type LivenessSdkVersion,
  type StartDetectionOptions,
} from './types';
import { normalizeConfig, normalizeDetectionOptions } from './validation';

export interface LivenessClient {
  prepare(): Promise<void>;
  initialize(config: LivenessConfig): Promise<InitializeResult>;
  startDetection(options: StartDetectionOptions): Promise<DetectionResult>;
  getCapabilities(): Promise<LivenessCapabilities>;
  getSdkVersion(): Promise<LivenessSdkVersion>;
  getDiagnosticInfo(): Promise<LivenessDiagnosticInfo>;
  clearDiagnosticInfo(): Promise<void>;
}

let operation: string | null = null;
let initialized = false;

async function exclusive<T>(name: string, work: () => Promise<T>): Promise<T> {
  if (operation !== null) {
    throw new LivenessError(
      'operation_in_progress',
      `Cannot start ${name} while ${operation} is running.`
    );
  }

  operation = name;
  try {
    return await work();
  } catch (error) {
    throw toLivenessError(error);
  } finally {
    operation = null;
  }
}

export const Liveness: LivenessClient = {
  prepare: () => exclusive('prepare', () => NativeEsandLiveness.prepare()),

  initialize: (config) =>
    exclusive('initialize', async () => {
      const result = asInitializeResult(
        await NativeEsandLiveness.initialize(normalizeConfig(config))
      );
      initialized = result.code === LivenessResultCode.Success;
      return result;
    }),

  startDetection: (options) =>
    exclusive('startDetection', async () => {
      if (!initialized) {
        throw new LivenessError(
          'not_initialized',
          'initialize() must complete successfully before startDetection().'
        );
      }
      return asDetectionResult(
        await NativeEsandLiveness.startDetection(
          normalizeDetectionOptions(options)
        )
      );
    }),

  getCapabilities: async () =>
    (await NativeEsandLiveness.getCapabilities()) as unknown as LivenessCapabilities,

  getSdkVersion: async () =>
    (await NativeEsandLiveness.getSdkVersion()) as unknown as LivenessSdkVersion,

  getDiagnosticInfo: async () =>
    (await NativeEsandLiveness.getDiagnosticInfo()) as unknown as LivenessDiagnosticInfo,

  clearDiagnosticInfo: () => NativeEsandLiveness.clearDiagnosticInfo(),
};

function asInitializeResult(value: object): InitializeResult {
  return value as InitializeResult;
}

function asDetectionResult(value: object): DetectionResult {
  return value as DetectionResult;
}
