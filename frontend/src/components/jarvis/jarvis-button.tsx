'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, X, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

type JarvisState = 'idle' | 'listening' | 'processing' | 'speaking';

export function JarvisButton() {
  const [state, setState] = useState<JarvisState>('idle');
  const [transcript, setTranscript] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
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

  // ESC to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) closeOverlay();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Monitor mic volume
  const startAudioMonitor = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setAudioLevel(avg / 255);
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // Mic permission denied
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

    setIsOpen(true);
    setTranscript('');
    setAnswer('');
    setError('');
    finalTranscriptRef.current = '';

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
        setState('idle');
      }
    };

    recognition.onerror = (e: any) => {
      stopAudioMonitor();
      if (e.error === 'not-allowed') {
        setError('Permissão de microfone negada.');
      }
      setState('idle');
    };

    recognitionRef.current = recognition;
    recognition.start();
    startAudioMonitor();
    setState('listening');
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
    } catch {
      setError('Erro ao consultar o Jarvis. Tente novamente.');
      setState('idle');
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
    audio.onerror = () => setState('idle');
    audio.play().catch(() => setState('idle'));
  };

  // Close overlay
  const closeOverlay = useCallback(() => {
    recognitionRef.current?.abort();
    audioRef.current?.pause();
    stopAudioMonitor();
    setState('idle');
    setIsOpen(false);
    setTranscript('');
    setAnswer('');
    setError('');
    setAudioLevel(0);
    finalTranscriptRef.current = '';
  }, [stopAudioMonitor]);

  const orbSize = state === 'listening' ? 140 + audioLevel * 30 : 140;

  return (
    <>
      {/* ============================================================
          FLOATING BUTTON — visible when overlay is closed
          ============================================================ */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            onClick={startListening}
            className={cn(
              'fixed bottom-6 right-6 z-50',
              'h-14 w-14 rounded-full',
              'bg-primary text-white',
              'flex items-center justify-center',
              'shadow-lg cursor-pointer',
              'jarvis-btn-idle',
            )}
            aria-label="Ativar Jarvis"
            whileTap={{ scale: 0.9 }}
          >
            <Mic className="h-6 w-6" strokeWidth={1.75} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ============================================================
          FULLSCREEN OVERLAY — immersive Jarvis experience
          ============================================================ */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="fixed inset-0 z-[100] jarvis-overlay flex flex-col items-center justify-center"
          >
            {/* Close button */}
            <motion.button
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              onClick={closeOverlay}
              className="absolute top-6 right-6 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <X className="h-5 w-5 text-white/80" />
            </motion.button>

            {/* Branding */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="absolute top-6 left-6 flex items-center gap-2.5"
            >
              <div className="h-8 w-8 rounded-xl bg-primary/20 flex items-center justify-center border border-primary/20">
                <Sparkles className="h-4 w-4 text-blue-400" strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-white/90">Jarvis</p>
                <p className="text-[11px] text-white/40">Assistente de voz</p>
              </div>
            </motion.div>

            {/* ============================================================
                ORB SECTION — central visual
                ============================================================ */}
            <div className="relative flex items-center justify-center" style={{ width: 280, height: 280 }}>

              {/* Starburst lines behind orb */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="jarvis-starburst" style={{ width: 240, height: 240 }}>
                  {[...Array(12)].map((_, i) => (
                    <div
                      key={i}
                      className="absolute top-1/2 left-1/2 bg-blue-400/10"
                      style={{
                        width: 1,
                        height: 120,
                        transformOrigin: '0 0',
                        transform: `rotate(${i * 30}deg)`,
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Outer orbit ring 1 */}
              <div
                className="jarvis-orbit-ring"
                style={{ width: 220, height: 220, top: 30, left: 30 }}
              >
                <div
                  className="jarvis-particle"
                  style={{ width: 5, height: 5, top: -2.5, left: '50%', marginLeft: -2.5 }}
                />
                <div
                  className="jarvis-particle"
                  style={{ width: 4, height: 4, bottom: -2, right: '20%', animationDelay: '0.7s' }}
                />
              </div>

              {/* Outer orbit ring 2 (reverse) */}
              <div
                className="jarvis-orbit-ring jarvis-orbit-ring-reverse"
                style={{ width: 260, height: 260, top: 10, left: 10, borderStyle: 'dashed', borderColor: 'rgba(29, 78, 216, 0.1)' }}
              >
                <div
                  className="jarvis-particle"
                  style={{ width: 3, height: 3, top: '20%', right: -1.5, animationDelay: '1.2s' }}
                />
              </div>

              {/* Sonar ripples — listening */}
              {state === 'listening' && (
                <>
                  <div className="jarvis-ripple" style={{ width: orbSize, height: orbSize, top: `calc(50% - ${orbSize/2}px)`, left: `calc(50% - ${orbSize/2}px)` }} />
                  <div className="jarvis-ripple" style={{ width: orbSize, height: orbSize, top: `calc(50% - ${orbSize/2}px)`, left: `calc(50% - ${orbSize/2}px)` }} />
                  <div className="jarvis-ripple" style={{ width: orbSize, height: orbSize, top: `calc(50% - ${orbSize/2}px)`, left: `calc(50% - ${orbSize/2}px)` }} />
                </>
              )}

              {/* Processing ring */}
              {state === 'processing' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute"
                  style={{ width: 160, height: 160, top: 60, left: 60 }}
                >
                  <div className="jarvis-process-ring" />
                </motion.div>
              )}

              {/* THE ORB */}
              <motion.div
                animate={{
                  width: orbSize,
                  height: orbSize,
                }}
                transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                className={cn(
                  'relative rounded-full jarvis-orb cursor-pointer',
                  state === 'listening' && 'jarvis-orb-listening',
                )}
                onClick={state === 'idle' ? startListening : undefined}
              >
                {/* Inner highlight */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-300/20 via-transparent to-transparent" />

                {/* Center icon */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <AnimatePresence mode="wait">
                    {state === 'idle' && (
                      <motion.div
                        key="idle-icon"
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.5, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Mic className="h-10 w-10 text-white/90" strokeWidth={1.5} />
                      </motion.div>
                    )}

                    {state === 'listening' && (
                      <motion.div
                        key="listen-icon"
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.5, opacity: 0 }}
                        className="flex items-center gap-[3px]"
                      >
                        {[...Array(5)].map((_, i) => (
                          <motion.div
                            key={i}
                            className="w-[4px] bg-white/90 rounded-full"
                            animate={{
                              height: [6, 12 + audioLevel * 28, 6],
                            }}
                            transition={{
                              duration: 0.4,
                              repeat: Infinity,
                              delay: i * 0.08,
                            }}
                          />
                        ))}
                      </motion.div>
                    )}

                    {state === 'processing' && (
                      <motion.div
                        key="process-icon"
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.5, opacity: 0 }}
                      >
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                        >
                          <Sparkles className="h-10 w-10 text-white/90" strokeWidth={1.5} />
                        </motion.div>
                      </motion.div>
                    )}

                    {state === 'speaking' && (
                      <motion.div
                        key="speak-icon"
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.5, opacity: 0 }}
                        className="flex items-center gap-[2px]"
                      >
                        {[...Array(9)].map((_, i) => (
                          <div
                            key={i}
                            className="jarvis-speak-bar"
                            style={{
                              '--wave-h': `${6 + Math.abs(4 - i) * 5 + Math.random() * 6}px`,
                              animationDelay: `${i * 0.06}s`,
                              height: '4px',
                            } as React.CSSProperties}
                          />
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            </div>

            {/* ============================================================
                TEXT SECTION — below the orb
                ============================================================ */}
            <div className="mt-10 w-full max-w-md px-6 text-center min-h-[120px]">
              <AnimatePresence mode="wait">

                {/* Idle — prompt to speak */}
                {state === 'idle' && !answer && !error && (
                  <motion.div
                    key="idle-text"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                  >
                    <p className="text-[16px] text-white/70">
                      Toque no orbe e faça sua pergunta
                    </p>
                    <p className="text-[13px] text-white/30 mt-2">
                      Pergunte sobre leads, faturamento, pipeline e mais
                    </p>
                  </motion.div>
                )}

                {/* Listening — real-time transcript */}
                {state === 'listening' && (
                  <motion.div
                    key="listen-text"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    {transcript ? (
                      <p className="text-[18px] text-white/90 leading-relaxed jarvis-cursor">
                        {transcript}
                      </p>
                    ) : (
                      <p className="text-[16px] text-blue-300/70 italic">
                        Ouvindo...
                      </p>
                    )}
                  </motion.div>
                )}

                {/* Processing */}
                {state === 'processing' && (
                  <motion.div
                    key="process-text"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <p className="text-[14px] text-white/40 mb-2">{transcript}</p>
                    <p className="text-[15px] text-blue-300/80">Consultando dados...</p>
                  </motion.div>
                )}

                {/* Speaking / Answer */}
                {state === 'speaking' && answer && (
                  <motion.div
                    key="speak-text"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <p className="text-[18px] text-white/90 leading-relaxed jarvis-text-reveal">
                      {answer}
                    </p>
                  </motion.div>
                )}

                {/* Idle with answer (finished) */}
                {state === 'idle' && answer && (
                  <motion.div
                    key="done-text"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <p className="text-[14px] text-white/30 mb-2">{transcript}</p>
                    <p className="text-[18px] text-white/90 leading-relaxed">{answer}</p>
                    <div className="flex items-center justify-center gap-4 mt-6">
                      <button
                        onClick={startListening}
                        className="px-4 py-2 rounded-full bg-primary/20 hover:bg-primary/30 text-[13px] text-blue-300 transition-colors border border-primary/20"
                      >
                        Nova pergunta
                      </button>
                      <button
                        onClick={closeOverlay}
                        className="px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 text-[13px] text-white/50 transition-colors"
                      >
                        Fechar
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* Error */}
                {error && (
                  <motion.div
                    key="error-text"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <p className="text-[15px] text-red-400">{error}</p>
                    <button
                      onClick={startListening}
                      className="mt-4 px-4 py-2 rounded-full bg-primary/20 hover:bg-primary/30 text-[13px] text-blue-300 transition-colors border border-primary/20"
                    >
                      Tentar novamente
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Bottom hint */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="absolute bottom-6 text-[11px] text-white/20"
            >
              Pressione ESC para fechar
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}