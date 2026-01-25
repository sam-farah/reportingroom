import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mic, MicOff, Square, Volume2, Settings } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

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
  const [audioLevel, setAudioLevel] = useState(0);
  const [showDeviceSelection, setShowDeviceSelection] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isRecordingRef = useRef<boolean>(false);

  // Get available audio devices and auto-start recording
  useEffect(() => {
    const getDevicesAndStart = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices
          .filter(device => device.kind === 'audioinput' && device.deviceId !== 'default')
          .map(device => ({
            deviceId: device.deviceId,
            label: device.label || `Microphone ${device.deviceId.slice(0, 5)}`
          }));
        
        setAudioDevices(audioInputs);
        if (audioInputs.length > 0 && !selectedDevice) {
          const deviceId = audioInputs[0].deviceId;
          setSelectedDevice(deviceId);
          // Auto-start recording after a brief delay
          setTimeout(() => {
            startRecordingWithDevice(deviceId);
          }, 100);
        }
      } catch (error) {
        console.error('Error getting audio devices:', error);
      }
    };
    
    getDevicesAndStart();
  }, []);

  // Audio level monitoring - using peak detection for more responsive display
  const updateAudioLevel = () => {
    if (analyzerRef.current && isRecordingRef.current) {
      const dataArray = new Uint8Array(analyzerRef.current.frequencyBinCount);
      analyzerRef.current.getByteFrequencyData(dataArray);
      
      // Use peak value instead of average for more responsive display
      const peak = Math.max(...dataArray);
      // Also calculate RMS for speech-focused frequencies (300Hz-3400Hz range, roughly indices 5-50)
      const speechRange = dataArray.slice(5, 50);
      const rms = Math.sqrt(speechRange.reduce((sum, val) => sum + val * val, 0) / speechRange.length);
      
      // Combine peak and RMS for lively but accurate display
      const combinedLevel = (peak * 0.6 + rms * 0.4);
      const level = Math.min((combinedLevel / 200) * 100, 100);
      
      setAudioLevel(level);
      
      animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
    }
  };

  // Start recording with optional device override
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
      
      // Set up audio analysis
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyzerRef.current = audioContextRef.current.createAnalyser();
      analyzerRef.current.fftSize = 256;
      source.connect(analyzerRef.current);
      
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
        
        // Stop all tracks to free up microphone
        stream.getTracks().forEach(track => track.stop());
        
        // Stop audio analysis
        if (audioContextRef.current?.state !== 'closed') {
          audioContextRef.current?.close();
        }
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        
        // Process transcription
        await processTranscription(audioBlob);
      };
      
      mediaRecorderRef.current.start();
      isRecordingRef.current = true;
      setIsRecording(true);
      setRecordingTime(0);
      
      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      
      // Start audio level monitoring
      updateAudioLevel();
      
      toast({
        title: "🎤 Recording Started",
        description: `Recording to ${fieldName} field - speak clearly`,
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
      isRecordingRef.current = false;
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      
      setAudioLevel(0);
      
      toast({
        title: "🔄 Processing Recording",
        description: "Converting speech to text using Whisper AI...",
        duration: 2000,
      });
    }
  };

  const processTranscription = async (audioBlob: Blob) => {
    try {
      setIsProcessing(true);
      
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('model', 'whisper-1');
      
      const response = await apiRequest('/api/transcribe', 'POST', formData, {
        isFormData: true
      });
      
      const result = await response.json();
      
      if (result.text) {
        const cleanText = result.text.trim();
        onTranscription(cleanText, fieldName);
        
        toast({
          title: "✅ Transcription Complete",
          description: `Successfully added text to ${fieldName} field`,
          duration: 3000,
        });
        
        // Auto close after successful transcription
        setTimeout(() => {
          onClose();
        }, 1000);
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

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm">Voice Recording - {fieldName}</h4>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDeviceSelection(!showDeviceSelection)}
            disabled={isRecording}
          >
            <Settings className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isRecording || isProcessing}
          >
            ✕
          </Button>
        </div>
      </div>

      {/* Device Selection */}
      {showDeviceSelection && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Microphone</label>
          <Select value={selectedDevice} onValueChange={setSelectedDevice} disabled={isRecording}>
            <SelectTrigger>
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

      {/* Recording Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {/* Recording Status */}
          {isRecording && (
            <div className="flex items-center space-x-2 text-red-600">
              <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium">RECORDING</span>
            </div>
          )}
          
          {isProcessing && (
            <div className="flex items-center space-x-2 text-blue-600">
              <div className="animate-spin rounded-full h-3 w-3 border-2 border-blue-600 border-t-transparent"></div>
              <span className="text-sm font-medium">TRANSCRIBING...</span>
            </div>
          )}

          {/* Recording Time */}
          {(isRecording || recordingTime > 0) && !isProcessing && (
            <span className={`font-mono text-sm ${isRecording ? 'text-red-600' : 'text-gray-600'}`}>
              {formatTime(recordingTime)}
            </span>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-2">
          {!isRecording && !isProcessing && (
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
              Stop & Transcribe
            </Button>
          )}
        </div>
      </div>

      {/* Audio Level Visualization */}
      {isRecording && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Audio Level</span>
            <span>{Math.round(audioLevel)}%</span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-red-500 transition-all duration-100"
              style={{ width: `${audioLevel}%` }}
            />
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="text-xs text-gray-500">
        {!isRecording && !isProcessing && (
          <p>Click "Start" to begin recording. Speak clearly and click "Stop & Transcribe" when finished.</p>
        )}
        {isRecording && (
          <p>Speak now... Your voice will be converted to text and added to the {fieldName} field.</p>
        )}
        {isProcessing && (
          <p>Processing your speech with Whisper AI. Please wait...</p>
        )}
      </div>
    </div>
  );
}