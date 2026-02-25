import React, { useState, useRef, useEffect, useCallback } from "react";
import { generateWhisperImage } from './services/geminiService';
import { generateInworldTTSAudio } from './services/inworldService';

import { generateGroundedWhisper, getArchetypeMetadata } from './services/librarianService';
import { analyzeDeepSoul, analyzeTextDeepSoul } from './services/leonardoService';
import { getCloudVisionEmotions } from './services/visionService';
import { DevotionalGift, DeepSoulAnalysis, GroundedWhisper } from './types';
import {
  LOADING_MESSAGES,
  SUGGESTIONS,
  ARCHETYPE_ICONS,
  CAMERA_CONFIG,
  ViewState,
  FEELING_CHIPS,
  FeelingId
} from './constants';
import {
  Sparkles, Play, Pause, Volume2, Download, Heart,
  Camera, RefreshCw, Type, Eye, Shield, AlertTriangle, Activity,
  Mic, Square
} from 'lucide-react';
import { processAudioWithGemini, createAudioRecorder } from './services/audioService';
import novenaData from './data/novenas.json';

// Crisis detection — pre-flight check before Gemini runs
const CRISIS_REGEX = /\b(end my life|kill myself|want to die|suicid|don't want to be here|can't go on|no reason to live|better off dead|hurt myself|self.harm|take my life)\b/i;

// Temperament icons mapping
const TEMPERAMENT_ICONS: Record<string, string> = {
  'Sage': '📚',
  'Lover': '💝',
  'Warrior': '⚔️',
  'Child': '🌙'
};

// Audio utilities for MP3 format
const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

const createMp3Url = (base64: string): string => {
  const binaryString = atob(base64);
  const buffer = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    buffer[i] = binaryString.charCodeAt(i);
  }
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/mpeg' }));
};

// Audio Visualizer Component
const AudioVisualizer: React.FC<{ isPlaying: boolean, analyzer: AnalyserNode | null }> = ({ isPlaying, analyzer }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    if (!canvasRef.current || !analyzer) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyzer.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyzer.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const width = canvas.width;
      const height = canvas.height;
      const barWidth = (width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * height * 0.8;
        const opacity = (dataArray[i] / 255) * 0.6 + 0.1;
        ctx.fillStyle = `rgba(255, 223, 150, ${opacity})`;
        ctx.fillRect(x, (height - barHeight) / 2, barWidth, barHeight);
        x += barWidth + 1;
      }
    };

    if (isPlaying) {
      draw();
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      cancelAnimationFrame(animationRef.current);
    }

    return () => cancelAnimationFrame(animationRef.current);
  }, [isPlaying, analyzer]);

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={40}
      className="w-full h-10 opacity-60 mix-blend-screen pointer-events-none"
    />
  );
};

// Crisis Intervention Banner — shown when ministryDepth === 'crisis' or pre-flight regex fires
const CrisisBanner: React.FC = () => (
  <div className="w-full rounded-2xl bg-rose-950/40 border border-rose-500/30 p-5 space-y-3">
    <div className="flex items-center gap-2">
      <AlertTriangle size={13} className="text-rose-400 shrink-0" />
      <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-rose-200/80">
        You don't have to face this alone
      </span>
    </div>
    <p className="text-[11px] text-rose-100/70 leading-relaxed">
      A real person is ready to talk right now — free, confidential, no judgment.
    </p>
    <div className="space-y-2">
      <a
        href="tel:988"
        className="flex items-center justify-between w-full bg-rose-900/30 border border-rose-500/20 px-4 py-3 rounded-xl active:opacity-70"
      >
        <span className="text-[10px] text-rose-100/90 font-bold uppercase tracking-widest">988 Suicide &amp; Crisis Lifeline</span>
        <span className="text-[11px] text-rose-300 font-bold">Call or Text 988</span>
      </a>
      <a
        href="sms:741741?body=HOME"
        className="flex items-center justify-between w-full bg-rose-900/20 border border-rose-500/10 px-4 py-3 rounded-xl active:opacity-70"
      >
        <span className="text-[10px] text-rose-100/70 uppercase tracking-widest">Crisis Text Line</span>
        <span className="text-[11px] text-rose-300/80">Text HOME to 741741</span>
      </a>
    </div>
    <p className="text-[9px] text-rose-100/30 text-center pt-1">
      Your prayer is waiting below ↓
    </p>
  </div>
);

// Camera Countdown Component
const CameraCountdown: React.FC<{ seconds: number }> = ({ seconds }) => (
  <div className="absolute inset-0 flex items-center justify-center">
    <div className="text-6xl font-['Cinzel'] text-amber-100/80 animate-pulse">
      {seconds > 0 ? seconds : ''}
    </div>
  </div>
);

const App: React.FC = () => {
  // View state - START with welcome screen for feeling selection
  const [view, setView] = useState<ViewState>('welcome');
  const [loadingStage, setLoadingStage] = useState<keyof typeof LOADING_MESSAGES>('mirror');
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);

  // Camera state
  const [cameraActive, setCameraActive] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Feeling state (multi-sensory input)
  const [selectedFeeling, setSelectedFeeling] = useState<FeelingId | null>(null);

  // Text fallback state
  const [textInput, setTextInput] = useState('');

  // Crisis intervention
  const [showCrisisBanner, setShowCrisisBanner] = useState(false);

  // Novena state — persisted in localStorage
  const [novenaProgress, setNovenaProgress] = useState<Record<string, { day: number; startDate: string }>>({});
  const [activeNovenaId, setActiveNovenaId] = useState<string | null>(null);

  // Analysis state
  const [deepAnalysis, setDeepAnalysis] = useState<DeepSoulAnalysis | null>(null);
  const [groundedWhisper, setGroundedWhisper] = useState<GroundedWhisper | null>(null);

  // Final gift state
  const [gift, setGift] = useState<DevotionalGift | null>(null);

  // Audio state
  const [isPlaying, setIsPlaying] = useState(false);
  const [analyzer, setAnalyzer] = useState<AnalyserNode | null>(null);
  const [audioReady, setAudioReady] = useState(false);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  
  const recorderRef = useRef<ReturnType<typeof createAudioRecorder> | null>(null);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null); // Keep ref for immediate access
  const startTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);

  // Audio context is now initialized via initAudioContext() on user interactions

  // Load audio buffer when gift is ready (MP3 format)
  useEffect(() => {
    if (gift?.audioBase64) {
      setAudioReady(false);
      const audioBase64 = gift.audioBase64; // Capture for closure
      const loadAudio = async () => {
        console.log('Starting audio load, base64 length:', audioBase64.length);

        // Ensure audio context exists
        if (!audioCtxRef.current) {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          audioCtxRef.current = ctx;
          const newAnalyzer = ctx.createAnalyser();
          newAnalyzer.fftSize = 64;
          analyzerRef.current = newAnalyzer; // Store in ref for immediate access
          setAnalyzer(newAnalyzer);
          console.log('Audio context created');
        }

        try {
          // Decode MP3 using Web Audio API
          const arrayBuffer = base64ToArrayBuffer(audioBase64);
          console.log('ArrayBuffer created, byteLength:', arrayBuffer.byteLength);

          // Clone the buffer because decodeAudioData detaches the original
          const bufferCopy = arrayBuffer.slice(0);

          const decodedBuffer = await audioCtxRef.current.decodeAudioData(bufferCopy);

          // Trim the last 0.2 seconds to remove trailing breath/shh sounds (reduced from 0.5 to preserve content)
          const trimSeconds = 0.2;
          const trimSamples = Math.floor(trimSeconds * decodedBuffer.sampleRate);
          const newLength = Math.max(decodedBuffer.length - trimSamples, decodedBuffer.sampleRate); // Keep at least 1 second

          // Create a new trimmed buffer
          const trimmedBuffer = audioCtxRef.current.createBuffer(
            decodedBuffer.numberOfChannels,
            newLength,
            decodedBuffer.sampleRate
          );

          // Copy the audio data without the trailing portion
          for (let channel = 0; channel < decodedBuffer.numberOfChannels; channel++) {
            const sourceData = decodedBuffer.getChannelData(channel);
            const destData = trimmedBuffer.getChannelData(channel);
            for (let i = 0; i < newLength; i++) {
              destData[i] = sourceData[i];
            }
          }

          audioBufferRef.current = trimmedBuffer;
          pausedAtRef.current = 0;
          setAudioReady(true);
          console.log('Audio buffer loaded (MP3), original duration:', decodedBuffer.duration, 'trimmed to:', trimmedBuffer.duration, 'seconds');
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          console.error('Error loading audio buffer:', error);
          console.error('Error details:', {
            name: error.name,
            message: error.message,
            base64Length: audioBase64.length
          });

          // Try to provide more info about the audio data
          try {
            const firstBytes = atob(audioBase64.substring(0, 20));
            console.log('First bytes of audio (hex):', Array.from(firstBytes).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' '));
          } catch (e) {
            console.error('Could not decode base64 for inspection:', e);
          }
        }
      };
      loadAudio();
    }
  }, [gift?.audioBase64]);

  // Rotate loading messages
  useEffect(() => {
    if (view === 'diagnosis') {
      const messages = LOADING_MESSAGES[loadingStage];
      const interval = setInterval(() => {
        setLoadingMsgIndex((prev: number) => (prev + 1) % messages.length);
      }, 2000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [view, loadingStage]);

  // Initialize audio context on first interaction
  const initAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;
      const newAnalyzer = ctx.createAnalyser();
      newAnalyzer.fftSize = 64;
      analyzerRef.current = newAnalyzer; // Store in ref for immediate access
      setAnalyzer(newAnalyzer);
      console.log('Audio context initialized');
    }
  }, []);

  // Load novena progress from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('pp_novena_progress');
      if (saved) setNovenaProgress(JSON.parse(saved));
    } catch { /* ignore parse errors */ }
  }, []);

  // Camera functions
  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      // Also init audio on this user interaction
      initAudioContext();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: CAMERA_CONFIG.facingMode,
          width: { ideal: CAMERA_CONFIG.idealWidth },
          height: { ideal: CAMERA_CONFIG.idealHeight }
        }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Set camera active immediately so video element renders
        setCameraActive(true);
        // Wait for video to be ready before playing
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().then(() => {
            console.log('Camera active, video playing');
          }).catch(err => {
            console.error('Video play error:', err);
          });
        };
      }
    } catch (err) {
      console.error('Camera error:', err);
      setCameraError('Camera access denied. You can use text input instead.');
    }
  }, [initAudioContext]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const captureImage = useCallback((): string | null => {
    if (!videoRef.current || !canvasRef.current) return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.8);
  }, []);

  const startCapture = useCallback(async () => {
    setCountdown(CAMERA_CONFIG.countdownStart);

    // Countdown
    for (let i = CAMERA_CONFIG.countdownStart; i > 0; i--) {
      setCountdown(i);
      await new Promise(r => setTimeout(r, 1000));
    }
    setCountdown(0);

    // Capture
    const imageData = captureImage();
    if (imageData) {
      setCapturedImage(imageData);
      stopCamera();
      processCapture(imageData);
    }
  }, [captureImage, stopCamera]);

  // Process captured image through the Sacred Loop with DEEP ANALYSIS
  const processCapture = async (imageData: string) => {
    setView('diagnosis');
    setLoadingStage('diagnosis');
    setLoadingMsgIndex(0);

    // Build user context from selected feeling for Authenticity Bridge comparison
    const feelingContext = selectedFeeling
      ? `User stated they are feeling: ${FEELING_CHIPS.find(f => f.id === selectedFeeling)?.label}`
      : undefined;

    try {
      // Step 0: Cloud Vision — objective emotion baseline (non-blocking, graceful fallback)
      const cloudVision = await getCloudVisionEmotions(imageData);

      // Step 1: Deep Soul Analysis (Leonardo Engine v2.0 - All 4 agents)
      // Pass feeling context to enable Authenticity Bridge (Agent 10) - compares stated vs facial emotion
      const analysis = await analyzeDeepSoul(imageData, feelingContext, cloudVision);
      setDeepAnalysis(analysis);
      // Camera path does NOT trigger crisis banner — facial analysis can't reliably detect
      // suicidal ideation. Crisis banner only fires from text/voice pre-flight regex.

      console.log('Deep Analysis:', {
        archetype: analysis.archetype,
        temperament: analysis.temperament.temperament,
        emotionalWeather: analysis.emotionalWeather,
        burdenDetection: analysis.burdenDetection,
        trueNeed: analysis.trueNeed,
        ministryDepth: analysis.ministryDepth
      });

      // Brief pause to show archetype reveal
      await new Promise(r => setTimeout(r, 2000));

      // Step 2: Get grounded whisper (Librarian Logic)
      // Use intensity score adjusted by emotional weather
      setLoadingStage('anchor');
      const adjustedIntensity = Math.round(
        (analysis.intensityScore + (100 - analysis.emotionalWeather.powerLevel)) / 2
      );

      // Pass emotional context for more personalized prayers
      const emotionalContext = {
        statedFeeling: selectedFeeling ? FEELING_CHIPS.find(f => f.id === selectedFeeling)?.label : undefined,
        trueNeed: analysis.trueNeed,
        warmthNeed: analysis.emotionalWeather.warmthNeed,
        ministryDepth: analysis.ministryDepth
      };

      const whisper = await generateGroundedWhisper(analysis.archetype, adjustedIntensity, emotionalContext);
      setGroundedWhisper(whisper);

      // Step 3: Generate image (uses archetype-specific fallback for speed, no API call)
      const imageUrl = await generateWhisperImage(whisper.imagePrompt, analysis.archetype, false);

      // Create the gift object with deep analysis data
      setGift({
        id: Date.now().toString(),
        occasion: analysis.trueNeed, // Use the synthesized true need
        devotionalText: whisper.devotionalText,
        scriptureReference: whisper.anchorVerse.reference,
        scriptureText: whisper.anchorVerse.text,
        imagePrompt: whisper.imagePrompt,
        imageUrl,
        archetype: analysis.archetype,
        intensityScore: analysis.intensityScore
      });

      setView('anchor');
    } catch (error: any) {
      console.error('Processing error:', error);
      let errorMessage = 'Something went wrong. Please try again.';
      if (error && error.message) {
        try {
          const errorObj = JSON.parse(error.message);
          if (errorObj.error && errorObj.error.message) {
            errorMessage = `API Error: ${errorObj.error.message}`;
          } else {
            errorMessage = `Processing error: ${error.message}`;
          }
        } catch {
          // Not a JSON error message
          errorMessage = `Processing error: ${error.message}`;
        }
      }
      setCameraError(errorMessage);
      setView('mirror');
    }
  };

  // Process text input (fallback mode - uses basic analysis)
  const processTextInput = async () => {
    if (!textInput.trim()) return;

    // Init audio context on this user interaction
    initAudioContext();

    // Pre-flight crisis check — fires before Gemini runs so user sees help immediately
    if (CRISIS_REGEX.test(textInput)) setShowCrisisBanner(true);

    setView('diagnosis');
    setLoadingStage('diagnosis');
    setLoadingMsgIndex(0);

    try {
      // Full deep analysis on text — same 4-agent schema as camera path
      const feelingLabel = selectedFeeling
        ? FEELING_CHIPS.find(f => f.id === selectedFeeling)?.label
        : undefined;

      const analysis = await analyzeTextDeepSoul(textInput, feelingLabel);
      setDeepAnalysis(analysis);
      if (analysis.ministryDepth === 'crisis') setShowCrisisBanner(true);

      await new Promise(r => setTimeout(r, 1500));

      // Get grounded whisper with real emotional context (not hardcoded)
      setLoadingStage('anchor');
      const emotionalContext = {
        statedFeeling: textInput,
        trueNeed: analysis.trueNeed,
        warmthNeed: analysis.emotionalWeather.warmthNeed,
        ministryDepth: analysis.ministryDepth
      };
      const whisper = await generateGroundedWhisper(analysis.archetype, analysis.intensityScore, emotionalContext);
      setGroundedWhisper(whisper);

      // Generate image (uses archetype-specific fallback for speed, no API call)
      const imageUrl = await generateWhisperImage(whisper.imagePrompt, analysis.archetype, false);

      setGift({
        id: Date.now().toString(),
        occasion: textInput,
        devotionalText: whisper.devotionalText,
        scriptureReference: whisper.anchorVerse.reference,
        scriptureText: whisper.anchorVerse.text,
        imagePrompt: whisper.imagePrompt,
        imageUrl,
        archetype: analysis.archetype,
        intensityScore: analysis.intensityScore
      });

      setView('anchor');
    } catch (error: any) {
      console.error('Processing error:', error);
      let errorMessage = 'Something went wrong with text analysis. Please try again.';
      if (error && error.message) {
        try {
          const errorObj = JSON.parse(error.message);
          if (errorObj.error && errorObj.error.message) {
            errorMessage = `API Error: ${errorObj.error.message}`;
          } else {
            errorMessage = `Text processing error: ${error.message}`;
          }
        } catch {
          errorMessage = `Text processing error: ${error.message}`;
        }
      }
      setCameraError(errorMessage); // Using cameraError state to display general errors
      setView('input');
    }
  };


  // Generate audio and move to final reveal
  const handleFinalize = async () => {
    if (!gift || !groundedWhisper || !deepAnalysis) return;

    setView('diagnosis');
    setLoadingStage('whisper');
    setLoadingMsgIndex(0);

    try {
      // Format audio text with natural pause (using ellipsis/period) between prayer and scripture
      // No emotion tags - just clean, natural speech
      const audioText = `${gift.devotionalText} ... From ${gift.scriptureReference}. "${gift.scriptureText}"`;
      const emotionTags = ''; // Clean speech, no sound effects

      console.log('Audio text for TTS:', audioText);

      const audioBase64 = await generateInworldTTSAudio(
        audioText,
        emotionTags,
        {
          apiKeyBase64: import.meta.env.VITE_INWORLD_API_KEY,
          voice: import.meta.env.VITE_INWORLD_VOICE_ID,
        }
      );

      setGift(prev => prev ? ({ ...prev, audioBase64 }) : null);
      setView('whisper');
    } catch (error: any) {
      // TTS failure is non-fatal — log silently and show prayer text without audio
      console.warn('[TTS] Audio unavailable, showing text-only prayer:', error?.message || error);
      setView('whisper');
    }
  };

  // Audio recording functions
  const [recordingAnalyzer, setRecordingAnalyzer] = useState<AnalyserNode | null>(null);

  const handleStartRecording = async () => {
    if (isRecording || isProcessingAudio) return;

    try {
      console.log('[Audio] Starting handleStartRecording (Local Gemini)');
      setIsRecording(true);
      setCameraError(null);
      setLiveTranscript('');
      initAudioContext();

      recorderRef.current = createAudioRecorder();
      await recorderRef.current.start(handleStopRecording); // Auto-stop on silence

      // For visualizer
      const stream = recorderRef.current.getStream();
      if (stream && audioCtxRef.current) {
          const source = audioCtxRef.current.createMediaStreamSource(stream);
          const newAnalyzer = audioCtxRef.current.createAnalyser();
          newAnalyzer.fftSize = 64;
          source.connect(newAnalyzer);
          setRecordingAnalyzer(newAnalyzer);
      }

    } catch (err: any) {
      console.error('[Audio] Failed to start:', err);
      setIsRecording(false);
      setCameraError(`Mic error: ${err.message}`);
    }
  };

  const handleStopRecording = async () => {
    if (!isRecording) return;
    
    console.log('[Audio] handleStopRecording called');
    setIsRecording(false);
    setIsProcessingAudio(true);
    setRecordingAnalyzer(null);

    try {
        const audioBlob = await recorderRef.current.stop();

        if (audioBlob.size < 1000) {
            console.log('[Audio] Recording too short, ignoring.');
            setIsProcessingAudio(false);
            return;
        }

        const { transcription, analysis } = await processAudioWithGemini(audioBlob);

        setLiveTranscript(transcription);
        setTextInput(transcription);

        // Proceed through the Sacred Loop with the result
        await continueSacredLoop(transcription, analysis);

    } catch (error: any) {
        console.error('[Audio] Processing failed:', error);
        setCameraError(`Audio processing failed: ${error.message}`);
        setIsProcessingAudio(false);
    }
  };

  const continueSacredLoop = async (transcription: string, _basicAnalysis: any) => {
    // Pre-flight crisis check on transcribed voice text
    if (CRISIS_REGEX.test(transcription)) setShowCrisisBanner(true);

    try {
        setView('diagnosis');
        setLoadingStage('diagnosis');

        // Full deep analysis on transcribed text (replaces hardcoded Lover/surface defaults)
        const fullAnalysis = await analyzeTextDeepSoul(transcription);
        setDeepAnalysis(fullAnalysis);
        if (fullAnalysis.ministryDepth === 'crisis') setShowCrisisBanner(true);

      // After analysis reveal, proceed to grounded whisper
      await new Promise(r => setTimeout(r, 2000));
      setLoadingStage('anchor');

      const emotionalContext = {
        statedFeeling: transcription,
        trueNeed: fullAnalysis.trueNeed,
        warmthNeed: fullAnalysis.emotionalWeather.warmthNeed,
        ministryDepth: fullAnalysis.ministryDepth
      };

      const whisper = await generateGroundedWhisper(fullAnalysis.archetype, fullAnalysis.intensityScore, emotionalContext);
      setGroundedWhisper(whisper);

      const imageUrl = await generateWhisperImage(whisper.imagePrompt, fullAnalysis.archetype, false);

      setGift({
        id: Date.now().toString(),
        occasion: transcription,
        devotionalText: whisper.devotionalText,
        scriptureReference: whisper.anchorVerse.reference,
        scriptureText: whisper.anchorVerse.text,
        imagePrompt: whisper.imagePrompt,
        imageUrl,
        archetype: fullAnalysis.archetype,
        intensityScore: fullAnalysis.intensityScore
      });

      setView('anchor');
    } catch (err: any) {
      console.error('[Audio] Sacred Loop failed:', err);
      setCameraError(`Soul context failed: ${err.message}`);
      if (view !== 'welcome') {
        setView('input');
      }
    } finally {
      setIsProcessingAudio(false);
    }
  };


  // Audio playback
  const togglePlay = async () => {
    // Ensure audio context exists
    if (!audioCtxRef.current) {
      initAudioContext();
      // Wait a tick for refs to be set
      await new Promise(r => setTimeout(r, 50));
    }

    // Resume audio context if suspended (browser autoplay policy)
    if (audioCtxRef.current?.state === 'suspended') {
      await audioCtxRef.current.resume();
      console.log('Audio context resumed');
    }

    if (isPlaying) {
      sourceRef.current?.stop();
      pausedAtRef.current = audioCtxRef.current!.currentTime - startTimeRef.current;
      setIsPlaying(false);
    } else {
      // Use ref for immediate access (state might not be updated yet)
      const currentAnalyzer = analyzerRef.current;

      if (!audioBufferRef.current || !audioCtxRef.current || !currentAnalyzer) {
        console.error('Audio not ready:', {
          buffer: !!audioBufferRef.current,
          ctx: !!audioCtxRef.current,
          analyzer: !!currentAnalyzer
        });
        return;
      }

      const source = audioCtxRef.current.createBufferSource();
      source.buffer = audioBufferRef.current;
      source.connect(currentAnalyzer);
      currentAnalyzer.connect(audioCtxRef.current.destination);
      const offset = pausedAtRef.current % audioBufferRef.current.duration;
      source.start(0, offset);
      startTimeRef.current = audioCtxRef.current.currentTime - offset;
      sourceRef.current = source;
      setIsPlaying(true);
      console.log('Audio playing from offset:', offset);

      source.onended = () => {
        if (Math.abs(audioCtxRef.current!.currentTime - startTimeRef.current - audioBufferRef.current!.duration) < 0.2) {
          setIsPlaying(false);
          pausedAtRef.current = 0;
        }
      };
    }
  };

  // Reset to start
  const handleReset = () => {
    stopCamera();
    setCapturedImage(null);
    setShowCrisisBanner(false);
    setDeepAnalysis(null);
    setGroundedWhisper(null);
    setGift(null);
    setTextInput('');
    setSelectedFeeling(null);
    setIsPlaying(false);
    setAudioReady(false);
    audioBufferRef.current = null;
    pausedAtRef.current = 0;
    setView('welcome');
    setIsRecording(false);
    setIsProcessingAudio(false);
    recorderRef.current = null;
  };

  // Novena helpers
  const startNovena = (novenaId: string) => {
    const updated = { ...novenaProgress, [novenaId]: { day: 1, startDate: new Date().toISOString() } };
    setNovenaProgress(updated);
    localStorage.setItem('pp_novena_progress', JSON.stringify(updated));
    setActiveNovenaId(novenaId);
  };

  const advanceNovenaDay = (novenaId: string) => {
    const current = novenaProgress[novenaId];
    if (!current) return;
    const nextDay = Math.min(current.day + 1, 9);
    const updated = { ...novenaProgress, [novenaId]: { ...current, day: nextDay } };
    setNovenaProgress(updated);
    localStorage.setItem('pp_novena_progress', JSON.stringify(updated));
  };

  const resetNovena = (novenaId: string) => {
    const updated = { ...novenaProgress };
    delete updated[novenaId];
    setNovenaProgress(updated);
    localStorage.setItem('pp_novena_progress', JSON.stringify(updated));
  };

  // Switch to text input mode
  const switchToTextInput = () => {
    stopCamera();
    setView('input');
  };

  // Get archetype color class
  const getArchetypeColorClass = (archetype: string): string => {
    const meta = getArchetypeMetadata(archetype as any);
    return meta?.color || 'amber';
  };

  return (
    <div className="min-h-screen bg-[#02040a] text-amber-50 font-['Lato'] flex flex-col items-center justify-center overflow-hidden relative selection:bg-amber-500/30">
      {/* Hidden canvas for camera capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Dynamic Aura Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute -top-1/4 -left-1/4 w-[70%] h-[70%] rounded-full blur-[160px] transition-all duration-[2000ms] opacity-20 ${deepAnalysis ? `bg-${getArchetypeColorClass(deepAnalysis.archetype)}-900` : 'bg-amber-900'
          }`}></div>
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.04] mix-blend-overlay"></div>
      </div>

      <div className="relative z-10 w-full max-w-md px-6 flex flex-col h-[92vh] justify-between py-10">

        {/* Header */}
        <div className="flex flex-col items-center justify-center gap-2 opacity-50">
          <div className="flex items-center gap-2">
            <Shield size={14} className="text-amber-200/50" />
            <h1 className="font-['Cinzel'] text-[10px] tracking-[0.4em] font-bold uppercase text-amber-100">Padre Pio</h1>
          </div>
          <p className="text-[8px] uppercase tracking-[0.2em] text-amber-100/30">Capuchin · San Giovanni Rotondo</p>
        </div>

        {/* Global Error Message */}
        {cameraError && (
          <div className="absolute top-20 left-0 right-0 px-6 z-50 animate-in fade-in slide-in-from-top-4">
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 text-center">
              <p className="text-[10px] text-rose-400 font-medium">{cameraError}</p>
              <button
                onClick={() => setCameraError(null)}
                className="mt-1 text-[8px] uppercase tracking-widest text-rose-300/40 hover:text-rose-300"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* SCREEN 0: WELCOME - "How are you feeling today?" */}
        {view === 'welcome' && (
          <div className="flex-1 flex flex-col justify-center space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            <div className="text-center space-y-4">
              <h2 className="text-2xl md:text-3xl font-light tracking-tight leading-[1.3] text-amber-50/90">
                How are you <span className="romance-font italic text-amber-200/80">feeling</span> today?
              </h2>
              <p className="text-xs text-amber-100/40">Tap what resonates with you</p>
            </div>

            {/* Feeling Chips Grid */}
            <div className="flex flex-wrap justify-center gap-2 px-4">
              {FEELING_CHIPS.map((feeling) => (
                <button
                  key={feeling.id}
                  onClick={() => setSelectedFeeling(feeling.id as FeelingId)}
                  className={`px-4 py-2.5 rounded-full text-sm transition-all duration-300 flex items-center gap-2 ${selectedFeeling === feeling.id
                    ? 'bg-amber-100 text-[#0a0a0a] scale-105 shadow-[0_0_20px_rgba(251,191,36,0.3)]'
                    : 'bg-white/5 text-amber-100/60 hover:bg-white/10 border border-white/5'
                    }`}
                >
                  <span>{feeling.emoji}</span>
                  <span className="text-[11px] font-medium">{feeling.label}</span>
                </button>
              ))}
            </div>

            {/* Continue Button */}
            <div className="flex flex-col gap-4 pt-4">
              <button
                onClick={() => setView('mirror')}
                disabled={!selectedFeeling}
                className="w-full group bg-amber-100 text-[#0a0a0a] font-bold py-5 rounded-full transition-all hover:bg-white active:scale-95 disabled:opacity-20 flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(251,191,36,0.1)]"
              >
                <Camera size={16} />
                <span className="uppercase tracking-[0.3em] text-[10px]">Continue with Camera</span>
              </button>

              <button
                onClick={() => {
                  if (selectedFeeling) {
                    const feelingLabel = FEELING_CHIPS.find(f => f.id === selectedFeeling)?.label || '';
                    setTextInput(`I'm feeling ${feelingLabel.toLowerCase()}`);
                  }
                  setView('input');
                }}
                className="w-full group bg-white/5 text-amber-100/60 font-medium py-4 rounded-full transition-all hover:bg-white/10 active:scale-95 border border-white/10 flex items-center justify-center gap-3"
              >
                <Type size={14} />
                <span className="uppercase tracking-[0.2em] text-[9px]">Tell me more in words</span>
              </button>



              {/* Gemini 3 Audio Input - Primary Action */}
              <div className="flex flex-col items-center gap-4 pt-6">
                {/* Processing State - Full Card */}
                {isProcessingAudio ? (
                  <div className="w-full max-w-xs bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-amber-100/10 animate-in fade-in duration-500">
                    {/* Processing Icon */}
                    <div className="flex justify-center mb-4">
                      <div className="w-16 h-16 rounded-full bg-amber-100/10 flex items-center justify-center relative">
                        <div className="absolute inset-0 border-2 border-amber-200/30 border-t-amber-400 rounded-full animate-spin" />
                        <Mic size={24} className="text-amber-200" />
                      </div>
                    </div>

                    {/* Status Text */}
                    <p className="text-center text-sm text-amber-100/80 mb-3">
                      {liveTranscript ? 'Analyzing your heart...' : 'Transcribing...'}
                    </p>

                    {/* Live Transcription Display */}
                    {liveTranscript && (
                      <div className="bg-black/20 rounded-xl p-3 mb-3">
                        <p className="text-xs text-amber-100/60 italic text-center">
                          "{liveTranscript}"
                        </p>
                      </div>
                    )}

                    {/* Processing Steps */}
                    <div className="flex justify-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                      <div className="w-2 h-2 rounded-full bg-amber-400/50 animate-pulse delay-100" />
                      <div className="w-2 h-2 rounded-full bg-amber-400/30 animate-pulse delay-200" />
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Normal/Recording State */}
                    <p className={`text-[10px] uppercase tracking-[0.2em] transition-colors duration-500 ${isRecording ? 'text-rose-400' : 'text-amber-100/20'}`}>
                      {(isRecording && !recordingAnalyzer) ? 'Initializing...' :
                        (isRecording && recordingAnalyzer) ? 'Listening... Tap to stop' :
                          'Or speak your prayer'}
                    </p>
                    <button
                      onClick={isRecording ? handleStopRecording : handleStartRecording}
                      className={`w-24 h-24 rounded-full flex flex-col items-center justify-center gap-2 transition-all duration-500 scale-110 relative overflow-hidden ${isRecording
                        ? 'bg-rose-500/20 border-2 border-rose-500 shadow-[0_0_40px_rgba(244,63,94,0.5)] animate-pulse'
                        : 'bg-amber-100/10 border border-amber-100/20 hover:bg-amber-100/20 hover:border-amber-100/40 shadow-[0_0_20px_rgba(251,191,36,0.1)]'
                        }`}
                    >
                      {isRecording ? (
                        <>
                          <Square size={28} className="text-rose-500 fill-rose-500 z-10" />
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
                            <AudioVisualizer isPlaying={true} analyzer={recordingAnalyzer} />
                          </div>
                        </>
                      ) : (
                        <Mic size={28} className="text-amber-200" />
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Novena link — subtle, below audio */}
            <div className="flex justify-center pt-2">
              <button
                onClick={() => setView('novena')}
                className="text-[9px] uppercase tracking-[0.15em] text-amber-100/20 hover:text-amber-100/45 transition-colors"
              >
                🕯️ Begin a Novena with Padre Pio
              </button>
            </div>

          </div>
        )}

        {/* SCREEN 1: THE MIRROR */}
        {view === 'mirror' && (
          <div className="flex-1 flex flex-col justify-center space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            <div className="text-center space-y-4">
              <h2 className="text-2xl md:text-3xl font-light tracking-tight leading-[1.3] text-amber-50/90">
                Be <span className="romance-font italic text-amber-200/80">still</span>. We're listening.
              </h2>
              <p className="text-xs text-amber-100/40">Your expression tells us what words cannot.</p>
            </div>

            {/* Camera View */}
            <div className="relative w-full aspect-square max-w-[300px] mx-auto">
              <div className="absolute inset-0 rounded-full border-2 border-amber-200/20 overflow-hidden bg-[#0a0a0a]">
                {/* Always render video element so ref is available */}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover scale-x-[-1] ${cameraActive ? 'block' : 'hidden'}`}
                />
                {cameraActive && countdown > 0 && <CameraCountdown seconds={countdown} />}
                {cameraActive && countdown > 0 && (
                  <div className="absolute inset-0 rounded-full border-4 border-amber-400/60 animate-pulse"></div>
                )}
                {!cameraActive && (
                  <div className="w-full h-full flex flex-col items-center justify-center text-amber-100/30">
                    <Camera size={48} className="mb-4" />
                    <p className="text-xs">Camera ready</p>
                  </div>
                )}
              </div>
              {/* Glowing ring effect */}
              <div className="absolute inset-[-8px] rounded-full border border-amber-200/10 animate-pulse"></div>
            </div>

            {cameraError && (
              <p className="text-center text-xs text-rose-400/80">{cameraError}</p>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-4">
              {!cameraActive ? (
                <button
                  onClick={startCamera}
                  className="w-full group bg-amber-100 text-[#0a0a0a] font-bold py-5 rounded-full transition-all hover:bg-white active:scale-95 flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(251,191,36,0.1)]"
                >
                  <Camera size={16} />
                  <span className="uppercase tracking-[0.3em] text-[10px]">Begin</span>
                </button>
              ) : (
                <button
                  onClick={startCapture}
                  disabled={countdown > 0}
                  className="w-full group bg-amber-100 text-[#0a0a0a] font-bold py-5 rounded-full transition-all hover:bg-white active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(251,191,36,0.1)]"
                >
                  <Eye size={16} />
                  <span className="uppercase tracking-[0.3em] text-[10px]">
                    {countdown > 0 ? 'Hold still...' : 'Capture'}
                  </span>
                </button>
              )}

              <button
                onClick={switchToTextInput}
                className="text-[10px] text-amber-100/30 hover:text-amber-100/60 transition-colors flex items-center justify-center gap-2"
              >
                <Type size={12} />
                <span>Prefer to type instead</span>
              </button>
            </div>
          </div>
        )}

        {/* TEXT INPUT FALLBACK */}
        {view === 'input' && (
          <div className="flex-1 flex flex-col justify-center space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            <div className="text-center space-y-4">
              <h2 className="text-3xl md:text-4xl font-light tracking-tight leading-[1.3] text-amber-50/90">
                What is heavy on your <span className="romance-font italic text-amber-200/80">heart</span>?
              </h2>
            </div>

            <div className="space-y-10">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Speak your heart..."
                className="w-full bg-transparent text-xl md:text-2xl font-light text-center border-b border-amber-100/10 py-4 focus:border-amber-200/30 outline-none placeholder:text-amber-100/10 transition-all text-amber-50"
              />

              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.slice(0, 4).map((s, i) => (
                    <button key={i} onClick={() => setTextInput(s)} className="text-[10px] px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/5 text-amber-100/40">
                      {s}
                    </button>
                  ))}
                </div>

                <button
                  onClick={processTextInput}
                  disabled={!textInput.trim()}
                  className="w-full group bg-amber-100 text-[#0a0a0a] font-bold py-5 rounded-full transition-all hover:bg-white active:scale-95 disabled:opacity-20 flex items-center justify-center gap-3 mt-4 shadow-[0_0_30px_rgba(251,191,36,0.1)]"
                >
                  <Sparkles size={16} className="text-amber-700" />
                  <span className="uppercase tracking-[0.3em] text-[10px]">Seek Wisdom</span>
                </button>

                <button
                  onClick={() => setView('mirror')}
                  className="text-[10px] text-amber-100/30 hover:text-amber-100/60 transition-colors flex items-center justify-center gap-2"
                >
                  <Camera size={12} />
                  <span>Use camera instead</span>
                </button>

                {/* Audio Recording UI */}
                <div className="pt-8 flex flex-col items-center gap-4">
                  {isProcessingAudio ? (
                    <div className="w-full bg-white/5 backdrop-blur-sm rounded-2xl p-5 border border-amber-100/10 animate-in fade-in">
                      <div className="flex items-center justify-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-amber-100/10 flex items-center justify-center relative">
                          <div className="absolute inset-0 border-2 border-amber-200/30 border-t-amber-400 rounded-full animate-spin" />
                          <Mic size={16} className="text-amber-200" />
                        </div>
                        <p className="text-sm text-amber-100/80">
                          {liveTranscript ? 'Analyzing...' : 'Transcribing...'}
                        </p>
                      </div>
                      {liveTranscript && (
                        <p className="text-xs text-amber-100/50 italic text-center">"{liveTranscript}"</p>
                      )}
                    </div>
                  ) : (
                    <>
                      <p className={`text-[10px] uppercase tracking-[0.2em] ${isRecording ? 'text-rose-400' : 'text-amber-100/20'}`}>
                        {isRecording ? 'Listening... Tap to stop' : 'Or speak your prayer'}
                      </p>
                      <button
                        onClick={isRecording ? handleStopRecording : handleStartRecording}
                        className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 ${isRecording
                          ? 'bg-rose-500/20 border-2 border-rose-500 shadow-[0_0_30px_rgba(244,63,94,0.4)] animate-pulse'
                          : 'bg-amber-100/10 border border-amber-100/20 hover:bg-amber-100/20'
                          }`}
                      >
                        {isRecording ? (
                          <Square size={24} className="text-rose-500 fill-rose-500" />
                        ) : (
                          <Mic size={24} className="text-amber-200" />
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SCREEN 2: THE DIAGNOSIS - Enhanced with Leonardo Engine v2.0 */}
        {view === 'diagnosis' && (
          <div className="flex-1 flex flex-col items-center justify-center space-y-6 animate-in fade-in">
            {/* Blurred background from capture */}
            {capturedImage && (
              <div className="absolute inset-0 overflow-hidden">
                <img src={capturedImage} className="w-full h-full object-cover blur-3xl opacity-20 scale-110" alt="" />
              </div>
            )}

            <div className="relative z-10 flex flex-col items-center space-y-6 w-full max-w-sm">
              {/* Processing Animation */}
              <div className="relative w-20 h-20 flex items-center justify-center">
                <div className="absolute inset-0 border-t border-amber-200/30 rounded-full animate-spin" style={{ animationDuration: '3s' }}></div>
                <div className="absolute inset-2 border-b border-amber-200/10 rounded-full animate-spin" style={{ animationDuration: '2s', animationDirection: 'reverse' }}></div>
                <div className="absolute inset-4 border-t border-amber-200/20 rounded-full animate-spin" style={{ animationDuration: '4s' }}></div>

                {deepAnalysis ? (
                  <span className="text-2xl">{ARCHETYPE_ICONS[deepAnalysis.archetype]}</span>
                ) : (
                  <Eye className="text-amber-100/20 animate-pulse" size={28} />
                )}
              </div>

              {/* Archetype Reveal */}
              {deepAnalysis && (
                <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-amber-200/50 mb-2">Your Archetype</p>
                  <h3 className="font-['Cinzel'] text-xl text-amber-100">{deepAnalysis.archetype}</h3>
                </div>
              )}

              {/* Deep Analysis Insights Panel */}
              {deepAnalysis && (
                <div className="w-full space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">

                  {/* Temperament Badge */}
                  <div className="flex justify-center">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-900/20 border border-violet-500/20">
                      <span className="text-sm">{TEMPERAMENT_ICONS[deepAnalysis.temperament.temperament]}</span>
                      <span className="text-[9px] uppercase tracking-[0.15em] text-violet-200/70">
                        The {deepAnalysis.temperament.temperament}
                      </span>
                    </div>
                  </div>

                  {/* Emotional Weather Meters */}
                  <div className="bg-black/30 backdrop-blur-sm rounded-2xl p-4 border border-white/5 space-y-3">
                    <div className="flex items-center gap-2 mb-3">
                      <Activity size={12} className="text-amber-400/60" />
                      <span className="text-[9px] uppercase tracking-[0.2em] text-amber-100/50">Emotional Weather</span>
                    </div>

                    {/* Warmth Need */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[8px] text-amber-100/40">
                        <span>Warmth Need</span>
                        <span>{deepAnalysis.emotionalWeather.warmthNeed}%</span>
                      </div>
                      <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-rose-500/60 to-amber-400/60 rounded-full transition-all duration-1000"
                          style={{ width: `${deepAnalysis.emotionalWeather.warmthNeed}%` }}
                        />
                      </div>
                    </div>

                    {/* Power Level */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[8px] text-amber-100/40">
                        <span>Power Level</span>
                        <span>{deepAnalysis.emotionalWeather.powerLevel}%</span>
                      </div>
                      <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500/60 to-emerald-400/60 rounded-full transition-all duration-1000"
                          style={{ width: `${deepAnalysis.emotionalWeather.powerLevel}%` }}
                        />
                      </div>
                    </div>

                    {/* Openness */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[8px] text-amber-100/40">
                        <span>Openness</span>
                        <span>{deepAnalysis.emotionalWeather.openness}%</span>
                      </div>
                      <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-violet-500/60 to-sky-400/60 rounded-full transition-all duration-1000"
                          style={{ width: `${deepAnalysis.emotionalWeather.openness}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Burden Detection Alert — high confidence only */}
                  {deepAnalysis.burdenDetection.maskedPain &&
                    deepAnalysis.burdenDetection.sfumatoCoefficient >= 8 &&
                    deepAnalysis.burdenDetection.suppressionIndicators.length >= 2 && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-900/20 border border-rose-500/20 animate-pulse">
                      <AlertTriangle size={12} className="text-rose-400/80" />
                      <span className="text-[9px] text-rose-200/70">
                        We see what you're carrying beneath the surface
                      </span>
                    </div>
                  )}

                  {/* Soft presence message — low-confidence masked pain */}
                  {deepAnalysis.burdenDetection.maskedPain &&
                    !(deepAnalysis.burdenDetection.sfumatoCoefficient >= 8 &&
                      deepAnalysis.burdenDetection.suppressionIndicators.length >= 2) && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-900/20 border border-amber-500/20">
                      <Heart size={12} className="text-amber-400/60" />
                      <span className="text-[9px] text-amber-200/60">
                        We're here with whatever you're carrying today
                      </span>
                    </div>
                  )}

                  {/* Ministry Depth Indicator */}
                  {deepAnalysis.ministryDepth !== 'surface' && (
                    <div className="text-center">
                      <span className="text-[8px] uppercase tracking-[0.2em] text-amber-200/40">
                        {deepAnalysis.ministryDepth === 'crisis'
                          ? 'Entering deep ministry mode'
                          : 'Going deeper than surface level'}
                      </span>
                    </div>
                  )}

                  {/* Crisis Intervention Banner — diagnosis screen */}
                  {showCrisisBanner && <CrisisBanner />}
                </div>
              )}

              {/* Loading Message */}
              <p className="text-[10px] uppercase tracking-[0.4em] font-light text-amber-100/40">
                {LOADING_MESSAGES[loadingStage][loadingMsgIndex]}
              </p>
            </div>
          </div>
        )}

        {/* SCREEN 3: THE ANCHOR */}
        {view === 'anchor' && gift && (
          <div className="flex-1 flex flex-col items-center animate-in fade-in duration-1000 space-y-8 py-4">
            {/* Archetype + Temperament Badge */}
            {deepAnalysis && (
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber-900/20 border border-amber-500/20">
                  <span className="text-lg">{ARCHETYPE_ICONS[deepAnalysis.archetype]}</span>
                  <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-amber-100/60">{deepAnalysis.archetype}</span>
                </div>
                <div className="flex items-center gap-1 text-[8px] text-violet-300/50">
                  <span>{TEMPERAMENT_ICONS[deepAnalysis.temperament.temperament]}</span>
                  <span>needs {deepAnalysis.temperament.temperament === 'Sage' ? 'Wisdom' :
                    deepAnalysis.temperament.temperament === 'Lover' ? 'Comfort' :
                      deepAnalysis.temperament.temperament === 'Warrior' ? 'Courage' : 'Rest'}</span>
                </div>
              </div>
            )}

            {/* Crisis Intervention Banner — anchor screen, shown above prayer */}
            {showCrisisBanner && <CrisisBanner />}

            {/* Scripture Card */}
            <div className="w-full aspect-[4/5] rounded-[2rem] overflow-hidden border border-amber-100/10 relative shadow-2xl bg-[#0a0a0a]">
              <img src={gift.imageUrl} className="w-full h-full object-cover opacity-60" alt="Sanctuary" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#02040a] via-[#02040a]/60 to-transparent p-8 flex flex-col justify-end items-center text-center pb-12">
                {/* Scripture Reference - Highlighted */}
                <div className="bg-amber-900/30 border border-amber-500/20 px-6 py-2 rounded-full mb-6">
                  <span className="text-[11px] uppercase tracking-[0.3em] text-amber-200/80 font-bold">{gift.scriptureReference}</span>
                </div>
                {/* Scripture Text - The Anchor */}
                <p className="romance-font italic text-xl md:text-2xl leading-relaxed text-amber-50/90 drop-shadow-lg">
                  "{gift.scriptureText}"
                </p>
              </div>
            </div>

            {/* Listen Button */}
            <button
              onClick={handleFinalize}
              className="w-full bg-amber-900/20 border border-amber-500/20 py-5 rounded-full uppercase tracking-[0.3em] text-[10px] font-bold text-amber-100 hover:bg-amber-900/40 transition-all flex items-center justify-center gap-3"
            >
              <Volume2 size={14} /> Hear His Word
            </button>
          </div>
        )}

        {/* SCREEN 4: THE WHISPER — Parchment Prayer Card */}
        {view === 'whisper' && gift && (
          <div className="flex-1 flex flex-col items-center animate-in fade-in duration-1000 overflow-hidden">
            {/* Atmospheric background — faint SVG, reduced opacity */}
            <div className="absolute inset-0 overflow-hidden">
              <img
                src={gift.imageUrl}
                className={`w-full h-full object-cover transition-transform duration-[60s] ease-linear opacity-15 ${isPlaying ? 'scale-110' : 'scale-100'}`}
                alt=""
              />
              <div className="absolute inset-0 bg-gradient-to-b from-[#02040a]/70 via-[#02040a]/50 to-[#02040a]" />
            </div>

            {/* Scrollable content */}
            <div className="relative z-10 flex-1 w-full overflow-y-auto flex flex-col items-center justify-center px-5 py-6 gap-5">

              {/* Parchment card */}
              <div
                className="w-full max-w-sm rounded-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-1000"
                style={{
                  background: 'linear-gradient(160deg, #f7ecd4 0%, #f0e2bc 45%, #e9d8a8 100%)',
                  boxShadow: '0 0 0 1px rgba(139,90,43,0.18), 0 12px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.3)',
                }}
              >
                {/* Top aged border */}
                <div style={{ height: '2px', background: 'linear-gradient(90deg, transparent 0%, rgba(139,90,43,0.35) 30%, rgba(139,90,43,0.35) 70%, transparent 100%)' }} />

                {/* Archetype + "Scripture Grounded" */}
                <div className="flex flex-col items-center pt-5 pb-3 gap-1">
                  {deepAnalysis && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-base">{ARCHETYPE_ICONS[deepAnalysis.archetype]}</span>
                      <span className="text-[8px] uppercase tracking-[0.3em] font-bold" style={{ color: 'rgba(101,67,33,0.55)' }}>
                        {deepAnalysis.archetype}
                      </span>
                    </div>
                  )}
                  <span className="text-[7px] uppercase tracking-[0.25em]" style={{ color: 'rgba(139,90,43,0.35)' }}>
                    ✦ Douay-Rheims · Padre Pio ✦
                  </span>
                </div>

                {/* Prayer text — EB Garamond italic */}
                <div className="px-7 py-3 text-center">
                  <p
                    className="italic text-[15px] leading-[1.95]"
                    style={{
                      fontFamily: '"EB Garamond", Georgia, "Times New Roman", serif',
                      color: '#3d2b1a',
                      textShadow: '0 1px 2px rgba(255,255,255,0.4)',
                    }}
                  >
                    "{gift.devotionalText}"
                  </p>
                </div>

                {/* ✝ divider */}
                <div className="flex items-center px-8 py-3 gap-3">
                  <div className="flex-1 h-px" style={{ background: 'rgba(139,90,43,0.2)' }} />
                  <span style={{ color: 'rgba(139,90,43,0.45)', fontSize: '12px', lineHeight: 1 }}>✝</span>
                  <div className="flex-1 h-px" style={{ background: 'rgba(139,90,43,0.2)' }} />
                </div>

                {/* Scripture reference & text */}
                <div className="px-7 pb-6 text-center">
                  <p
                    className="text-[10px] uppercase tracking-[0.22em] font-bold mb-2"
                    style={{ color: 'rgba(101,67,33,0.75)' }}
                  >
                    {gift.scriptureReference}
                  </p>
                  <p
                    className="text-[10px] leading-relaxed italic"
                    style={{
                      fontFamily: '"EB Garamond", Georgia, serif',
                      color: 'rgba(101,67,33,0.6)',
                    }}
                  >
                    {gift.scriptureText}
                  </p>
                </div>

                {/* Bottom aged border */}
                <div style={{ height: '2px', background: 'linear-gradient(90deg, transparent 0%, rgba(139,90,43,0.35) 30%, rgba(139,90,43,0.35) 70%, transparent 100%)' }} />
              </div>

              {/* Audio visualizer */}
              <div className="flex justify-center">
                <AudioVisualizer isPlaying={isPlaying} analyzer={analyzer} />
              </div>
            </div>

            {/* Fixed bottom controls */}
            <div className="relative z-10 w-full bg-gradient-to-t from-[#02040a] via-[#02040a]/95 to-transparent pt-4 pb-4 px-5">
              {/* Play Button */}
              <div className="flex justify-center mb-5">
                <button
                  onClick={togglePlay}
                  disabled={!audioReady}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-500 shadow-[0_0_30px_rgba(251,191,36,0.15)] ${!audioReady
                    ? 'bg-amber-100/10 text-amber-100/30 cursor-wait'
                    : isPlaying
                      ? 'bg-amber-100/10 backdrop-blur-xl border border-amber-200/30 text-amber-100'
                      : 'bg-amber-50 text-[#0a0a0a] hover:scale-105 hover:bg-white active:scale-95'
                    }`}
                >
                  {!audioReady ? (
                    <div className="w-4 h-4 border-2 border-amber-200/30 border-t-amber-200 rounded-full animate-spin" />
                  ) : isPlaying ? (
                    <Pause size={18} />
                  ) : (
                    <Play size={18} className="ml-0.5" />
                  )}
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 mb-3">
                <button
                  onClick={handleReset}
                  className="flex-1 py-3 border border-amber-100/10 rounded-full text-[9px] uppercase tracking-[0.2em] font-bold text-amber-100/40 hover:text-amber-100/60 hover:border-amber-100/20 transition-all flex items-center justify-center gap-2"
                >
                  <RefreshCw size={11} /> New
                </button>
                <button
                  onClick={() => {
                    if (gift.audioBase64) {
                      const url = createMp3Url(gift.audioBase64);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'padre-pio-prayer.mp3';
                      a.click();
                    }
                  }}
                  className="flex-[2] py-3 bg-amber-100 text-[#0a0a0a] rounded-full text-[9px] uppercase tracking-[0.2em] font-bold flex items-center justify-center gap-2 hover:bg-white transition-all shadow-lg active:scale-95"
                >
                  <Download size={11} /> Save This Word
                </button>
              </div>

              {/* Novena invitation */}
              <div className="flex justify-center">
                <button
                  onClick={() => setView('novena')}
                  className="text-[9px] uppercase tracking-[0.15em] text-amber-100/25 hover:text-amber-100/50 transition-colors py-1"
                >
                  Begin a Novena with Padre Pio ›
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SCREEN 5: NOVENA TRACKER */}
        {view === 'novena' && (
          <div className="flex-1 flex flex-col items-center animate-in fade-in duration-700 overflow-y-auto px-5 py-6">

            {/* Header */}
            <div className="w-full max-w-sm mb-6">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-['Cinzel'] text-[13px] tracking-[0.25em] font-bold uppercase text-amber-100/80">
                  Novenas
                </h2>
                <button
                  onClick={() => setView('welcome')}
                  className="text-[9px] uppercase tracking-[0.15em] text-amber-100/30 hover:text-amber-100/60 transition-colors"
                >
                  ← Return
                </button>
              </div>
              <p className="text-[10px] text-amber-100/30 leading-relaxed">
                Nine days of prayer. Padre Pio prayed for every soul who asked.
              </p>
            </div>

            {/* Novena cards */}
            <div className="w-full max-w-sm space-y-4">
              {(novenaData as any[]).map((novena: any) => {
                const progress = novenaProgress[novena.id];
                const currentDay = progress?.day || 0;
                const isComplete = currentDay >= 9;
                const dayData = currentDay > 0 ? novena.days[currentDay - 1] : null;
                const isActive = activeNovenaId === novena.id;

                return (
                  <div
                    key={novena.id}
                    className="rounded-2xl border border-amber-500/15 overflow-hidden"
                    style={{ background: 'rgba(251,191,36,0.04)' }}
                  >
                    {/* Novena header */}
                    <div className="px-5 pt-5 pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <h3 className="font-['Cinzel'] text-[11px] tracking-[0.15em] font-bold text-amber-100/80 mb-0.5">
                            {novena.title}
                          </h3>
                          <p className="text-[9px] text-amber-100/35 leading-relaxed">{novena.subtitle}</p>
                        </div>
                        {isComplete && (
                          <span className="text-[8px] uppercase tracking-widest text-emerald-400/60 font-bold shrink-0">
                            ✓ Complete
                          </span>
                        )}
                      </div>

                      {/* 9-day progress dots */}
                      {currentDay > 0 && (
                        <div className="flex gap-1.5 mt-3">
                          {Array.from({ length: 9 }, (_, i) => (
                            <div
                              key={i}
                              className="w-5 h-1.5 rounded-full transition-all"
                              style={{
                                background: i < currentDay
                                  ? 'rgba(251,191,36,0.7)'
                                  : 'rgba(251,191,36,0.12)',
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Active day content */}
                    {isActive && dayData && !isComplete && (
                      <div
                        className="mx-4 mb-4 rounded-xl p-4"
                        style={{
                          background: 'linear-gradient(160deg, #f7ecd4 0%, #ede2be 100%)',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3)',
                        }}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[8px] uppercase tracking-[0.3em] font-bold" style={{ color: 'rgba(101,67,33,0.55)' }}>
                            Day {currentDay} of 9
                          </span>
                          <span className="text-[8px] uppercase tracking-[0.2em]" style={{ color: 'rgba(101,67,33,0.4)' }}>
                            {dayData.intention}
                          </span>
                        </div>
                        <p
                          className="italic text-[12px] leading-[1.85] mb-3"
                          style={{ fontFamily: '"EB Garamond", Georgia, serif', color: '#3d2b1a' }}
                        >
                          {dayData.prayer}
                        </p>
                        {dayData.scripture && (
                          <div className="border-t pt-3" style={{ borderColor: 'rgba(139,90,43,0.15)' }}>
                            <p className="text-[9px] font-bold uppercase tracking-[0.15em] mb-1" style={{ color: 'rgba(101,67,33,0.6)' }}>
                              {dayData.scripture.reference}
                            </p>
                            <p className="italic text-[10px] leading-relaxed" style={{ fontFamily: '"EB Garamond", Georgia, serif', color: 'rgba(101,67,33,0.55)' }}>
                              {dayData.scripture.text}
                            </p>
                          </div>
                        )}
                        <button
                          onClick={() => advanceNovenaDay(novena.id)}
                          className="mt-4 w-full py-2.5 rounded-full text-[9px] uppercase tracking-[0.2em] font-bold transition-all"
                          style={{ background: 'rgba(139,90,43,0.15)', color: 'rgba(101,67,33,0.8)' }}
                        >
                          {currentDay < 9 ? `Mark Day ${currentDay} Complete →` : 'Novena Complete ✓'}
                        </button>
                      </div>
                    )}

                    {/* Completed message */}
                    {isActive && isComplete && (
                      <div className="mx-4 mb-4 px-4 py-3 rounded-xl text-center" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
                        <p className="text-[10px] text-emerald-300/70 leading-relaxed italic">
                          "{novena.closing}"
                        </p>
                        <button
                          onClick={() => resetNovena(novena.id)}
                          className="mt-3 text-[8px] uppercase tracking-[0.15em] text-emerald-400/40 hover:text-emerald-400/70 transition-colors"
                        >
                          Begin Again
                        </button>
                      </div>
                    )}

                    {/* Action footer */}
                    <div className="px-5 pb-4">
                      {currentDay === 0 ? (
                        <button
                          onClick={() => { startNovena(novena.id); setActiveNovenaId(novena.id); }}
                          className="w-full py-2.5 border border-amber-500/20 rounded-full text-[9px] uppercase tracking-[0.2em] font-bold text-amber-100/50 hover:text-amber-100/80 hover:border-amber-500/40 transition-all"
                        >
                          Begin This Novena
                        </button>
                      ) : !isActive ? (
                        <button
                          onClick={() => setActiveNovenaId(novena.id)}
                          className="w-full py-2.5 border border-amber-500/15 rounded-full text-[9px] uppercase tracking-[0.15em] text-amber-100/40 hover:text-amber-100/60 transition-all"
                        >
                          Day {currentDay} — Continue →
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Opening prayer note */}
            <p className="w-full max-w-sm text-center text-[9px] text-amber-100/20 leading-relaxed mt-6 italic">
              "Pray, hope, and don't worry. Worry is useless. God is merciful and will hear your prayer." — St. Padre Pio
            </p>
          </div>
        )}

      </div>
    </div>
  );
};

export default App;
