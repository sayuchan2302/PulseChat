import { act, cleanup, renderHook } from '@testing-library/react';
import type { SetStateAction } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActiveCall } from '../types/chat.types';
import { useCallDeviceSwitching } from './useCallDeviceSwitching';

class MockMediaStream {
  private tracks: MediaStreamTrack[];

  constructor(tracks: MediaStreamTrack[] = []) {
    this.tracks = [...tracks];
  }

  getTracks() {
    return [...this.tracks];
  }

  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === 'audio');
  }

  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === 'video');
  }

  addTrack(track: MediaStreamTrack) {
    this.tracks.push(track);
  }

  removeTrack(track: MediaStreamTrack) {
    this.tracks = this.tracks.filter((item) => item !== track);
  }
}

function createTrack(kind: 'audio' | 'video') {
  const track = {
    kind,
    readyState: 'live' as MediaStreamTrackState,
    enabled: true,
    stop: vi.fn(function (this: { readyState: MediaStreamTrackState }) {
      this.readyState = 'ended';
    }),
    getSettings: vi.fn(() => ({ deviceId: 'replacement-device' })),
  };

  return track as unknown as MediaStreamTrack;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function createDeviceSwitchContext(getUserMedia: () => Promise<MediaStream>) {
  const currentAudioTrack = createTrack('audio');
  const currentVideoTrack = createTrack('video');
  const localStream = new MockMediaStream([currentAudioTrack, currentVideoTrack]) as unknown as MediaStream;
  const replaceTrack = vi.fn(async (_track: MediaStreamTrack | null) => {});
  const peerConnection = {
    getSenders: () => [
      { track: currentAudioTrack, replaceTrack },
      { track: currentVideoTrack, replaceTrack },
    ],
  } as unknown as RTCPeerConnection;
  const refs = {
    activeCallRef: {
      current: {
        callId: 42,
        type: 'VIDEO',
        status: 'connected',
        direction: 'outgoing',
        peer: { id: 7, username: 'peer' },
      } as unknown as ActiveCall | null,
    },
    peerConnectionRef: { current: peerConnection as RTCPeerConnection | null },
    localCallStreamRef: { current: localStream as MediaStream | null },
    screenSharingRef: { current: false },
    micMutedRef: { current: false },
    cameraOffRef: { current: false },
  };
  const setters = {
    loadCallDevices: vi.fn(async () => {}),
    setCallDeviceError: vi.fn((_error: SetStateAction<string>) => {}),
    setLocalCallStream: vi.fn((_stream: SetStateAction<MediaStream | null>) => {}),
    setSelectedAudioInputId: vi.fn((_deviceId: SetStateAction<string>) => {}),
    setSelectedVideoInputId: vi.fn((_deviceId: SetStateAction<string>) => {}),
  };
  const hook = renderHook(() => useCallDeviceSwitching({ ...refs, ...setters }));

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });

  return { ...hook, refs, setters, replaceTrack };
}

const mediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');

beforeEach(() => {
  vi.stubGlobal('MediaStream', MockMediaStream as unknown as typeof MediaStream);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  if (mediaDevicesDescriptor) {
    Object.defineProperty(navigator, 'mediaDevices', mediaDevicesDescriptor);
  } else {
    Reflect.deleteProperty(navigator, 'mediaDevices');
  }
});

describe('useCallDeviceSwitching', () => {
  it('stops a replacement stream returned after its call has ended', async () => {
    const mediaResult = deferred<MediaStream>();
    const context = createDeviceSwitchContext(() => mediaResult.promise);
    const replacementTrack = createTrack('audio');
    const replacementStream = new MockMediaStream([replacementTrack]) as unknown as MediaStream;
    let switchPromise!: Promise<void>;

    act(() => {
      switchPromise = context.result.current.replaceLocalCallTrack('audio', 'mic-2');
    });
    act(() => {
      context.refs.activeCallRef.current = null;
      context.refs.localCallStreamRef.current = null;
      context.refs.peerConnectionRef.current = null;
    });
    mediaResult.resolve(replacementStream);

    await act(async () => {
      await switchPromise;
    });

    expect(replacementTrack.stop).toHaveBeenCalledOnce();
    expect(context.replaceTrack).not.toHaveBeenCalled();
    expect(context.setters.setLocalCallStream).not.toHaveBeenCalled();
  });

  it('stops a track when replaceTrack resolves after its call has ended', async () => {
    const replacementTrack = createTrack('audio');
    const replacementStream = new MockMediaStream([replacementTrack]) as unknown as MediaStream;
    const replaceResult = deferred<void>();
    const context = createDeviceSwitchContext(async () => replacementStream);
    context.replaceTrack.mockImplementation(() => replaceResult.promise);
    let switchPromise!: Promise<void>;

    act(() => {
      switchPromise = context.result.current.replaceLocalCallTrack('audio', 'mic-2');
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(context.replaceTrack).toHaveBeenCalledOnce();
    act(() => {
      context.refs.activeCallRef.current = null;
      context.refs.localCallStreamRef.current = null;
      context.refs.peerConnectionRef.current = null;
    });
    replaceResult.resolve();

    await act(async () => {
      await switchPromise;
    });

    expect(replacementTrack.stop).toHaveBeenCalledOnce();
    expect(context.setters.setLocalCallStream).not.toHaveBeenCalled();
  });

  it('does not replace the camera while screen sharing starts', async () => {
    const mediaResult = deferred<MediaStream>();
    const context = createDeviceSwitchContext(() => mediaResult.promise);
    const replacementTrack = createTrack('video');
    const replacementStream = new MockMediaStream([replacementTrack]) as unknown as MediaStream;
    let switchPromise!: Promise<void>;

    act(() => {
      switchPromise = context.result.current.replaceLocalCallTrack('video', 'camera-2');
    });
    act(() => {
      context.refs.screenSharingRef.current = true;
    });
    mediaResult.resolve(replacementStream);

    await act(async () => {
      await switchPromise;
    });

    expect(replacementTrack.stop).toHaveBeenCalledOnce();
    expect(context.replaceTrack).not.toHaveBeenCalled();
    expect(context.setters.setLocalCallStream).not.toHaveBeenCalled();
  });
});
