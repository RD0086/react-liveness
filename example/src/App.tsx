import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Video from 'react-native-video';
import {
  Liveness,
  LivenessAction,
  LivenessResultCode,
  type LivenessResultBase,
} from '@esand/react-native-liveness';
import { ReferenceLivenessBackend } from './api/ReferenceLivenessBackend';

const ACTIONS = [
  { value: LivenessAction.Distance, label: 'Distance' },
  { value: LivenessAction.Blink, label: 'Blink' },
  { value: LivenessAction.TurnHead, label: 'Turn head' },
  { value: LivenessAction.Nod, label: 'Nod' },
  { value: LivenessAction.OpenMouth, label: 'Open mouth' },
  { value: LivenessAction.ColorFlash, label: 'Color flash' },
];

const FLOW_STEPS = [
  { id: 'initialize', label: 'Initialize SDK' },
  { id: 'session', label: 'Create session' },
  { id: 'detect', label: 'Face detection' },
  { id: 'verify', label: 'Server verification' },
] as const;

type FlowStep = (typeof FLOW_STEPS)[number]['id'];
type ResultStatus = 'idle' | 'running' | 'success' | 'failed';
type MediaKind = 'image' | 'video';

interface ResultMedia {
  kind: MediaKind;
  uri: string;
  label: string;
  source: 'device' | 'backend';
}

interface DemoResult {
  status: ResultStatus;
  activeStep?: FlowStep;
  completedSteps: readonly FlowStep[];
  title: string;
  message: string;
  code?: string;
  nativeCode?: string;
  diagnosticId?: string;
  videoPath?: string;
  elapsedMs?: number;
  media?: readonly ResultMedia[];
  raw?: unknown;
}

const INITIAL_RESULT: DemoResult = {
  status: 'idle',
  completedSteps: [],
  title: 'Ready to run',
  message: 'Configure the detection actions, then start a liveness check.',
};

export default function App() {
  const [actions, setActions] = useState<LivenessAction[]>([
    LivenessAction.ColorFlash,
  ]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DemoResult>(INITIAL_RESULT);
  const [showRaw, setShowRaw] = useState(false);

  const toggleAction = (action: LivenessAction) => {
    if (running) return;
    setActions((current) => {
      if (current.includes(action)) {
        return current.filter((item) => item !== action);
      }
      return current.length < 4 ? [...current, action] : current;
    });
  };

  const updateProgress = (
    activeStep: FlowStep,
    completedSteps: readonly FlowStep[],
    title: string,
    message: string
  ) => {
    setResult({
      status: 'running',
      activeStep,
      completedSteps,
      title,
      message,
    });
  };

  const startLiveness = async () => {
    const startedAt = Date.now();
    let activeStep: FlowStep = 'initialize';
    let completedSteps: readonly FlowStep[] = [];
    let detectionVideoPath: string | undefined;
    setRunning(true);
    setShowRaw(false);

    try {
      const backend = new ReferenceLivenessBackend();

      activeStep = 'initialize';
      updateProgress(
        activeStep,
        completedSteps,
        'Initializing SDK',
        'Applying the selected detection policy on this device.'
      );
      const initialization = await Liveness.initialize({
        actions,
        recordVideo: true,
        strictMode: true,
        saveActionImages: true,
        language: 'en',
      });
      if (initialization.code !== LivenessResultCode.Success) {
        setResult(
          sdkFailureResult('initialize', [], initialization, startedAt)
        );
        return;
      }

      completedSteps = ['initialize'];
      activeStep = 'session';
      updateProgress(
        activeStep,
        completedSteps,
        'Creating secure session',
        'Requesting a short-lived verification token from the backend.'
      );
      const session = await backend.createSession({
        initializationPayload: initialization.initializationPayload,
      });
      if (!session.token?.trim()) {
        throw new Error('The backend returned an empty liveness token.');
      }

      completedSteps = ['initialize', 'session'];
      activeStep = 'detect';
      updateProgress(
        activeStep,
        completedSteps,
        'Detection in progress',
        'Follow the prompts shown by the native liveness experience.'
      );
      const detection = await Liveness.startDetection({
        token: session.token,
        camera: 'front',
      });
      if (detection.code !== LivenessResultCode.Success) {
        setResult(
          sdkFailureResult(
            'detect',
            ['initialize', 'session'],
            detection,
            startedAt
          )
        );
        return;
      }
      detectionVideoPath = detection.videoPath;

      completedSteps = ['initialize', 'session', 'detect'];
      activeStep = 'verify';
      updateProgress(
        activeStep,
        completedSteps,
        'Verifying result',
        'The backend is validating the signed detection payload.'
      );
      const verification = await backend.verifySession({
        token: detection.token,
        verificationPayload: detection.verificationPayload,
      });
      const passed = readPassed(verification);

      setResult({
        status: passed === false ? 'failed' : 'success',
        activeStep: 'verify',
        completedSteps: FLOW_STEPS.map((step) => step.id),
        title:
          passed === false
            ? 'Verification not approved'
            : passed === true
              ? 'Liveness verified'
              : 'Verification completed',
        message:
          passed === false
            ? 'The backend received the payload but did not approve this attempt.'
            : passed === true
              ? 'The backend confirmed that this attempt passed liveness verification.'
              : 'The backend response was received successfully. Review the response details below.',
        code: passed === false ? 'verification_failed' : 'success',
        diagnosticId: detection.diagnosticId,
        nativeCode: detection.nativeCode,
        videoPath: detection.videoPath,
        elapsedMs: Date.now() - startedAt,
        media: collectResultMedia(verification, detection.videoPath),
        raw: verification,
      });
    } catch (error) {
      setResult(
        errorResult(
          error,
          startedAt,
          activeStep,
          completedSteps,
          detectionVideoPath
        )
      );
    } finally {
      setRunning(false);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title}>Liveness demo</Text>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Detection policy</Text>
            <Text style={styles.sectionDescription}>
              Select up to four actions in execution order.
            </Text>
          </View>
          <Text style={styles.selectionCount}>{actions.length}/4 selected</Text>
        </View>

        <View style={styles.actions}>
          {ACTIONS.map((item) => {
            const index = actions.indexOf(item.value);
            const selected = index >= 0;
            const disabled = running || (!selected && actions.length >= 4);
            return (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected, disabled }}
                disabled={disabled}
                key={item.value}
                onPress={() => toggleAction(item.value)}
                style={({ pressed }) => [
                  styles.action,
                  selected && styles.actionSelected,
                  disabled && !selected && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                <View
                  style={[
                    styles.actionOrder,
                    selected && styles.actionOrderSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.actionOrderText,
                      selected && styles.actionOrderTextSelected,
                    ]}
                  >
                    {selected ? index + 1 : ''}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.actionText,
                    selected && styles.actionTextSelected,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.policyMeta}>
          <Text style={styles.policyMetaText}>Front camera</Text>
          <View style={styles.metaDivider} />
          <Text style={styles.policyMetaText}>Strict mode</Text>
          <View style={styles.metaDivider} />
          <Text style={styles.policyMetaText}>Video evidence enabled</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={running || actions.length === 0}
          onPress={startLiveness}
          style={({ pressed }) => [
            styles.primaryButton,
            (running || actions.length === 0) && styles.disabled,
            pressed && !running && styles.primaryButtonPressed,
          ]}
        >
          {running ? (
            <View style={styles.buttonContent}>
              <ActivityIndicator color="#FFFFFF" size="small" />
              <Text style={styles.primaryButtonText}>Verification running</Text>
            </View>
          ) : (
            <Text style={styles.primaryButtonText}>Start verification</Text>
          )}
        </Pressable>

        <ResultPanel
          result={result}
          showRaw={showRaw}
          onToggleRaw={() => setShowRaw((current) => !current)}
        />
      </ScrollView>
    </View>
  );
}

function ResultPanel({
  result,
  showRaw,
  onToggleRaw,
}: {
  result: DemoResult;
  showRaw: boolean;
  onToggleRaw: () => void;
}) {
  const isRunning = result.status === 'running';
  const isSuccess = result.status === 'success';
  const isFailed = result.status === 'failed';

  return (
    <View style={styles.resultSection}>
      <View style={styles.resultHeadingRow}>
        <View style={styles.resultHeadingCopy}>
          <Text style={styles.sectionTitle}>Verification result</Text>
          <Text style={styles.sectionDescription}>
            End-to-end execution status and diagnostic details
          </Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            isRunning && styles.statusBadgeRunning,
            isSuccess && styles.statusBadgeSuccess,
            isFailed && styles.statusBadgeFailed,
          ]}
        >
          <View
            style={[
              styles.statusDot,
              isRunning && styles.statusDotRunning,
              isSuccess && styles.statusDotSuccess,
              isFailed && styles.statusDotFailed,
            ]}
          />
          <Text
            style={[
              styles.statusBadgeText,
              isRunning && styles.statusBadgeTextRunning,
              isSuccess && styles.statusBadgeTextSuccess,
              isFailed && styles.statusBadgeTextFailed,
            ]}
          >
            {statusLabel(result.status)}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.resultSummary,
          isRunning && styles.resultSummaryRunning,
          isSuccess && styles.resultSummarySuccess,
          isFailed && styles.resultSummaryFailed,
        ]}
      >
        <View
          style={[
            styles.resultIcon,
            isRunning && styles.resultIconRunning,
            isSuccess && styles.resultIconSuccess,
            isFailed && styles.resultIconFailed,
          ]}
        >
          {isRunning ? (
            <ActivityIndicator color="#2563EB" size="small" />
          ) : (
            <Text
              style={[
                styles.resultIconText,
                isSuccess && styles.resultIconTextSuccess,
                isFailed && styles.resultIconTextFailed,
              ]}
            >
              {isSuccess ? '✓' : isFailed ? '!' : '—'}
            </Text>
          )}
        </View>
        <View style={styles.resultSummaryCopy}>
          <Text style={styles.resultTitle}>{result.title}</Text>
          <Text style={styles.resultMessage}>{result.message}</Text>
        </View>
      </View>

      <View style={styles.flow}>
        {FLOW_STEPS.map((step, index) => {
          const completed = result.completedSteps.includes(step.id);
          const active = result.activeStep === step.id && !completed;
          const failed = active && result.status === 'failed';
          return (
            <View key={step.id} style={styles.flowItem}>
              <View style={styles.flowRail}>
                <View
                  style={[
                    styles.flowMarker,
                    completed && styles.flowMarkerComplete,
                    active && styles.flowMarkerActive,
                    failed && styles.flowMarkerFailed,
                  ]}
                >
                  <Text
                    style={[
                      styles.flowMarkerText,
                      (completed || active) && styles.flowMarkerTextActive,
                    ]}
                  >
                    {completed ? '✓' : index + 1}
                  </Text>
                </View>
                {index < FLOW_STEPS.length - 1 ? (
                  <View
                    style={[
                      styles.flowLine,
                      completed && styles.flowLineComplete,
                    ]}
                  />
                ) : null}
              </View>
              <View style={styles.flowCopy}>
                <Text
                  style={[
                    styles.flowLabel,
                    (completed || active) && styles.flowLabelActive,
                    failed && styles.flowLabelFailed,
                  ]}
                >
                  {step.label}
                </Text>
                <Text style={styles.flowState}>
                  {flowStateLabel(result, step.id)}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {result.status !== 'idle' && result.status !== 'running' ? (
        <View style={styles.details}>
          <DetailRow label="Result code" value={result.code ?? '—'} />
          <DetailRow
            label="Duration"
            value={formatDuration(result.elapsedMs)}
          />
          <DetailRow
            label="Video evidence"
            value={result.videoPath ? 'Captured' : 'Not available'}
          />
          {result.nativeCode ? (
            <DetailRow label="Native code" value={result.nativeCode} mono />
          ) : null}
          {result.diagnosticId ? (
            <DetailRow label="Diagnostic ID" value={result.diagnosticId} mono />
          ) : null}
          {result.videoPath ? (
            <DetailRow label="Video path" value={result.videoPath} mono />
          ) : null}
        </View>
      ) : null}

      {result.media && result.media.length > 0 ? (
        <MediaEvidence media={result.media} />
      ) : null}

      {result.raw !== undefined ? (
        <View style={styles.rawSection}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showRaw }}
            onPress={onToggleRaw}
            style={({ pressed }) => [
              styles.rawToggle,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.rawToggleText}>
              {showRaw ? 'Hide raw response' : 'View raw response'}
            </Text>
            <Text style={styles.rawChevron}>{showRaw ? '⌃' : '⌄'}</Text>
          </Pressable>
          {showRaw ? (
            <View style={styles.rawOutput}>
              <Text selectable style={styles.rawOutputText}>
                {formatResult(result.raw)}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function MediaEvidence({ media }: { media: readonly ResultMedia[] }) {
  const images = media.filter((item) => item.kind === 'image');
  const videos = media.filter((item) => item.kind === 'video');

  return (
    <View style={styles.mediaSection}>
      <View style={styles.mediaHeading}>
        <View>
          <Text style={styles.mediaTitle}>Evidence preview</Text>
          <Text style={styles.mediaDescription}>
            Media returned by the device and verification service
          </Text>
        </View>
        <Text style={styles.mediaCount}>{media.length} files</Text>
      </View>

      {videos.map((item, index) => (
        <View key={`${item.uri}-${index}`} style={styles.videoBlock}>
          <View style={styles.mediaMetaRow}>
            <Text style={styles.mediaLabel}>{item.label}</Text>
            <Text style={styles.mediaSource}>{item.source}</Text>
          </View>
          <Video
            controls
            paused
            resizeMode="contain"
            source={{ uri: normalizeMediaUri(item.uri) }}
            style={styles.video}
          />
        </View>
      ))}

      {images.length > 0 ? (
        <ScrollView
          contentContainerStyle={styles.imageGallery}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {images.map((item, index) => (
            <View key={`${item.uri}-${index}`} style={styles.imageItem}>
              <Image
                resizeMode="cover"
                source={{ uri: normalizeMediaUri(item.uri) }}
                style={styles.evidenceImage}
              />
              <Text numberOfLines={1} style={styles.imageLabel}>
                {item.label}
              </Text>
              <Text style={styles.imageSource}>{item.source}</Text>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text
        selectable
        style={[styles.detailValue, mono && styles.detailValueMono]}
      >
        {value}
      </Text>
    </View>
  );
}

function sdkFailureResult(
  activeStep: FlowStep,
  completedSteps: readonly FlowStep[],
  failure: LivenessResultBase,
  startedAt: number
): DemoResult {
  return {
    status: 'failed',
    activeStep,
    completedSteps,
    title: failureTitle(failure.code),
    message: failure.message || 'The native liveness operation did not finish.',
    code: failure.code,
    nativeCode: failure.nativeCode,
    diagnosticId: failure.diagnosticId,
    elapsedMs: Date.now() - startedAt,
  };
}

function errorResult(
  error: unknown,
  startedAt: number,
  activeStep: FlowStep,
  completedSteps: readonly FlowStep[],
  videoPath?: string
): DemoResult {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    error instanceof Error && 'code' in error ? String(error.code) : 'error';
  return {
    status: 'failed',
    activeStep,
    completedSteps,
    title: 'Verification interrupted',
    message,
    code,
    videoPath,
    elapsedMs: Date.now() - startedAt,
    media: videoPath
      ? [
          {
            kind: 'video',
            uri: normalizeMediaUri(videoPath),
            label: 'Detection recording',
            source: 'device',
          },
        ]
      : undefined,
  };
}

function readPassed(value: unknown): boolean | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.passed === 'boolean') return record.passed;
  if (typeof record.success === 'boolean') return record.success;
  if (record.data && typeof record.data === 'object') {
    return readPassed(record.data);
  }
  return undefined;
}

function collectResultMedia(
  response: unknown,
  videoPath?: string
): ResultMedia[] {
  const media: ResultMedia[] = [];
  const seen = new Set<string>();

  const add = (item: ResultMedia) => {
    const normalized = normalizeMediaUri(item.uri);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    media.push({ ...item, uri: normalized });
  };

  if (videoPath) {
    add({
      kind: 'video',
      uri: videoPath,
      label: 'Detection recording',
      source: 'device',
    });
  }

  walkMediaResponse(response, 'response', add);
  return media;
}

function walkMediaResponse(
  value: unknown,
  keyPath: string,
  add: (item: ResultMedia) => void,
  depth = 0
) {
  if (depth > 6 || value === null || value === undefined) return;

  if (typeof value === 'string') {
    const fieldName = keyPath.split('.').at(-1) ?? 'media';
    const kind = inferMediaKind(keyPath, value);
    if (!kind) return;
    add({
      kind,
      uri: toMediaUri(value, kind),
      label: humanizeMediaLabel(fieldName, kind),
      source: 'backend',
    });
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      walkMediaResponse(item, `${keyPath}.${index + 1}`, add, depth + 1)
    );
    return;
  }

  if (typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) =>
      walkMediaResponse(item, `${keyPath}.${key}`, add, depth + 1)
    );
  }
}

function inferMediaKind(key: string, value: string): MediaKind | undefined {
  const normalizedKey = key.toLowerCase();
  const normalizedValue = value.trim().toLowerCase();
  const imageKey = /(image|img|photo|picture|snapshot|frame|portrait|avatar)/;
  const videoKey = /(video|recording|movie|clip)/;
  const looksLikeMediaValue =
    normalizedValue.startsWith('http://') ||
    normalizedValue.startsWith('https://') ||
    normalizedValue.startsWith('file://') ||
    normalizedValue.startsWith('content://') ||
    normalizedValue.startsWith('data:') ||
    normalizedValue.startsWith('/') ||
    (/^[a-z0-9+/=\r\n]+$/i.test(value.trim()) && value.trim().length > 256);

  if (
    (videoKey.test(normalizedKey) && looksLikeMediaValue) ||
    normalizedValue.startsWith('data:video/') ||
    /\.(mp4|mov|m4v|webm)(\?.*)?$/.test(normalizedValue)
  ) {
    return 'video';
  }
  if (
    (imageKey.test(normalizedKey) && looksLikeMediaValue) ||
    normalizedValue.startsWith('data:image/') ||
    /\.(jpe?g|png|webp|heic|gif)(\?.*)?$/.test(normalizedValue)
  ) {
    return 'image';
  }
  return undefined;
}

function toMediaUri(value: string, kind: MediaKind): string {
  const trimmed = value.trim();
  if (
    kind === 'image' &&
    !trimmed.includes('://') &&
    !trimmed.startsWith('/') &&
    !trimmed.startsWith('data:') &&
    /^[A-Za-z0-9+/=\r\n]+$/.test(trimmed) &&
    trimmed.length > 256
  ) {
    return `data:image/jpeg;base64,${trimmed.replace(/\s/g, '')}`;
  }
  return trimmed;
}

function normalizeMediaUri(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('://') || trimmed.startsWith('data:')) {
    return trimmed;
  }
  return trimmed.startsWith('/') ? `file://${trimmed}` : trimmed;
}

function humanizeMediaLabel(key: string, kind: MediaKind): string {
  if (/^\d+$/.test(key)) return kind === 'image' ? 'Evidence image' : 'Video';
  const label = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : 'Evidence';
}

function statusLabel(status: ResultStatus): string {
  switch (status) {
    case 'idle':
      return 'READY';
    case 'running':
      return 'IN PROGRESS';
    case 'success':
      return 'COMPLETED';
    case 'failed':
      return 'ACTION NEEDED';
  }
}

function failureTitle(code: LivenessResultCode): string {
  switch (code) {
    case LivenessResultCode.Cancelled:
      return 'Verification cancelled';
    case LivenessResultCode.PermissionDenied:
      return 'Camera permission required';
    case LivenessResultCode.Timeout:
      return 'Verification timed out';
    case LivenessResultCode.Unsupported:
      return 'Device not supported';
    case LivenessResultCode.EnvironmentError:
      return 'Environment check failed';
    default:
      return 'Liveness check unsuccessful';
  }
}

function flowStateLabel(result: DemoResult, step: FlowStep): string {
  if (result.completedSteps.includes(step)) return 'Completed';
  if (result.activeStep === step) {
    return result.status === 'failed' ? 'Stopped here' : 'In progress';
  }
  return 'Pending';
}

function formatDuration(elapsedMs?: number): string {
  if (elapsedMs === undefined) return '—';
  if (elapsedMs < 1000) return `${elapsedMs} ms`;
  return `${(elapsedMs / 1000).toFixed(1)} s`;
}

function formatResult(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(
      value,
      (key, item: unknown) => {
        if (
          typeof item === 'string' &&
          item.length > 1024 &&
          inferMediaKind(key, item)
        ) {
          return `[media payload omitted: ${item.length} characters]`;
        }
        return item;
      },
      2
    );
  } catch {
    return String(value);
  }
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#F4F6F8',
    flex: 1,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0,
  },
  content: {
    paddingBottom: 44,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  header: {
    marginBottom: 24,
  },
  title: { color: '#14231F', fontSize: 24, fontWeight: '700' },
  sectionHeader: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitle: { color: '#1C2925', fontSize: 16, fontWeight: '700' },
  sectionDescription: {
    color: '#6A7773',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  selectionCount: { color: '#53615C', fontSize: 12, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D8DEDB',
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 44,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  actionSelected: { backgroundColor: '#EAF4F0', borderColor: '#147D64' },
  actionOrder: {
    alignItems: 'center',
    borderColor: '#C9D1CE',
    borderRadius: 4,
    borderWidth: 1,
    height: 20,
    justifyContent: 'center',
    marginRight: 8,
    width: 20,
  },
  actionOrderSelected: { backgroundColor: '#147D64', borderColor: '#147D64' },
  actionOrderText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  actionOrderTextSelected: { color: '#FFFFFF' },
  actionText: { color: '#33413C', fontSize: 13, fontWeight: '600' },
  actionTextSelected: { color: '#125E4E' },
  policyMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 13,
  },
  policyMetaText: { color: '#687570', fontSize: 11 },
  metaDivider: {
    backgroundColor: '#BAC3BF',
    borderRadius: 2,
    height: 3,
    marginHorizontal: 8,
    width: 3,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#147D64',
    borderRadius: 7,
    justifyContent: 'center',
    marginBottom: 34,
    marginTop: 22,
    minHeight: 52,
  },
  primaryButtonPressed: { backgroundColor: '#106650' },
  buttonContent: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  resultSection: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DDE3E0',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  resultHeadingRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
  },
  resultHeadingCopy: { flex: 1, paddingRight: 10 },
  statusBadge: {
    alignItems: 'center',
    backgroundColor: '#F0F2F1',
    borderRadius: 4,
    flexDirection: 'row',
    flexShrink: 0,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  statusBadgeRunning: { backgroundColor: '#EAF2FF' },
  statusBadgeSuccess: { backgroundColor: '#E8F5EF' },
  statusBadgeFailed: { backgroundColor: '#FDECEC' },
  statusDot: {
    backgroundColor: '#82908A',
    borderRadius: 3,
    height: 6,
    marginRight: 6,
    width: 6,
  },
  statusDotRunning: { backgroundColor: '#2563EB' },
  statusDotSuccess: { backgroundColor: '#147D64' },
  statusDotFailed: { backgroundColor: '#C83B3B' },
  statusBadgeText: { color: '#66736E', fontSize: 9, fontWeight: '800' },
  statusBadgeTextRunning: { color: '#1D56B3' },
  statusBadgeTextSuccess: { color: '#12664F' },
  statusBadgeTextFailed: { color: '#A82E2E' },
  resultSummary: {
    alignItems: 'flex-start',
    backgroundColor: '#F7F8F8',
    borderBottomColor: '#E4E8E6',
    borderBottomWidth: 1,
    borderTopColor: '#E4E8E6',
    borderTopWidth: 1,
    flexDirection: 'row',
    padding: 16,
  },
  resultSummaryRunning: { backgroundColor: '#F2F7FF' },
  resultSummarySuccess: { backgroundColor: '#F0F8F4' },
  resultSummaryFailed: { backgroundColor: '#FFF5F5' },
  resultIcon: {
    alignItems: 'center',
    backgroundColor: '#E7EAE9',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    marginRight: 12,
    width: 40,
  },
  resultIconRunning: { backgroundColor: '#DFEAFC' },
  resultIconSuccess: { backgroundColor: '#D9EEE4' },
  resultIconFailed: { backgroundColor: '#F8DDDD' },
  resultIconText: { color: '#65726D', fontSize: 18, fontWeight: '800' },
  resultIconTextSuccess: { color: '#147D64' },
  resultIconTextFailed: { color: '#C83B3B' },
  resultSummaryCopy: { flex: 1 },
  resultTitle: { color: '#1C2925', fontSize: 16, fontWeight: '700' },
  resultMessage: {
    color: '#5E6C67',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  flow: { paddingHorizontal: 16, paddingTop: 16 },
  flowItem: { flexDirection: 'row', minHeight: 52 },
  flowRail: { alignItems: 'center', width: 28 },
  flowMarker: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#C9D1CE',
    borderRadius: 12,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  flowMarkerComplete: { backgroundColor: '#147D64', borderColor: '#147D64' },
  flowMarkerActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  flowMarkerFailed: { backgroundColor: '#C83B3B', borderColor: '#C83B3B' },
  flowMarkerText: { color: '#7A8782', fontSize: 10, fontWeight: '800' },
  flowMarkerTextActive: { color: '#FFFFFF' },
  flowLine: { backgroundColor: '#DCE2DF', flex: 1, width: 1 },
  flowLineComplete: { backgroundColor: '#72AD98' },
  flowCopy: { flex: 1, paddingLeft: 10, paddingTop: 2 },
  flowLabel: { color: '#75817D', fontSize: 13, fontWeight: '600' },
  flowLabelActive: { color: '#24322D' },
  flowLabelFailed: { color: '#A82E2E' },
  flowState: { color: '#8A9591', fontSize: 10, marginTop: 3 },
  details: {
    borderTopColor: '#E7EBE9',
    borderTopWidth: 1,
    marginHorizontal: 16,
    paddingVertical: 8,
  },
  detailRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  detailLabel: { color: '#71807A', fontSize: 11, width: 105 },
  detailValue: {
    color: '#2D3A35',
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'right',
  },
  detailValueMono: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    fontSize: 10,
    fontWeight: '400',
  },
  mediaSection: {
    borderTopColor: '#E7EBE9',
    borderTopWidth: 1,
    paddingBottom: 16,
    paddingTop: 16,
  },
  mediaHeading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  mediaTitle: { color: '#26342F', fontSize: 13, fontWeight: '700' },
  mediaDescription: {
    color: '#75817D',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 2,
  },
  mediaCount: {
    color: '#65736E',
    fontSize: 10,
    fontWeight: '700',
    marginLeft: 12,
    marginTop: 2,
  },
  videoBlock: { marginHorizontal: 16, marginTop: 12 },
  mediaMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 7,
  },
  mediaLabel: { color: '#35443E', fontSize: 11, fontWeight: '700' },
  mediaSource: {
    color: '#6C7874',
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  video: {
    aspectRatio: 4 / 3,
    backgroundColor: '#111815',
    borderRadius: 6,
    width: '100%',
  },
  imageGallery: { gap: 10, paddingHorizontal: 16, paddingTop: 12 },
  imageItem: { width: 132 },
  evidenceImage: {
    aspectRatio: 3 / 4,
    backgroundColor: '#E8ECEA',
    borderRadius: 5,
    width: 132,
  },
  imageLabel: {
    color: '#35443E',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 7,
  },
  imageSource: {
    color: '#7C8884',
    fontSize: 9,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  rawSection: { borderTopColor: '#E7EBE9', borderTopWidth: 1 },
  rawToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 46,
    paddingHorizontal: 16,
  },
  rawToggleText: { color: '#245E50', fontSize: 12, fontWeight: '700' },
  rawChevron: { color: '#5C6A65', fontSize: 16 },
  rawOutput: {
    backgroundColor: '#18221F',
    margin: 12,
    marginTop: 0,
    maxHeight: 260,
    padding: 12,
  },
  rawOutputText: {
    color: '#D7E1DD',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    fontSize: 10,
    lineHeight: 16,
  },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.72 },
});
