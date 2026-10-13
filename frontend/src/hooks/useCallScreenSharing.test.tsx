import { act, cleanup, renderHook } from '@testing-library/react';
import type { SetStateAction } from 'react';
import type { CallSignalPayload } from '../types';
import type { ActiveCall } from '../types/chat.types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCallScreenSharing } from './useCallScreenSharing';

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

function createTrack(kind: 'audio' | 'video' = 'video') {
  const track = {
    kind,
    readyState: 'live' as MediaStreamTrackState,
    enabled: true,
    onended: null as MediaStreamTrack['onended'],
    stop: vi.fn(function (this: { readyState: MediaStreamTrackState }) {
      this.readyState = 'ended';
    }),
    getSettings: vi.fn(() => ({ deviceId: 'camera-1' })),
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

function createCallContext() {
  const cameraTrack = createTrack();
  const localStream = new MockMediaStream([cameraTrack]) as unknown as MediaStream;
  const replaceTrack = vi.fn(async (_track: MediaStreamTrack | null) => {});
  const peerConnection = {
    getSenders: () => [{ track: cameraTrack, replaceTrack }],
  } as unknown as RTCPeerConnection;
  const activeCall = {
    callId: 42,
    type: 'VIDEO',
    status: 'connected',
    direction: 'outgoing',
    peer: { id: 7, username: 'peer' },
  } as unknown as ActiveCall;
  const refs = {
    activeCallRef: { current: activeCall as ActiveCall | null },
    localCallStreamRef: { current: localStream as MediaStream | null },
    peerConnectionRef: { current: peerConnection as RTCPeerConnection | null },
    screenSharingRef: { current: false },
    screenShareStreamRef: { current: null as MediaStream | null },
    screenShareCameraTrackRef: { current: null as MediaStreamTrack | null },
    screenShareStoppingRef: { current: false },
    cameraOffRef: { current: false },
  };
  const setters = {
    applySelectedDeviceIdsFromStream: vi.fn((_stream: MediaStream) => {}),
    sendCallSignal: vi.fn((_payload: CallSignalPayload) => true),
    setLocalCallStream: vi.fn((_stream: SetStateAction<MediaStream | null>) => {}),
    setScreenSharing: vi.fn((_sharing: SetStateAction<boolean>) => {}),
    setRemoteScreenSharing: vi.fn((_sharing: SetStateAction<boolean>) => {}),
    setScreenShareError: vi.fn((_error: SetStateAction<string>) => {}),
  };

  const hook = renderHook(() => useCallScreenSharing({ ...refs, ...setters }));

  return { ...hook, refs, setters, cameraTrack, replaceTrack };
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

describe('useCallScreenSharing', () => {
  it('stops a display stream returned after the call has ended', async () => {
    const displayResult = deferred<MediaStream>();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getDisplayMedia: vi.fn(() => displayResult.promise) },
    });
    const context = createCallContext();
    const screenTrack = createTrack();
    const displayStream = new MockMediaStream([screenTrack]) as unknown as MediaStream;
    let startPromise!: Promise<void>;

    act(() => {
      startPromise = context.result.current.handleStartScreenShare();
    });
    act(() => {
      context.result.current.stopScreenShareResources();
      context.refs.activeCallRef.current = null;
      context.refs.localCallStreamRef.current = null;
      context.refs.peerConnectionRef.current = null;
    });
    displayResult.resolve(displayStream);

    await act(async () => {
      await startPromise;
    });

    expect(screenTrack.stop).toHaveBeenCalledOnce();
    expect(context.replaceTrack).not.toHaveBeenCalled();
    expect(context.setters.setLocalCallStream).not.toHaveBeenCalled();
  });

  it('does not update call state when replaceTrack finishes after cleanup', async () => {
    const displayStreamPromise = Promise.resolve(
      new MockMediaStream([createTrack()]) as unknown as MediaStream,
    );
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getDisplayMedia: vi.fn(() => displayStreamPromise) },
    });
    const replaceResult = deferred<void>();
    const context = createCallContext();
    context.replaceTrack.mockImplementation(() => replaceResult.promise);
    let startPromise!: Promise<void>;

    act(() => {
      startPromise = context.result.current.handleStartScreenShare();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(context.replaceTrack).toHaveBeenCalledOnce();
    act(() => {
      context.result.current.stopScreenShareResources();
      context.refs.activeCallRef.current = null;
      context.refs.localCallStreamRef.current = null;
      context.refs.peerConnectionRef.current = null;
    });
    replaceResult.resolve();

    await act(async () => {
      await startPromise;
    });

    expect(context.setters.setLocalCallStream).not.toHaveBeenCalled();
    expect(context.refs.screenSharingRef.current).toBe(false);
  });

  it('does not restore camera state when a pending stop finishes after cleanup', async () => {
    const screenTrack = createTrack();
    const displayStreamPromise = Promise.resolve(
      new MockMediaStream([screenTrack]) as unknown as MediaStream,
    );
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getDisplayMedia: vi.fn(() => displayStreamPromise) },
    });
    const stopResult = deferred<void>();
    const context = createCallContext();
    context.replaceTrack
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(() => stopResult.promise);

    await act(async () => {
      await context.result.current.handleStartScreenShare();
    });
    expect(context.setters.setLocalCallStream).toHaveBeenCalledOnce();

    let stopPromise!: Promise<void>;
    act(() => {
      stopPromise = context.result.current.handleStopScreenShare();
    });
    expect(context.replaceTrack).toHaveBeenCalledTimes(2);
    act(() => {
      context.result.current.stopScreenShareResources();
      context.refs.activeCallRef.current = null;
      context.refs.localCallStreamRef.current = null;
      context.refs.peerConnectionRef.current = null;
    });
    stopResult.resolve();

    await act(async () => {
      await stopPromise;
    });

    expect(context.setters.setLocalCallStream).toHaveBeenCalledOnce();
    expect(context.refs.screenSharingRef.current).toBe(false);
  });

  it('finishes stopping screen sharing if a microphone switch replaces the local stream wrapper', async () => {
    const screenTrack = createTrack();
    const displayStreamPromise = Promise.resolve(
      new MockMediaStream([screenTrack]) as unknown as MediaStream,
    );
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getDisplayMedia: vi.fn(() => displayStreamPromise) },
    });
    const stopResult = deferred<void>();
    const context = createCallContext();
    context.replaceTrack
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(() => stopResult.promise);

    await act(async () => {
      await context.result.current.handleStartScreenShare();
    });

    const replacementAudioTrack = createTrack('audio');
    const latestLocalStream = new MockMediaStream([screenTrack, replacementAudioTrack]) as unknown as MediaStream;
    let stopPromise!: Promise<void>;
    act(() => {
      stopPromise = context.result.current.handleStopScreenShare();
    });
    expect(context.replaceTrack).toHaveBeenCalledTimes(2);

    act(() => {
      context.refs.localCallStreamRef.current = latestLocalStream;
    });
    stopResult.resolve();

    await act(async () => {
      await stopPromise;
    });

    expect(context.refs.localCallStreamRef.current?.getAudioTracks()).toEqual([replacementAudioTrack]);
    expect(context.refs.localCallStreamRef.current?.getVideoTracks()).toEqual([context.cameraTrack]);
    expect(screenTrack.stop).toHaveBeenCalledOnce();
    expect(context.refs.screenSharingRef.current).toBe(false);
    expect(context.setters.sendCallSignal).toHaveBeenCalledWith({
      eventType: 'SCREEN_SHARE_STOP',
      callId: 42,
    });
  });
});
