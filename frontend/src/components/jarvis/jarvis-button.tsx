'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, X, Sparkles, Check, Ban, Loader2, PhoneCall, MessageSquare, GitBranch, CalendarCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

type JarvisState = 'idle' | 'listening' | 'processing' | 'speaking' | 'confirming';

interface PendingAction {
  action: string;
  description: string;
  details: Record<string, any>;
}

const ACTION_ICONS: Record<string, any> = {
  send_followup: MessageSquare,
  make_call: PhoneCall,
  move_pipeline: GitBranch,
  schedule: CalendarCheck,
};

const ACTION_COLORS: Record<string, string> = {
  send_followup: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/20',
  make_call: 'from-blue-500/20 to-blue-500/5 border-blue-500/20',
  move_pipeline: 'from-violet-500/20 to-violet-500/5 border-violet-500/20',
  schedule: 'from-amber-500/20 to-amber-500/5 border-amber-500/20',
};

const ACTION_TEXT_COLORS: Record<string, string> = {
  send_followup: 'text-emerald-400',
  make_call: 'text-blue-400',
  move_pipeline: 'text-violet-400',
  schedule: 'text-amber-400',
};

export function JarvisButton() {
  const [state, setState] = useState<JarvisState>('idle');
  const [transcript, setTranscript] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [confirming, setConfirming] = useState(false);

  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<{id: number, name: string, instance_name: string} | null>(null);
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
    setPendingAction(null);
    setConfirming(false);
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

      if (data.type === 'pending_action') {
        setAnswer(data.text);
        setPendingAction(data.pending_action);
        // Auto-select first channel
        const channels = data.pending_action?.details?.available_channels;
        if (channels?.length > 0) {
          setSelectedChannel(channels[0]);
        }
        setState('confirming');
        if (data.audio_b64) playAudio(data.audio_b64, true);
      } else {
        setAnswer(data.text);
        if (data.audio_b64) {
          playAudio(data.audio_b64, false);
        } else {
          setState('idle');
        }
      }
    } catch {
      setError('Erro ao consultar o Jarvis. Tente novamente.');
      setState('idle');
    }
  };

  // Confirm action
  const handleConfirm = async () => {
    if (!pendingAction) return;
    setConfirming(true);
    setState('processing');

    try {
      const details = { ...pendingAction.details };
      if (selectedChannel) {
        details.channel_id = selectedChannel.id;
        details.instance_name = selectedChannel.instance_name;
      }
      const res = await api.post('/jarvis/confirm', {
        action: pendingAction.action,
        details,
        generate_audio: true,
      });
      const data = res.data;
      setAnswer(data.text);
      setPendingAction(null);
      setConfirming(false);

      if (data.audio_b64) {
        playAudio(data.audio_b64, false);
      } else {
        setState('idle');
      }
    } catch {
      setError('Erro ao executar a ação.');
      setPendingAction(null);
      setConfirming(false);
      setState('idle');
    }
  };

  // Cancel action
  const handleCancel = () => {
    setPendingAction(null);
    setConfirming(false);
    setAnswer('Ação cancelada.');
    setState('idle');
  };

  // Play TTS audio
  const playAudio = (b64: string, keepState: boolean) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioRef.current = audio;

    audio.onplay = () => {
      if (!keepState) setState('speaking');
    };
    audio.onended = () => {
      URL.revokeObjectURL(url);
      if (!keepState) setState('idle');
    };
    audio.onerror = () => {
      if (!keepState) setState('idle');
    };
    audio.play().catch(() => {
      if (!keepState) setState('idle');
    });
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
    setPendingAction(null);
    setConfirming(false);
    finalTranscriptRef.current = '';
  }, [stopAudioMonitor]);

  const orbSize = state === 'listening' ? 140 + audioLevel * 30 : 140;

  const actionIcon = pendingAction ? ACTION_ICONS[pendingAction.action] || Sparkles : Sparkles;
  const ActionIcon = actionIcon;
  const actionColor = pendingAction ? ACTION_COLORS[pendingAction.action] || '' : '';
  const actionTextColor = pendingAction ? ACTION_TEXT_COLORS[pendingAction.action] || 'text-blue-400' : 'text-blue-400';

  return (
    <>
      {/* ============================================================
          FLOATING BUTTON — with orbital ring
          ============================================================ */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="fixed bottom-6 right-6 z-50"
            style={{ width: 72, height: 72 }}
          >
            <div className="absolute jarvis-orbit-ring" style={{ inset: -4, borderColor: 'rgba(96, 165, 250, 0.3)' }}>
              <div className="jarvis-particle" style={{ width: 5, height: 5, top: -2.5, left: '50%', marginLeft: -2.5 }} />
              <div className="jarvis-particle" style={{ width: 4, height: 4, bottom: -2, right: '15%', animationDelay: '1s' }} />
            </div>
            <div className="absolute jarvis-orbit-ring jarvis-orbit-ring-reverse" style={{ inset: -10, borderStyle: 'dashed', borderColor: 'rgba(29, 78, 216, 0.15)' }}>
              <div className="jarvis-particle" style={{ width: 3, height: 3, top: '25%', right: -1.5, animationDelay: '0.5s' }} />
            </div>

            <motion.button
              onClick={startListening}
              whileTap={{ scale: 0.9 }}
              className={cn(
                'absolute inset-0 m-auto h-14 w-14 rounded-full',
                'bg-primary text-white flex items-center justify-center',
                'serviçor-pointer jarvis-btn-idle',
              )}
              aria-label="Ativar Jarvis"
            >
              <Mic className="h-6 w-6" strokeWidth={1.75} />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ============================================================
          FULLSCREEN OVERLAY
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
            {/* Close */}
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
                ORB SECTION
                ============================================================ */}
            <div className="relative flex items-center justify-center" style={{ width: 280, height: 280 }}>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="jarvis-starburst" style={{ width: 240, height: 240 }}>
                  {[...Array(12)].map((_, i) => (
                    <div key={i} className="absolute top-1/2 left-1/2 bg-blue-400/10"
                      style={{ width: 1, height: 120, transformOrigin: '0 0', transform: `rotate(${i * 30}deg)` }} />
                  ))}
                </div>
              </div>

              <div className="jarvis-orbit-ring" style={{ width: 220, height: 220, top: 30, left: 30 }}>
                <div className="jarvis-particle" style={{ width: 5, height: 5, top: -2.5, left: '50%', marginLeft: -2.5 }} />
                <div className="jarvis-particle" style={{ width: 4, height: 4, bottom: -2, right: '20%', animationDelay: '0.7s' }} />
              </div>
              <div className="jarvis-orbit-ring jarvis-orbit-ring-reverse"
                style={{ width: 260, height: 260, top: 10, left: 10, borderStyle: 'dashed', borderColor: 'rgba(29, 78, 216, 0.1)' }}>
                <div className="jarvis-particle" style={{ width: 3, height: 3, top: '20%', right: -1.5, animationDelay: '1.2s' }} />
              </div>

              {state === 'listening' && (
                <>
                  <div className="jarvis-ripple" style={{ width: orbSize, height: orbSize, top: `calc(50% - ${orbSize/2}px)`, left: `calc(50% - ${orbSize/2}px)` }} />
                  <div className="jarvis-ripple" style={{ width: orbSize, height: orbSize, top: `calc(50% - ${orbSize/2}px)`, left: `calc(50% - ${orbSize/2}px)` }} />
                  <div className="jarvis-ripple" style={{ width: orbSize, height: orbSize, top: `calc(50% - ${orbSize/2}px)`, left: `calc(50% - ${orbSize/2}px)` }} />
                </>
              )}

              {state === 'processing' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="absolute" style={{ width: 160, height: 160, top: 60, left: 60 }}>
                  <div className="jarvis-process-ring" />
                </motion.div>
              )}

              <motion.div
                animate={{ width: orbSize, height: orbSize }}
                transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                className={cn(
                  'relative rounded-full jarvis-orb serviçor-pointer',
                  state === 'listening' && 'jarvis-orb-listening',
                )}
                onClick={state === 'idle' && !pendingAction ? startListening : undefined}
              >
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-300/20 via-transparent to-transparent" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <AnimatePresence mode="wait">
                    {state === 'idle' && !pendingAction && (
                      <motion.div key="idle" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}>
                        <Mic className="h-10 w-10 text-white/90" strokeWidth={1.5} />
                      </motion.div>
                    )}
                    {state === 'listening' && (
                      <motion.div key="listen" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} className="flex items-center gap-[3px]">
                        {[...Array(5)].map((_, i) => (
                          <motion.div key={i} className="w-[4px] bg-white/90 rounded-full"
                            animate={{ height: [6, 12 + audioLevel * 28, 6] }}
                            transition={{ duration: 0.4, repeat: Infinity, delay: i * 0.08 }} />
                        ))}
                      </motion.div>
                    )}
                    {state === 'processing' && (
                      <motion.div key="process" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}>
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}>
                          <Sparkles className="h-10 w-10 text-white/90" strokeWidth={1.5} />
                        </motion.div>
                      </motion.div>
                    )}
                    {state === 'speaking' && (
                      <motion.div key="speak" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} className="flex items-center gap-[2px]">
                        {[...Array(9)].map((_, i) => (
                          <div key={i} className="jarvis-speak-bar"
                            style={{ '--wave-h': `${6 + Math.abs(4 - i) * 5 + Math.random() * 6}px`, animationDelay: `${i * 0.06}s`, height: '4px' } as React.CSSProperties} />
                        ))}
                      </motion.div>
                    )}
                    {state === 'confirming' && (
                      <motion.div key="confirm" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}>
                        <ActionIcon className="h-10 w-10 text-white/90" strokeWidth={1.5} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            </div>

            {/* ============================================================
                TEXT + CONFIRMATION SECTION
                ============================================================ */}
            <div className="mt-10 w-full max-w-lg px-6 text-center min-h-[160px]">
              <AnimatePresence mode="wait">

                {state === 'idle' && !answer && !error && !pendingAction && (
                  <motion.div key="idle-text" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                    <p className="text-[16px] text-white/70">Toque no orbe e faça sua pergunta</p>
                    <p className="text-[13px] text-white/30 mt-2">Pergunte sobre leads, faturamento ou peça ações como follow-ups e ligações</p>
                  </motion.div>
                )}

                {state === 'listening' && (
                  <motion.div key="listen-text" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                    {transcript ? (
                      <p className="text-[18px] text-white/90 leading-relaxed jarvis-serviçor">{transcript}</p>
                    ) : (
                      <p className="text-[16px] text-blue-300/70 italic">Ouvindo...</p>
                    )}
                  </motion.div>
                )}

                {state === 'processing' && (
                  <motion.div key="process-text" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                    <p className="text-[14px] text-white/40 mb-2">{transcript}</p>
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 text-blue-300/80 animate-spin" />
                      <p className="text-[15px] text-blue-300/80">{confirming ? 'Executando ação...' : 'Consultando dados...'}</p>
                    </div>
                  </motion.div>
                )}

                {state === 'speaking' && answer && !pendingAction && (
                  <motion.div key="speak-text" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                    <p className="text-[18px] text-white/90 leading-relaxed jarvis-text-reveal">{answer}</p>
                  </motion.div>
                )}

                {/* CONFIRMING — Action confirmation card */}
                {state === 'confirming' && pendingAction && (
                  <motion.div
                    key="confirm-card"
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  >
                    <div className={cn(
                      'rounded-2xl border bg-gradient-to-br p-5 mb-6 text-left',
                      actionColor || 'from-blue-500/20 to-blue-500/5 border-blue-500/20'
                    )}>
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/10">
                          <ActionIcon className={cn('h-5 w-5', actionTextColor)} strokeWidth={1.75} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[15px] font-semibold text-white/90 mb-1">
                            {pendingAction.description}
                          </p>
                          <div className="space-y-1 mt-2">
                            {pendingAction.details.lead_name && (
                              <p className="text-[13px] text-white/50">
                                Lead: <span className="text-white/70">{pendingAction.details.lead_name}</span>
                              </p>
                            )}
                            {pendingAction.details.message && (
                              <p className="text-[12px] text-white/40 mt-1 line-clamp-2">
                                Mensagem: &ldquo;{pendingAction.details.message}&rdquo;
                              </p>
                            )}
                            {pendingAction.details.course && (
                              <p className="text-[13px] text-white/50">
                                Serviço: <span className="text-white/70">{pendingAction.details.course}</span>
                              </p>
                            )}
                            {pendingAction.details.target_stage && (
                              <p className="text-[13px] text-white/50">
                                Destino: <span className="text-white/70">{pendingAction.details.target_stage}</span>
                              </p>
                            )}
                            {pendingAction.details.date && (
                              <p className="text-[13px] text-white/50">
                                Data: <span className="text-white/70">{pendingAction.details.date} às {pendingAction.details.time}</span>
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* Channel selector */}
                      {pendingAction.details.available_channels?.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-white/10">
                          <p className="text-[12px] text-white/40 mb-2">Enviar pelo canal:</p>
                          <div className="flex flex-wrap gap-2">
                            {pendingAction.details.available_channels.map((ch: any) => (
                              <button
                                key={ch.id}
                                onClick={() => setSelectedChannel(ch)}
                                className={cn(
                                  'px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all',
                                  selectedChannel?.id === ch.id
                                    ? 'bg-white/20 text-white border border-white/30'
                                    : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10'
                                )}
                              >
                                {ch.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-center gap-3">
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={handleConfirm}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[14px] font-medium transition-colors border border-emerald-500/20"
                      >
                        <Check className="h-4 w-4" strokeWidth={2} />
                        Confirmar
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={handleCancel}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-white/5 hover:bg-white/10 text-white/50 text-[14px] font-medium transition-colors"
                      >
                        <Ban className="h-4 w-4" strokeWidth={2} />
                        Cancelar
                      </motion.button>
                    </div>
                  </motion.div>
                )}

                {state === 'idle' && answer && !pendingAction && (
                  <motion.div key="done-text" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                    <p className="text-[14px] text-white/30 mb-2">{transcript}</p>
                    <p className="text-[18px] text-white/90 leading-relaxed">{answer}</p>
                    <div className="flex items-center justify-center gap-4 mt-6">
                      <button onClick={startListening}
                        className="px-4 py-2 rounded-full bg-primary/20 hover:bg-primary/30 text-[13px] text-blue-300 transition-colors border border-primary/20">
                        Nova pergunta
                      </button>
                      <button onClick={closeOverlay}
                        className="px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 text-[13px] text-white/50 transition-colors">
                        Fechar
                      </button>
                    </div>
                  </motion.div>
                )}

                {error && (
                  <motion.div key="error-text" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                    <p className="text-[15px] text-red-400">{error}</p>
                    <button onClick={startListening}
                      className="mt-4 px-4 py-2 rounded-full bg-primary/20 hover:bg-primary/30 text-[13px] text-blue-300 transition-colors border border-primary/20">
                      Tentar novamente
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
              className="absolute bottom-6 text-[11px] text-white/20">
              Pressione ESC para fechar
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}