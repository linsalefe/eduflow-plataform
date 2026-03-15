'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Loader2, Volume2, X, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

type JarvisState = 'idle' | 'listening' | 'processing' | 'speaking';

export function JarvisButton() {
  const [state, setState] = useState<JarvisState>('idle');
  const [transcript, setTranscript] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);

  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const finalTranscriptRef = useRef('');

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      audioRef.current?.pause();
      streamRef.current?.getTracks().forEach(t => t.stop());
      cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Monitor mic volume for ring reactivity
  const startAudioMonitor = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setAudioLevel(avg / 255);
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // Mic permission denied — continue without visualizer
    }
  }, []);

  const stopAudioMonitor = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    cancelAnimationFrame(animFrameRef.current);
    setAudioLevel(0);
  }, []);

  // Start listening
  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition
      || (window as any).webkitSpeechRecognition;

    if (!SR) {
      setError('Seu navegador não suporta reconhecimento de voz. Use Chrome ou Edge.');
      return;
    }

    const recognition = new SR();
    recognition.lang = 'pt-BR';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onresult = (e: any) => {
      let interim = '';
      let final = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          final += r[0].transcript;
        } else {
          interim += r[0].transcript;
        }
      }
      finalTranscriptRef.current = final;
      setTranscript(final || interim);
    };

    recognition.onend = () => {
      const text = finalTranscriptRef.current;
      stopAudioMonitor();
      if (text.trim()) {
        sendToJarvis(text.trim());
      } else {
        reset();
      }
    };

    recognition.onerror = (e: any) => {
      stopAudioMonitor();
      if (e.error === 'not-allowed') {
        setError('Permissão de microfone negada.');
      }
      reset();
    };

    recognitionRef.current = recognition;
    recognition.start();
    startAudioMonitor();
    setState('listening');
    setTranscript('');
    setAnswer('');
    setError('');
    finalTranscriptRef.current = '';
  }, [startAudioMonitor, stopAudioMonitor]);

  // Send to backend
  const sendToJarvis = async (text: string) => {
    setState('processing');
    try {
      const res = await api.post('/jarvis/query', { text });
      const data = res.data;
      setAnswer(data.text);

      if (data.audio_b64) {
        playAudio(data.audio_b64);
      } else {
        setState('idle');
      }
    } catch (err: any) {
      setError('Erro ao consultar o Jarvis. Tente novamente.');
      reset();
    }
  };

  // Play TTS audio
  const playAudio = (b64: string) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioRef.current = audio;

    audio.onplay = () => setState('speaking');
    audio.onended = () => {
      URL.revokeObjectURL(url);
      setState('idle');
    };
    audio.onerror = () => {
      setState('idle');
    };

    audio.play().catch(() => setState('idle'));
  };

  // Cancel / Reset
  const cancel = useCallback(() => {
    recognitionRef.current?.abort();
    audioRef.current?.pause();
    stopAudioMonitor();
    reset();
  }, [stopAudioMonitor]);

  const reset = () => {
    setState('idle');
    setTranscript('');
    setAnswer('');
    setError('');
    setAudioLevel(0);
    finalTranscriptRef.current = '';
  };

  const isActive = state !== 'idle';
  const showCard = isActive || answer || error;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">

      {/* ============================================================
          CARD EXPANSÍVEL — transcrição + resposta
          ============================================================ */}
      <AnimatePresence>
        {showCard && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.3, ease: [0.175, 0.885, 0.32, 1.275] }}
            className={cn(
              'w-[340px] max-w-[calc(100vw-48px)] rounded-2xl border border-border',
              'bg-card/95 backdrop-blur-xl shadow-xl shadow-black/10',
              'overflow-hidden'
            )}
          >
            {/* Card header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} />
                </div>
                <span className="text-[13px] font-semibold text-foreground">Jarvis</span>
                <span className="text-[11px] text-muted-foreground">Assistente de voz</span>
              </div>
              {isActive && (
                <button
                  onClick={cancel}
                  className="h-6 w-6 rounded-md hover:bg-muted flex items-center justify-center transition-colors"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>

            {/* Card body */}
            <div className="px-4 py-3 space-y-3 max-h-[300px] overflow-y-auto">

              {/* Listening — transcrição em tempo real */}
              {state === 'listening' && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex items-center gap-[3px]">
                      {[...Array(5)].map((_, i) => (
                        <div
                          key={i}
                          className="jarvis-wave-bar"
                          style={{
                            '--wave-h': `${8 + audioLevel * 20 + Math.random() * 8}px`,
                            animationDelay: `${i * 0.1}s`,
                            height: '4px',
                          } as React.CSSProperties}
                        />
                      ))}
                    </div>
                    <span className="text-[12px] text-primary font-medium">Ouvindo...</span>
                  </div>
                  {transcript ? (
                    <p className="text-[14px] text-foreground leading-relaxed jarvis-cursor">
                      {transcript}
                    </p>
                  ) : (
                    <p className="text-[13px] text-muted-foreground italic">
                      Fale sua pergunta...
                    </p>
                  )}
                </div>
              )}

              {/* Processing */}
              {state === 'processing' && (
                <div>
                  <p className="text-[13px] text-muted-foreground mb-2">Você perguntou:</p>
                  <p className="text-[14px] text-foreground mb-3">{transcript}</p>
                  <div className="flex items-center gap-2 text-primary">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-[13px] font-medium">Consultando dados...</span>
                  </div>
                </div>
              )}

              {/* Speaking / Answer */}
              {(state === 'speaking' || (state === 'idle' && answer)) && (
                <div>
                  <p className="text-[13px] text-muted-foreground mb-1">Você perguntou:</p>
                  <p className="text-[14px] text-foreground/70 mb-3">{transcript}</p>
                  <div className="bg-primary/[0.04] border border-primary/10 rounded-xl px-3.5 py-3">
                    <div className="flex items-start gap-2">
                      <div className="h-5 w-5 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Sparkles className="h-3 w-3 text-primary" strokeWidth={1.75} />
                      </div>
                      <p className="text-[14px] text-foreground leading-relaxed">
                        {answer}
                      </p>
                    </div>
                    {state === 'speaking' && (
                      <div className="flex items-center gap-2 mt-2 ml-7">
                        <div className="flex items-center gap-[2px]">
                          {[...Array(12)].map((_, i) => (
                            <div
                              key={i}
                              className="w-[2px] bg-primary/60 rounded-full animate-pulse"
                              style={{
                                height: `${4 + Math.random() * 10}px`,
                                animationDelay: `${i * 0.05}s`,
                                animationDuration: '0.6s',
                              }}
                            />
                          ))}
                        </div>
                        <span className="text-[11px] text-primary/70">Reproduzindo...</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <p className="text-[13px] text-destructive">{error}</p>
              )}
            </div>

            {/* Card footer — dismiss when idle with answer */}
            {state === 'idle' && (answer || error) && (
              <div className="px-4 py-2.5 border-t border-border/50">
                <button
                  onClick={reset}
                  className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Fechar
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ============================================================
          BOTÃO PRINCIPAL — com rings reativos por estado
          ============================================================ */}
      <div className="relative">

        {/* Ring: IDLE — breathing glow */}
        {state === 'idle' && (
          <div className="absolute inset-0 rounded-full jarvis-breathe pointer-events-none" />
        )}

        {/* Ring: LISTENING — sonar + volume reactive */}
        {state === 'listening' && (
          <>
            <div className="jarvis-sonar-ring" />
            <div className="jarvis-sonar-ring" />
            <div className="jarvis-sonar-ring" />
            {/* Volume-reactive ring */}
            <div
              className="absolute rounded-full border-2 border-primary/50 pointer-events-none transition-transform duration-75"
              style={{
                inset: `-${6 + audioLevel * 14}px`,
                opacity: 0.3 + audioLevel * 0.5,
              }}
            />
          </>
        )}

        {/* Ring: PROCESSING — conic gradient spin */}
        {state === 'processing' && (
          <div className="jarvis-processing-ring" />
        )}

        {/* Ring: SPEAKING — pulse */}
        {state === 'speaking' && (
          <>
            <div className="jarvis-speak-ring" />
            <div className="jarvis-speak-ring" style={{ animationDelay: '0.4s' }} />
          </>
        )}

        {/* Button */}
        <motion.button
          onClick={state === 'idle' ? startListening : cancel}
          whileTap={{ scale: 0.92 }}
          className={cn(
            'relative z-10 h-14 w-14 rounded-full flex items-center justify-center',
            'shadow-lg transition-all duration-200',
            state === 'idle' && 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/25',
            state === 'listening' && 'bg-primary text-primary-foreground shadow-primary/30',
            state === 'processing' && 'bg-primary text-primary-foreground shadow-primary/20',
            state === 'speaking' && 'bg-primary text-primary-foreground shadow-primary/25',
          )}
          aria-label={state === 'idle' ? 'Ativar Jarvis' : 'Cancelar'}
        >
          <AnimatePresence mode="wait">
            {state === 'idle' && (
              <motion.div
                key="mic"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <Mic className="h-6 w-6" strokeWidth={1.75} />
              </motion.div>
            )}
            {state === 'listening' && (
              <motion.div
                key="listening"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-[2px]"
              >
                {[...Array(4)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="w-[3px] bg-white rounded-full"
                    animate={{
                      height: [4, 8 + audioLevel * 14, 4],
                    }}
                    transition={{
                      duration: 0.5,
                      repeat: Infinity,
                      delay: i * 0.1,
                    }}
                  />
                ))}
              </motion.div>
            )}
            {state === 'processing' && (
              <motion.div
                key="processing"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1, rotate: 360 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ 
                  scale: { duration: 0.15 },
                  rotate: { duration: 1.5, repeat: Infinity, ease: 'linear' }
                }}
              >
                <Loader2 className="h-6 w-6" strokeWidth={1.75} />
              </motion.div>
            )}
            {state === 'speaking' && (
              <motion.div
                key="speaking"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <Volume2 className="h-6 w-6" strokeWidth={1.75} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </div>
  );
}