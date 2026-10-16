import type { LivenessBackend } from './LivenessBackend';

export class HttpLivenessBackend implements LivenessBackend {
  constructor(private readonly baseUrl: string) {}

  async createSession(input: {
    initializationPayload: string;
  }): Promise<{ token: string }> {
    return this.post('/liveness/session', input);
  }

  async verifySession(input: {
    token: string;
    verificationPayload: string;
  }): Promise<unknown> {
    return this.post('/liveness/verify', input);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Backend request failed with HTTP ${response.status}.`);
    }
    return (await response.json()) as T;
  }
}
