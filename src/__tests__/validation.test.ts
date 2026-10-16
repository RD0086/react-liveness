import { LivenessError } from '../errors';
import { LivenessAction } from '../types';
import { normalizeConfig, normalizeDetectionOptions } from '../validation';

describe('liveness validation', () => {
  it('applies stable defaults and preserves action order', () => {
    const result = normalizeConfig({
      actions: [LivenessAction.Blink, LivenessAction.Distance],
    });

    expect(result).toEqual({
      actions: [LivenessAction.Blink, LivenessAction.Distance],
      recordVideo: false,
      strictMode: false,
      saveActionImages: false,
      showNavigation: false,
      language: 'en',
      appearance: {},
    });
  });

  it('rejects duplicate actions', () => {
    expect(() =>
      normalizeConfig({
        actions: [LivenessAction.Blink, LivenessAction.Blink],
      })
    ).toThrow(LivenessError);
  });

  it('rejects invalid colors', () => {
    expect(() =>
      normalizeConfig({
        actions: [LivenessAction.ColorFlash],
        appearance: { textColor: 'red' },
      })
    ).toThrow('appearance colors must use #RRGGBB or #AARRGGBB.');
  });

  it('trims the token and defaults to the front camera', () => {
    expect(normalizeDetectionOptions({ token: ' token-value ' })).toEqual({
      token: 'token-value',
      camera: 'front',
    });
  });
});
