export interface LivenessBackend {
  createSession(input: {
    initializationPayload: string;
  }): Promise<{ token: string }>;

  verifySession(input: {
    token: string;
    verificationPayload: string;
  }): Promise<unknown>;
}
