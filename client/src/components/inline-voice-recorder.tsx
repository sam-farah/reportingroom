import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mic, Square, RefreshCw } from 'lucide-react';
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [recordingTime, setRecordingTime] = useState(0);
  const [noMicFound, setNoMicFound] = useState(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const isRecordingRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const refreshDevices = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
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

  // Get available audio devices and auto-start recording
  useEffect(() => {
    (async () => {
      const audioInputs = await refreshDevices();
      if (audioInputs.length > 0) {
        const deviceId = audioInputs[0].deviceId;
        setSelectedDevice(deviceId);
        setTimeout(() => startRecordingWithDevice(deviceId), 100);
      } else {
        setNoMicFound(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRecordingWithDevice = async (deviceId?: string) => {
    const targetDevice = deviceId || selectedDevice;
    try {
      const constraints = {
        audio: {
          deviceId: targetDevice ? { exact: targetDevice } : undefined,
          sampleRate: 44100,
          channelCount: 1,
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const an = audioContextRef.current.createAnalyser();
      an.fftSize = 1024;
      an.smoothingTimeConstant = 0.6;
      source.connect(an);
      setAnalyser(an);

      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });

        stream.getTracks().forEach(track => track.stop());

        setAnalyser(null);
        if (audioContextRef.current?.state !== 'closed') {
          audioContextRef.current?.close();
        }
        audioContextRef.current = null;

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

      mediaRecorderRef.current.start();
      isRecordingRef.current = true;
      setIsRecording(true);
      setRecordingTime(0);

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
      setNoMicFound(true);
      toast({
        title: "Recording Error",
        description: "Failed to start recording. Please check microphone permissions.",
        variant: "destructive"
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      isRecordingRef.current = false;
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (timerRef.current) clearInterval(timerRef.current);

      toast({
        title: "🔄 Processing Recording",
        description: "Converting speech to text using Whisper AI…",
        duration: 2000,
      });
    }
  };

  const handleClose = () => {
    // Cancel any in-flight transcription request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    // Stop microphone if still recording
    if (mediaRecorderRef.current && isRecordingRef.current) {
      isRecordingRef.current = false;
      try { mediaRecorderRef.current.stop(); } catch (_) {}
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setAnalyser(null);
    if (audioContextRef.current?.state !== 'closed') {
      audioContextRef.current?.close();
    }
    audioContextRef.current = null;
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

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (audioContextRef.current?.state !== 'closed') audioContextRef.current?.close();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return (
    <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm flex items-center gap-1.5">
          <Mic className="w-3.5 h-3.5" />
          Voice Recording — {fieldName}
        </h4>
        {/* Close is always available — stops recording + cancels processing */}
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
              disabled={isRecording}
              onClick={refreshDevices}
            >
              <RefreshCw className="w-3 h-3 mr-1" /> Refresh
            </Button>
          </div>
          <Select value={selectedDevice} onValueChange={setSelectedDevice} disabled={isRecording}>
            <SelectTrigger className="h-8 text-sm">
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
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {isRecording && (
            <div className="flex items-center space-x-2 text-red-600">
              <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium">RECORDING</span>
            </div>
          )}
          {isProcessing && (
            <div className="flex items-center space-x-2 text-blue-600">
              <div className="animate-spin rounded-full h-3 w-3 border-2 border-blue-600 border-t-transparent"></div>
              <span className="text-sm font-medium">TRANSCRIBING…</span>
            </div>
          )}
          {(isRecording || recordingTime > 0) && !isProcessing && (
            <span className={`font-mono text-sm ${isRecording ? 'text-red-600' : 'text-gray-600'}`}>
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
            >
              <Mic className="w-4 h-4 mr-1" />
              Start
            </Button>
          )}
          {isRecording && (
            <Button
              onClick={stopRecording}
              size="sm"
              variant="outline"
              className="border-red-600 text-red-600 hover:bg-red-50"
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

      {isRecording && (
        <AudioMeter analyser={analyser} active={isRecording} height={56} bars={36} />
      )}

      <div className="text-xs text-gray-500">
        {!isRecording && !isProcessing && !noMicFound && (
          <p>Click "Start" to begin. Speak clearly then click "Stop &amp; Transcribe".</p>
        )}
        {isRecording && (
          <p>Speak now… click "Stop &amp; Transcribe" when finished.</p>
        )}
        {isProcessing && (
          <p>Processing with Whisper AI. You can cancel at any time.</p>
        )}
      </div>
    </div>
  );
}
