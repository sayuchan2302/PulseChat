import { useState, useRef, useCallback, useEffect } from 'react';
import { MicIcon } from '../icons/ChatIcons';
import { MAX_VOICE_DURATION_MS } from '../constants/chatConstants';

export interface VoiceRecorderButtonProps {
  disabled?: boolean;
  onRecorded: (blob: Blob, durationSeconds: number) => void;
}

export function VoiceRecorderButton({ disabled, onRecorded }: VoiceRecorderButtonProps) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopRecording = useCallback((cancelled = false) => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
    timerRef.current = null;
    autoStopRef.current = null;

    const mr = mediaRecorderRef.current;

    if (!mr || mr.state === 'inactive') {
      mr?.stream?.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current = null;
      setRecording(false);
      setElapsed(0);
      return;
    }

    const stream = mr.stream;

    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());

      if (!cancelled && chunksRef.current.length > 0) {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        const dur = Math.round((Date.now() - startTimeRef.current) / 1000);
        onRecorded(blob, dur);
      }
      chunksRef.current = [];
      mediaRecorderRef.current = null;
    };

    mr.stop();
    setRecording(false);
    setElapsed(0);
  }, [onRecorded]);

  const startRecording = useCallback(async () => {
    if (disabled || recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      startTimeRef.current = Date.now();

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.start(200);
      setRecording(true);
      setElapsed(0);

      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 500);

      autoStopRef.current = setTimeout(() => stopRecording(false), MAX_VOICE_DURATION_MS);
    } catch {
      // Microphone not available or denied
    }
  }, [disabled, recording, stopRecording]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
      const mr = mediaRecorderRef.current;
      if (mr) {
        try {
          if (mr.state !== 'inactive') mr.stop();
        } catch {
          // ignore
        }
        mr.stream?.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const secs = String(elapsed % 60).padStart(2, '0');

  if (recording) {
    return (
      <div className="voice-recorder-active">
        <span className="voice-recorder-dot" aria-hidden="true" />
        <span className="voice-recorder-timer">{mins}:{secs}</span>
        <button
          type="button"
          className="voice-recorder-cancel"
          onClick={() => stopRecording(true)}
          aria-label="Cancel recording"
          title="Cancel"
        >
          ✕
        </button>
        <button
          type="button"
          className="voice-recorder-send"
          onClick={() => stopRecording(false)}
          aria-label="Send voice message"
          title="Send"
        >
          ▶
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="composer-icon-btn voice-record-btn"
      onClick={startRecording}
      disabled={disabled}
      aria-label="Record voice message"
      title="Voice message"
    >
      <MicIcon className="composer-icon" />
    </button>
  );
}

export default VoiceRecorderButton;
