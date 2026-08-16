import React, { useState, useRef, useEffect } from 'react';

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
    if (a) setCurrentTime(a.currentTime);
  };

  const handleLoadedMetadata = () => {
    const a = audioRef.current;
    if (a && a.duration && isFinite(a.duration)) {
      setDuration(Math.round(a.duration));
    }
  };

  const handleEnded = () => {
    setPlaying(false);
    setCurrentTime(0);
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    const a = audioRef.current;
    if (a) {
      a.currentTime = val;
      setCurrentTime(val);
    }
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = String(Math.floor(s % 60)).padStart(2, '0');
    return `${m}:${sec}`;
  };

  return (
    <div className="voice-player">
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
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
          max={duration || 1}
          step={0.5}
          value={currentTime}
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
