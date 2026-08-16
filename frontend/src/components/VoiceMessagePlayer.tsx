import React, { useState, useRef, useEffect, useCallback } from 'react';

export interface VoiceMessagePlayerProps {
  src: string;
  durationSeconds?: number | null;
}

export function VoiceMessagePlayer({ src, durationSeconds }: VoiceMessagePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds || 0);

  useEffect(() => {
    if (durationSeconds && durationSeconds > 0) {
      setDuration(durationSeconds);
    }
  }, [durationSeconds]);

  const handleLoadedMetadata = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.duration && isFinite(a.duration) && a.duration > 0) {
      setDuration(Math.round(a.duration));
    } else if (a.duration === Infinity && (!durationSeconds || durationSeconds <= 0)) {
      // Chromium WebM duration fix trick: seek to infinity to force browser demuxer to calculate duration
      a.currentTime = 1e101;
      const onTimeUpdate = () => {
        a.removeEventListener('timeupdate', onTimeUpdate);
        a.currentTime = 0;
        if (isFinite(a.duration) && a.duration > 0) {
          setDuration(Math.round(a.duration));
        }
      };
      a.addEventListener('timeupdate', onTimeUpdate);
    }
  }, [durationSeconds]);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      a.play().then(() => setPlaying(true)).catch(() => { });
    }
  };

  const handleTimeUpdate = () => {
    const a = audioRef.current;
    if (a && isFinite(a.currentTime)) {
      setCurrentTime(a.currentTime);
      if (a.duration && isFinite(a.duration) && a.duration > 0 && (!durationSeconds || durationSeconds <= 0)) {
        setDuration(Math.round(a.duration));
      }
    }
  };

  const handleEnded = () => {
    setPlaying(false);
    setCurrentTime(0);
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    const a = audioRef.current;
    if (a && isFinite(val)) {
      a.currentTime = val;
      setCurrentTime(val);
    }
  };

  const fmt = (s: number) => {
    if (!isFinite(s) || isNaN(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = String(Math.floor(s % 60)).padStart(2, '0');
    return `${m}:${sec}`;
  };

  const validMax = duration > 0 ? duration : 1;
  const validValue = Math.min(currentTime, validMax);

  return (
    <div className="voice-player">
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        preload="metadata"
      />
      <button
        type="button"
        className="voice-player-btn"
        onClick={togglePlay}
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
        title={playing ? 'Pause' : 'Play'}
      >
        {playing ? '⏸' : '▶'}
      </button>
      <div className="voice-player-track">
        <input
          type="range"
          className="voice-player-scrub"
          min={0}
          max={validMax}
          step={0.1}
          value={validValue}
          onChange={handleScrub}
          aria-label="Seek"
        />
        <span className="voice-player-time">
          {fmt(currentTime)} / {fmt(duration)}
        </span>
      </div>
    </div>
  );
}

export default VoiceMessagePlayer;
