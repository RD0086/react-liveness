import { useCallback, useState } from 'react';
import { Liveness } from './client';
import { type LivenessError, toLivenessError } from './errors';
import type {
  DetectionResult,
  InitializeResult,
  LivenessConfig,
  LivenessState,
  StartDetectionOptions,
} from './types';

export interface UseLivenessDetectionValue {
  state: LivenessState;
  error: LivenessError | null;
  prepare(): Promise<void>;
  initialize(config: LivenessConfig): Promise<InitializeResult>;
  startDetection(options: StartDetectionOptions): Promise<DetectionResult>;
  resetError(): void;
}

export function useLivenessDetection(): UseLivenessDetectionValue {
  const [state, setState] = useState<LivenessState>('idle');
  const [error, setError] = useState<LivenessError | null>(null);

  const run = useCallback(
    async <T>(nextState: LivenessState, work: () => Promise<T>): Promise<T> => {
      setState(nextState);
      setError(null);
      try {
        const result = await work();
        setState(
          nextState === 'detecting'
            ? 'ready'
            : nextState === 'initializing'
              ? 'ready'
              : 'idle'
        );
        return result;
      } catch (cause) {
        const nextError = toLivenessError(cause);
        setError(nextError);
        setState(nextState === 'detecting' ? 'ready' : 'idle');
        throw nextError;
      }
    },
    []
  );

  return {
    state,
    error,
    prepare: useCallback(
      () => run('preparing', () => Liveness.prepare()),
      [run]
    ),
    initialize: useCallback(
      (config) => run('initializing', () => Liveness.initialize(config)),
      [run]
    ),
    startDetection: useCallback(
      (options) => run('detecting', () => Liveness.startDetection(options)),
      [run]
    ),
    resetError: useCallback(() => setError(null), []),
  };
}
