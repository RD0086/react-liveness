import { LivenessError } from './errors';
import {
  LivenessAction,
  type LivenessAppearance,
  type LivenessConfig,
  type StartDetectionOptions,
} from './types';

const ACTIONS = new Set<string>(Object.values(LivenessAction));
const COLOR_PATTERN = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export interface NormalizedLivenessConfig {
  actions: LivenessAction[];
  recordVideo: boolean;
  strictMode: boolean;
  saveActionImages: boolean;
  showNavigation: boolean;
  language: NonNullable<LivenessConfig['language']>;
  appearance: LivenessAppearance;
}

export interface NormalizedStartDetectionOptions {
  token: string;
  camera: NonNullable<StartDetectionOptions['camera']>;
}

export function normalizeConfig(
  config: LivenessConfig
): NormalizedLivenessConfig {
  if (!config || !Array.isArray(config.actions)) {
    invalid('actions must be an array.');
  }

  if (config.actions.length < 1 || config.actions.length > 4) {
    invalid('actions must contain between one and four items.');
  }

  const actions = [...config.actions];
  if (new Set(actions).size !== actions.length) {
    invalid('actions must not contain duplicates.');
  }
  if (actions.some((action) => !ACTIONS.has(action))) {
    invalid('actions contains an unsupported value.');
  }

  const appearance = { ...(config.appearance ?? {}) };
  validateAppearance(appearance);

  return {
    actions,
    recordVideo: config.recordVideo ?? false,
    strictMode: config.strictMode ?? false,
    saveActionImages: config.saveActionImages ?? false,
    showNavigation: config.showNavigation ?? false,
    language: config.language ?? 'en',
    appearance,
  };
}

export function normalizeDetectionOptions(
  options: StartDetectionOptions
): NormalizedStartDetectionOptions {
  const token = options?.token?.trim();
  if (!token) {
    invalid('token must be a non-empty string.');
  }

  const camera = options.camera ?? 'front';
  if (camera !== 'front' && camera !== 'rear') {
    invalid('camera must be either front or rear.');
  }

  return { token, camera };
}

function validateAppearance(appearance: LivenessAppearance): void {
  const colors = [
    appearance.backgroundColor,
    appearance.textColor,
    appearance.progressBackgroundColor,
    appearance.progressStartColor,
    appearance.progressEndColor,
  ];
  if (
    colors.some((color) => color !== undefined && !COLOR_PATTERN.test(color))
  ) {
    invalid('appearance colors must use #RRGGBB or #AARRGGBB.');
  }

  if (
    appearance.progressWidth !== undefined &&
    (!Number.isFinite(appearance.progressWidth) ||
      appearance.progressWidth < 1 ||
      appearance.progressWidth > 32)
  ) {
    invalid('appearance.progressWidth must be between 1 and 32.');
  }
}

function invalid(message: string): never {
  throw new LivenessError('invalid_configuration', message);
}
