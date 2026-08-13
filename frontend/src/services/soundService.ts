type SoundType = 'notification' | 'mention' | 'callRing' | 'messageSent';

const SOUND_PATHS: Record<SoundType, string> = {
  notification: '/sounds/notification.wav',
  mention: '/sounds/mention.wav',
  callRing: '/sounds/call-ring.wav',
  messageSent: '/sounds/message-sent.wav',
};

const STORAGE_KEY_MUTED = 'chat_sound_muted';

class SoundService {
  private audioElements: Partial<Record<SoundType, HTMLAudioElement>> = {};
  private ringtoneInterval: number | null = null;
  private isMutedState = false;
  private listeners: Set<(muted: boolean) => void> = new Set();
  private audioContext: AudioContext | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_MUTED);
        this.isMutedState = saved === 'true';
      } catch {
        this.isMutedState = false;
      }
      this.preloadSounds();
    }
  }

  private preloadSounds() {
    if (typeof window === 'undefined') return;
    (Object.keys(SOUND_PATHS) as SoundType[]).forEach((type) => {
      try {
        const audio = new Audio(SOUND_PATHS[type]);
        audio.preload = 'auto';
        this.audioElements[type] = audio;
      } catch (err) {
        console.warn(`[SoundService] Failed to preload sound ${type}:`, err);
      }
    });
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx();
      }
    }
    if (this.audioContext && this.audioContext.state === 'suspended') {
      void this.audioContext.resume();
    }
    return this.audioContext;
  }

  public isMuted(): boolean {
    return this.isMutedState;
  }

  public setMuted(muted: boolean) {
    this.isMutedState = muted;
    try {
      localStorage.setItem(STORAGE_KEY_MUTED, String(muted));
    } catch {
      // ignore
    }
    if (muted) {
      this.stopIncomingCallRingtone();
    }
    this.listeners.forEach((l) => l(muted));
  }

  public toggleMuted(): boolean {
    this.setMuted(!this.isMutedState);
    return this.isMutedState;
  }

  public onMuteChange(listener: (muted: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private playAudio(type: SoundType, volume = 0.6) {
    if (this.isMutedState) return;

    try {
      let audio = this.audioElements[type];
      if (!audio) {
        audio = new Audio(SOUND_PATHS[type]);
        this.audioElements[type] = audio;
      }
      audio.volume = Math.max(0, Math.min(1, volume));
      audio.currentTime = 0;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          this.fallbackSynthesize(type);
        });
      }
    } catch {
      this.fallbackSynthesize(type);
    }
  }

  private fallbackSynthesize(type: SoundType) {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const startAt = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, startAt);

    if (type === 'notification') {
      masterGain.gain.exponentialRampToValueAtTime(0.05, startAt + 0.02);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.4);
      masterGain.connect(ctx.destination);
      [
        { freq: 659.25, delay: 0, dur: 0.22 },
        { freq: 880, delay: 0.08, dur: 0.26 },
      ].forEach((n) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(n.freq, startAt + n.delay);
        osc.connect(masterGain);
        osc.start(startAt + n.delay);
        osc.stop(startAt + n.delay + n.dur);
      });
    } else if (type === 'mention') {
      masterGain.gain.exponentialRampToValueAtTime(0.06, startAt + 0.02);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.5);
      masterGain.connect(ctx.destination);
      [
        { freq: 587.33, delay: 0, dur: 0.2 },
        { freq: 739.99, delay: 0.07, dur: 0.25 },
        { freq: 987.77, delay: 0.14, dur: 0.32 },
      ].forEach((n) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(n.freq, startAt + n.delay);
        osc.connect(masterGain);
        osc.start(startAt + n.delay);
        osc.stop(startAt + n.delay + n.dur);
      });
    } else if (type === 'messageSent') {
      masterGain.gain.exponentialRampToValueAtTime(0.04, startAt + 0.01);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.15);
      masterGain.connect(ctx.destination);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(700, startAt);
      osc.frequency.exponentialRampToValueAtTime(350, startAt + 0.14);
      osc.connect(masterGain);
      osc.start(startAt);
      osc.stop(startAt + 0.15);
    }
  }

  public playNotificationSound() {
    this.playAudio('notification', 0.6);
  }

  public playMentionSound() {
    this.playAudio('mention', 0.7);
  }

  public playMessageSentSound() {
    this.playAudio('messageSent', 0.35);
  }

  public startIncomingCallRingtone() {
    if (this.isMutedState || this.ringtoneInterval) return;
    this.playAudio('callRing', 0.7);
    this.ringtoneInterval = window.setInterval(() => {
      this.playAudio('callRing', 0.7);
    }, 1500);
  }

  public stopIncomingCallRingtone() {
    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
    const audio = this.audioElements.callRing;
    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        // ignore
      }
    }
  }
}

export const soundService = new SoundService();
