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

  constructor(
    code: LivenessErrorCode,
    message: string,
    details?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = 'LivenessError';
    this.code = code;
    this.details = details;
  }
}

export function toLivenessError(error: unknown): LivenessError {
  if (error instanceof LivenessError) {
    return error;
  }

  if (typeof error === 'object' && error !== null) {
    const candidate = error as { code?: unknown; message?: unknown };
    const code = normalizeBridgeErrorCode(candidate.code);
    const message =
      typeof candidate.message === 'string'
        ? candidate.message
        : 'The native liveness bridge failed.';
    return new LivenessError(code, message);
  }

  return new LivenessError(
    'native_bridge_error',
    error instanceof Error
      ? error.message
      : 'The native liveness bridge failed.'
  );
}

function normalizeBridgeErrorCode(code: unknown): LivenessErrorCode {
  const value = typeof code === 'string' ? code.replace(/^E_/, '') : '';
  switch (value) {
    case 'native_module_unavailable':
    case 'invalid_configuration':
    case 'not_initialized':
    case 'operation_in_progress':
    case 'no_active_screen':
    case 'unsupported_option':
    case 'native_bridge_error':
      return value;
    default:
      return 'native_bridge_error';
  }
}
