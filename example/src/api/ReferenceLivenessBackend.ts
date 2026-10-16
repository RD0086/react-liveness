import type { LivenessBackend } from './LivenessBackend';

// Demo credential copied from the reference UniApp demo.
const ALIYUN_APPCODE = 'uniapp_demo_test_9dd884ac564e2e51';
const DIRECT_APPCODE = 'TODO';
const DIRECT_SECRET_KEY = 'TODO';

const DIRECT_GATEWAY = 'https://edis.esandcloud.com/gateways';
const ALIYUN_INIT_URL = 'https://eface.market.alicloudapi.com/init';
const ALIYUN_VERIFY_URL = 'https://eface.market.alicloudapi.com/verify';

type GatewayAction = 'init' | 'verify';

export class ReferenceLivenessBackend implements LivenessBackend {
  async createSession(input: {
    initializationPayload: string;
  }): Promise<{ token: string }> {
    const response = await this.request('init', {
      initMsg: input.initializationPayload,
    });
    const token = readToken(response);
    if (!token) {
      throw new Error('The initialization gateway returned no token.');
    }
    return { token };
  }

  verifySession(input: {
    token: string;
    verificationPayload: string;
  }): Promise<unknown> {
    return this.request('verify', {
      token: input.token,
      verifyMsg: input.verificationPayload,
    });
  }

  private async request(
    action: GatewayAction,
    form: Record<string, string>
  ): Promise<unknown> {
    const gateway = getGateway(action);
    const response = await fetch(gateway.url, {
      method: 'POST',
      headers: {
        'Authorization': `APPCODE ${gateway.secret}`,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Ca-Nonce': Math.round(Math.random() * 100000000).toString(),
      },
      body: Object.entries(form)
        .map(
          ([key, value]) =>
            `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
        )
        .join('&'),
    });
    const text = await response.text();
    const data = parseResponse(text);
    if (!response.ok) {
      throw new Error(
        `Gateway request failed with HTTP ${response.status}: ${text}`
      );
    }
    return data;
  }
}

function getGateway(action: GatewayAction): { url: string; secret: string } {
  if (DIRECT_APPCODE && DIRECT_APPCODE !== 'TODO') {
    return {
      url:
        `${DIRECT_GATEWAY}?APPCODE=${encodeURIComponent(DIRECT_APPCODE)}` +
        `&ACTION=livingdetection/livingdetect/${action}`,
      secret: DIRECT_SECRET_KEY,
    };
  }
  if (!ALIYUN_APPCODE) {
    throw new Error(
      'Configure direct gateway credentials or ALIYUN_APPCODE in ReferenceLivenessBackend.ts.'
    );
  }
  return {
    url: action === 'init' ? ALIYUN_INIT_URL : ALIYUN_VERIFY_URL,
    secret: ALIYUN_APPCODE,
  };
}

function parseResponse(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readToken(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.token === 'string') return record.token;
  return readToken(record.data);
}
