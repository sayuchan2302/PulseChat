import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  isPushSupported,
  urlBase64ToUint8Array,
  subscribeToPush,
  unsubscribeFromPush,
  getPushSubscription,
} from './pushService';

describe('pushService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('urlBase64ToUint8Array', () => {
    it('converts base64url string to Uint8Array', () => {
      // standard base64 for "Hello World": "SGVsbG8gV29ybGQ="
      // base64url without padding: "SGVsbG8gV29ybGQ"
      const result = urlBase64ToUint8Array('SGVsbG8gV29ybGQ');
      const decoded = new TextDecoder().decode(result);
      expect(decoded).toBe('Hello World');
    });

    it('correctly decodes strings with URL-safe replacement characters (- and _)', () => {
      // "+/==" in base64url is "-_"
      const result = urlBase64ToUint8Array('-_');
      expect(result.length).toBe(1);
    });
  });

  describe('push environment checks', () => {
    it('returns false for isPushSupported when PushManager is not in window', () => {
      expect(isPushSupported()).toBe(false);
    });

    it('returns null for getPushSubscription when not supported', async () => {
      const sub = await getPushSubscription();
      expect(sub).toBeNull();
    });

    it('returns false for subscribeToPush when environment is unsupported', async () => {
      const ok = await subscribeToPush();
      expect(ok).toBe(false);
    });

    it('returns false for unsubscribeFromPush when environment is unsupported', async () => {
      const ok = await unsubscribeFromPush();
      expect(ok).toBe(false);
    });
  });
});

