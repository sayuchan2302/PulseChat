export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api';
export const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL || 'http://localhost:8080/api/ws';

function splitEnvList(value?: string) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildRtcIceServers(): RTCIceServer[] {
  const stunUrls = splitEnvList(import.meta.env.VITE_RTC_STUN_URLS);
  const turnUrls = splitEnvList(import.meta.env.VITE_RTC_TURN_URLS);
  const turnUsername = import.meta.env.VITE_RTC_TURN_USERNAME?.trim();
  const turnCredential = import.meta.env.VITE_RTC_TURN_CREDENTIAL?.trim();

  const iceServers: RTCIceServer[] = [
    {
      urls: stunUrls.length > 0 ? stunUrls : ['stun:stun.l.google.com:19302'],
    },
  ];

  if (turnUrls.length > 0) {
    iceServers.push({
      urls: turnUrls,
      username: turnUsername || undefined,
      credential: turnCredential || undefined,
    });
  }

  return iceServers;
}

export const RTC_ICE_SERVERS = buildRtcIceServers();
const configuredCallRingingTimeoutMs = Number(import.meta.env.VITE_CALL_RINGING_TIMEOUT_MS || 45_000);
export const CALL_RINGING_TIMEOUT_MS =
  Number.isFinite(configuredCallRingingTimeoutMs) && configuredCallRingingTimeoutMs > 0
    ? configuredCallRingingTimeoutMs
    : 45_000;

export const ROUTES = {
  HOME: '/',
  LOGIN: '/',
  REGISTER: '/',
  CHAT: '/chat',
  PROFILE: '/profile',
} as const;
