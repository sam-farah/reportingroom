import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mic, Square, Play, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useQuery } from '@tanstack/react-query';
import AudioMeter from '@/components/audio-meter';

interface VoiceDictationProps {
  onTranscription: (text: string, append: boolean) => void;
  isOpen: boolean;
  onClose: () => void;
  targetField: string;
}

interface AudioDevice {
  deviceId: string;
  label: string;
}

export default function VoiceDictation({ onTranscription, isOpen, onClose, targetField }: VoiceDictationProps) {
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);

  const { data: vocabData } = useQuery<{ words: string[] }>({
    queryKey: ["/api/clinic/dictation-vocabulary"],
    enabled: isOpen,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordedAudio, setRecordedAudio] = useState<string | null>(null);
  
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);

  const stopPreview = () => {
    if (previewStreamRef.current) {
      previewStreamRef.current.getTracks().forEach(t => t.stop());
      previewStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
    }
    audioContextRef.current = null;
    setAnalyser(null);
  };

  const refreshDevices = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices
        .filter(d => d.kind === 'audioinput' && d.deviceId !== 'default')
        .map(d => ({ deviceId: d.deviceId, label: d.label || `Microphone ${d.deviceId.slice(0, 5)}` }));
      setAudioDevices(audioInputs);
      if (audioInputs.length > 0 && !selectedDevice) {
        setSelectedDevice(audioInputs[0].deviceId);
      }
    } catch (error) {
      console.error('Error getting audio devices:', error);
      toast({
        title: 'Microphone Access',
        description: 'Unable to access microphones. Please check permissions.',
        variant: 'destructive',
      });
    }
  };

  // Get available audio devices when dialog opens
  useEffect(() => {
    if (isOpen) {
      refreshDevices();
    } else {
      stopPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Live preview meter (without recording) so the user can see their mic working
  // before they hit Start, and verify the picker actually changed input.
  useEffect(() => {
    if (!isOpen || !selectedDevice || isRecording) return;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: selectedDevice } },
          video: false,
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        previewStreamRef.current = stream;
        const ctx = new AudioContext();
        audioContextRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser();
        an.fftSize = 1024;
        an.smoothingTimeConstant = 0.6;
        src.connect(an);
        setAnalyser(an);
      } catch (err) {
        console.error('Preview error', err);
      }
    })();
    return () => {
      cancelled = true;
      stopPreview();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedDevice, isRecording]);

  const startRecording = async () => {
    try {
      audioChunksRef.current = [];
      setRecordingTime(0);
      setRecordedAudio(null);
      
      const constraints = {
        audio: selectedDevice ? { deviceId: { exact: selectedDevice } } : true,
        video: false
      };
      
      // Tear down any preview meter before opening the recording stream
      stopPreview();

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Set up audio analysis (shared with the live meter)
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
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setRecordedAudio(audioUrl);

        // Stop all tracks to free up microphone
        stream.getTracks().forEach(track => track.stop());

        // Stop audio analysis
        setAnalyser(null);
        if (audioContextRef.current?.state !== 'closed') {
          audioContextRef.current?.close();
        }
        audioContextRef.current = null;

        // Process transcription
        await processTranscription(audioBlob);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      
      toast({
        title: "🎤 Recording Started",
        description: `Recording to ${targetField} field - speak clearly into your microphone`,
        duration: 2000,
      });
      
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Recording Error",
        description: "Failed to start recording. Please check microphone permissions.",
        variant: "destructive"
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      setAudioLevel(0);
      
      toast({
        title: "🔄 Processing Recording",
        description: "Converting speech to text using Whisper AI...",
        duration: 2000,
      });
    }
  };
  
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const processTranscription = async (audioBlob: Blob) => {
    try {
      setIsProcessing(true);
      
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('model', 'whisper-1');

      // Send custom vocabulary as a Whisper prompt to bias recognition toward clinic terms
      const words = vocabData?.words ?? [];
      if (words.length > 0) {
        formData.append('vocabularyPrompt', words.join(', '));
      }
      
      const response = await apiRequest('/api/transcribe', 'POST', formData, {
        isFormData: true
      });
      
      const result = await response.json();
      
      if (result.text) {
        // Clean up the transcribed text
        const cleanText = result.text.trim();
        onTranscription(cleanText, true); // Append to existing text
        
        toast({
          title: "✅ Transcription Complete",
          description: `Successfully added text to ${targetField} field`,
          duration: 3000,
        });
      }
      
    } catch (error: any) {
      console.error('Transcription error:', error);
      toast({
        title: "Transcription Failed",
        description: error.message || "Failed to transcribe audio. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const playRecording = () => {
    if (recordedAudio) {
      const audio = new Audio(recordedAudio);
      audio.play().catch(console.error);
    }
  };



  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopPreview();
      if (recordedAudio) {
        URL.revokeObjectURL(recordedAudio);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordedAudio]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" data-testid="voice-dictation-overlay">
      <Card className="w-96 max-w-md mx-4">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center">
              <Mic className="w-5 h-5 mr-2" />
              Voice Dictation - {targetField}
            </span>
            <Button variant="ghost" size="sm" onClick={onClose} data-testid="button-close-dictation">
              ✕
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Microphone Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5" /> Microphone
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-gray-500"
                disabled={isRecording}
                onClick={refreshDevices}
                data-testid="button-refresh-mics"
              >
                <RefreshCw className="w-3 h-3 mr-1" /> Refresh
              </Button>
            </div>
            <Select value={selectedDevice} onValueChange={setSelectedDevice} disabled={isRecording}>
              <SelectTrigger data-testid="select-microphone">
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
            <p className="text-[11px] text-gray-500">
              Tap on the meter to confirm your mic is picking up sound before recording.
            </p>
          </div>

          {/* Live audio meter — works in preview AND recording */}
          <AudioMeter
            analyser={analyser}
            active={!!analyser}
            height={68}
            bars={42}
          />

          {/* Recording Controls */}
          <div className="flex flex-col items-center space-y-4">
            {/* Recording Time */}
            {(isRecording || recordingTime > 0) && (
              <div className="text-lg font-mono font-semibold">
                {formatTime(recordingTime)}
              </div>
            )}

            {/* Recording Button */}
            <div className="flex space-x-2">
              {!isRecording ? (
                <Button 
                  onClick={startRecording} 
                  disabled={!selectedDevice || isProcessing}
                  className="flex items-center space-x-2"
                  data-testid="button-start-recording"
                >
                  <Mic className="w-4 h-4" />
                  <span>Start Recording</span>
                </Button>
              ) : (
                <Button 
                  onClick={stopRecording} 
                  variant="destructive"
                  className="flex items-center space-x-2"
                  data-testid="button-stop-recording"
                >
                  <Square className="w-4 h-4" />
                  <span>Stop Recording</span>
                </Button>
              )}

              {recordedAudio && !isRecording && (
                <Button 
                  onClick={playRecording} 
                  variant="outline"
                  className="flex items-center space-x-2"
                  data-testid="button-play-recording"
                >
                  <Play className="w-4 h-4" />
                  <span>Play</span>
                </Button>
              )}
            </div>

            {/* Processing Status */}
            {isProcessing && (
              <div className="text-center">
                <div className="inline-flex items-center space-x-2 text-blue-600">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  <span>Processing with Whisper...</span>
                </div>
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="text-xs text-gray-500 text-center">
            <p>Click "Start Recording" to begin dictation.</p>
            <p>Transcribed text will be added to the {targetField} field.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}