import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mic, Square, RefreshCw, Pause, Play } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import AudioMeter from '@/components/audio-meter';

interface InlineVoiceRecorderProps {
  fieldName: string;
  onTranscription: (text: string, fieldName: string) => void;
  onClose: () => void;
}

interface AudioDevice {
  deviceId: string;
  label: string;
}

export default function InlineVoiceRecorder({ fieldName, onTranscription, onClose }: InlineVoiceRecorderProps) {
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [recordingTime, setRecordingTime] = useState(0);
  const [noMicFound, setNoMicFound] = useState(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const isRecordingRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Hard-release the mic and all audio plumbing
  const releaseMic = () => {
    try { sourceRef.current?.disconnect(); } catch (_) {}
    sourceRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try { audioContextRef.current.close(); } catch (_) {}
    }
    audioContextRef.current = null;
    setAnalyser(null);
  };

  const refreshDevices = async () => {
    try {
      // Briefly request mic permission so labels are populated, then immediately release
      const probeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      probeStream.getTracks().forEach(t => t.stop());
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices
        .filter(device => device.kind === 'audioinput' && device.deviceId !== 'default')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${device.deviceId.slice(0, 5)}`,
        }));
      setAudioDevices(audioInputs);
      return audioInputs;
    } catch (error) {
      console.error('Error getting audio devices:', error);
      setNoMicFound(true);
      return [];
    }
  };

  // On mount: enumerate devices and let the user pick — do NOT auto-start
  useEffect(() => {
    (async () => {
      const audioInputs = await refreshDevices();
      if (audioInputs.length > 0) {
        setSelectedDevice(audioInputs[0].deviceId);
      } else {
        setNoMicFound(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRecordingWithDevice = async (deviceId?: string) => {
    const targetDevice = deviceId || selectedDevice;
    // Make sure no leftover stream is hogging the mic
    releaseMic();
    try {
      const constraints = {
        audio: {
          deviceId: targetDevice ? { exact: targetDevice } : undefined,
          sampleRate: 44100,
          channelCount: 1,
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      an.smoothingTimeConstant = 0.6;
      source.connect(an);
      setAnalyser(an);

      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        // Always release the mic on stop, regardless of why we stopped
        releaseMic();

        // If we were stopped just to switch devices or were closed, don't transcribe
        if (!isRecordingRef.current) return;
        isRecordingRef.current = false;

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });
        if (audioBlob.size < 1000) {
          toast({
            title: "Recording too short",
            description: "Please record for at least 1 second before stopping.",
            variant: "destructive",
            duration: 3000,
          });
          return;
        }
        await processTranscription(audioBlob);
      };

      recorder.start();
      isRecordingRef.current = true;
      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      toast({
        title: "🎤 Recording Started",
        description: `Recording to ${fieldName} field — speak clearly`,
        duration: 2000,
      });

    } catch (error) {
      console.error('Error starting recording:', error);
      releaseMic();
      setNoMicFound(true);
      toast({
        title: "Recording Error",
        description: "Failed to start recording. Please check microphone permissions.",
        variant: "destructive"
      });
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try { mediaRecorderRef.current.pause(); } catch (_) {}
      setIsPaused(true);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      try { mediaRecorderRef.current.resume(); } catch (_) {}
      setIsPaused(false);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && (mediaRecorderRef.current.state === 'recording' || mediaRecorderRef.current.state === 'paused')) {
      // Keep isRecordingRef true so onstop handler knows to transcribe
      try { mediaRecorderRef.current.stop(); } catch (_) {}
      setIsRecording(false);
      setIsPaused(false);
      if (timerRef.current) clearInterval(timerRef.current);
      // Belt-and-braces: release the mic immediately so the browser's mic indicator turns off
      releaseMic();

      toast({
        title: "🔄 Processing Recording",
        description: "Converting speech to text using Whisper AI…",
        duration: 2000,
      });
    }
  };

  const handleDeviceChange = (newDeviceId: string) => {
    if (isRecording) {
      // Discard the in-progress recording and restart fresh on the new mic
      isRecordingRef.current = false; // skip transcription in onstop
      try { mediaRecorderRef.current?.stop(); } catch (_) {}
      releaseMic();
      audioChunksRef.current = [];
      setSelectedDevice(newDeviceId);
      setIsRecording(false);
      setIsPaused(false);
      if (timerRef.current) clearInterval(timerRef.current);
      setRecordingTime(0);
      toast({
        title: "Microphone changed",
        description: "Recording was reset. Click Start to begin again on the new mic.",
        duration: 3000,
      });
    } else {
      setSelectedDevice(newDeviceId);
    }
  };

  const handleClose = () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    isRecordingRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch (_) {}
    }
    if (timerRef.current) clearInterval(timerRef.current);
    releaseMic();
    onClose();
  };

  const processTranscription = async (audioBlob: Blob) => {
    try {
      setIsProcessing(true);

      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('model', 'whisper-1');

      abortControllerRef.current = new AbortController();
      const timeoutId = setTimeout(() => abortControllerRef.current?.abort(), 30000);

      const res = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        signal: abortControllerRef.current.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Server error ${res.status}`);
      }

      const result = await res.json();

      if (result.text) {
        const cleanText = result.text.trim();
        onTranscription(cleanText, fieldName);
        toast({
          title: "✅ Transcription Complete",
          description: `Added text to ${fieldName} field`,
          duration: 3000,
        });
        setTimeout(() => onClose(), 500);
      } else {
        toast({
          title: "No speech detected",
          description: "Nothing was transcribed. Please try again.",
          variant: "destructive",
          duration: 3000,
        });
      }

    } catch (error: any) {
      if (error?.name === 'AbortError') {
        toast({
          title: "Transcription cancelled",
          description: "The request was cancelled or timed out.",
          variant: "destructive",
          duration: 3000,
        });
      } else {
        console.error('Transcription error:', error);
        toast({
          title: "Transcription Failed",
          description: error.message || "Failed to transcribe audio. Please try again.",
          variant: "destructive",
          duration: 4000,
        });
      }
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Cleanup on unmount — make sure the mic is fully released
  useEffect(() => {
    return () => {
      isRecordingRef.current = false;
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch (_) {}
      }
      if (timerRef.current) clearInterval(timerRef.current);
      releaseMic();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm flex items-center gap-1.5">
          <Mic className="w-3.5 h-3.5" />
          Voice Recording — {fieldName}
        </h4>
        <Button variant="ghost" size="sm" onClick={handleClose}>
          ✕
        </Button>
      </div>

      {noMicFound && (
        <p className="text-sm text-red-600">No microphone found. Please connect a microphone and try again.</p>
      )}

      {!noMicFound && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Input device</label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[11px] text-gray-500"
              disabled={isRecording && !isPaused}
              onClick={refreshDevices}
            >
              <RefreshCw className="w-3 h-3 mr-1" /> Refresh
            </Button>
          </div>
          <Select value={selectedDevice} onValueChange={handleDeviceChange} disabled={isRecording && !isPaused}>
            <SelectTrigger className="h-8 text-sm" data-testid="select-mic-device">
              <SelectValue placeholder="Select microphone" />
            </SelectTrigger>
            <SelectContent>
              {audioDevices.map(device => (
                <SelectItem key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isRecording && !isProcessing && (
            <p className="text-[11px] text-gray-500">Pick your microphone, then click Start.</p>
          )}
          {isPaused && (
            <p className="text-[11px] text-amber-600">Paused — pick a different mic to switch (this resets the recording).</p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {isRecording && !isPaused && (
            <div className="flex items-center space-x-2 text-red-600">
              <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium">RECORDING</span>
            </div>
          )}
          {isRecording && isPaused && (
            <div className="flex items-center space-x-2 text-amber-600">
              <Pause className="w-3 h-3" />
              <span className="text-sm font-medium">PAUSED</span>
            </div>
          )}
          {isProcessing && (
            <div className="flex items-center space-x-2 text-blue-600">
              <div className="animate-spin rounded-full h-3 w-3 border-2 border-blue-600 border-t-transparent"></div>
              <span className="text-sm font-medium">TRANSCRIBING…</span>
            </div>
          )}
          {(isRecording || recordingTime > 0) && !isProcessing && (
            <span className={`font-mono text-sm ${isRecording && !isPaused ? 'text-red-600' : isPaused ? 'text-amber-600' : 'text-gray-600'}`}>
              {formatTime(recordingTime)}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {!isRecording && !isProcessing && !noMicFound && (
            <Button
              onClick={() => startRecordingWithDevice()}
              disabled={!selectedDevice}
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white"
              data-testid="button-start-recording"
            >
              <Mic className="w-4 h-4 mr-1" />
              Start
            </Button>
          )}
          {isRecording && !isPaused && (
            <Button
              onClick={pauseRecording}
              size="sm"
              variant="outline"
              className="border-amber-600 text-amber-700 hover:bg-amber-50"
              data-testid="button-pause-recording"
            >
              <Pause className="w-4 h-4 mr-1" />
              Pause
            </Button>
          )}
          {isRecording && isPaused && (
            <Button
              onClick={resumeRecording}
              size="sm"
              variant="outline"
              className="border-green-600 text-green-700 hover:bg-green-50"
              data-testid="button-resume-recording"
            >
              <Play className="w-4 h-4 mr-1" />
              Resume
            </Button>
          )}
          {isRecording && (
            <Button
              onClick={stopRecording}
              size="sm"
              variant="outline"
              className="border-red-600 text-red-600 hover:bg-red-50"
              data-testid="button-stop-recording"
            >
              <Square className="w-4 h-4 mr-1" />
              Stop &amp; Transcribe
            </Button>
          )}
          {isProcessing && (
            <Button
              onClick={handleClose}
              size="sm"
              variant="outline"
              className="border-gray-400 text-gray-600"
            >
              Cancel
            </Button>
          )}
        </div>
      </div>

      {isRecording && !isPaused && (
        <AudioMeter analyser={analyser} active={isRecording && !isPaused} height={56} bars={36} />
      )}

      <div className="text-xs text-gray-500">
        {!isRecording && !isProcessing && !noMicFound && (
          <p>Pick a microphone above, then click "Start". Speak clearly then click "Stop &amp; Transcribe".</p>
        )}
        {isRecording && !isPaused && (
          <p>Speak now… click "Pause" to swap microphones or "Stop &amp; Transcribe" when finished.</p>
        )}
        {isPaused && (
          <p>Recording is paused. Click Resume to continue, or change microphone to start over.</p>
        )}
        {isProcessing && (
          <p>Processing with Whisper AI. You can cancel at any time.</p>
        )}
      </div>
    </div>
  );
}
