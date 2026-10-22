/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  updateDoc, 
  deleteDoc,
  doc, 
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';
import { db, auth } from './firebase';
import { format } from 'date-fns';
import { Toaster, toast } from 'sonner';
import { 
  Wrench, 
  User as UserIcon, 
  ClipboardList, 
  Send, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  LogOut,
  Smartphone,
  HardDrive,
  MessageSquare,
  ChevronRight,
  Settings,
  Bell,
  Eye,
  EyeOff,
  KeyRound,
  FileDown,
  Trash2,
  QrCode,
  Copy,
  Check,
  ExternalLink,
  MessageCircle,
  Download,
  Share2,
  BellRing,
  Volume2,
  VolumeX,
  Building2,
  Search,
  X,
  Filter,
  Pencil,
  Save
} from 'lucide-react';
import QRCode from 'qrcode';
import { cn } from './lib/utils';
import { generateTicketPDF, safeFormatDate } from './lib/pdfGenerator';

// Types
interface Ticket {
  id: string;
  clientName: string;
  companyName?: string;
  whatsapp: string;
  equipment: string;
  problem: string;
  createdAt?: any;
  status: 'pending' | 'in-progress' | 'completed' | 'needs-next-step' | 'completed-no-test';
  technicianId?: string;
  startTime?: any;
  endTime?: any;
  solution?: string;
  recommendation?: string;
}

// In-memory 16-bit PCM WAV Chime Generator (Guarantees zero-network audio playback in all browsers)
function createAlarmWavDataUri(): string {
  const sampleRate = 22050;
  const numChannels = 1;
  const bitsPerSample = 16;
  
  // High attention pattern: 3 urgent acoustic chimes
  const pattern = [
    { freq: 880, dur: 0.12 },
    { freq: 0, dur: 0.04 },
    { freq: 1174.66, dur: 0.12 },
    { freq: 0, dur: 0.04 },
    { freq: 1760, dur: 0.25 },
    { freq: 0, dur: 0.12 },
    { freq: 880, dur: 0.12 },
    { freq: 0, dur: 0.04 },
    { freq: 1174.66, dur: 0.12 },
    { freq: 0, dur: 0.04 },
    { freq: 1760, dur: 0.35 }
  ];

  let totalDuration = 0;
  for (const p of pattern) totalDuration += p.dur;
  const totalSamples = Math.floor(sampleRate * totalDuration);
  const dataByteLength = totalSamples * numChannels * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  // RIFF header
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + dataByteLength, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"
  // fmt chunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // Linear PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
  view.setUint16(32, numChannels * (bitsPerSample / 8), true);
  view.setUint16(34, bitsPerSample, true);
  // data chunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, dataByteLength, true);

  // Synthesize PCM samples with envelope
  let sampleIndex = 0;
  for (const seg of pattern) {
    const segSamples = Math.floor(sampleRate * seg.dur);
    for (let i = 0; i < segSamples; i++) {
      let sample = 0;
      if (seg.freq > 0) {
        const t = i / sampleRate;
        const envelope = Math.sin((Math.PI * i) / segSamples);
        sample = Math.sin(2 * Math.PI * seg.freq * t) * envelope * 0.85;
      }
      const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
      view.setInt16(44 + sampleIndex * 2, intSample, true);
      sampleIndex++;
    }
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return 'data:audio/wav;base64,' + btoa(binary);
}

export default function App() {
  const [view, setView] = useState<'client' | 'technician'>('client');
  const [clientSubView, setClientSubView] = useState<'form' | 'history'>('form');
  const [user, setUser] = useState<User | null>(null);
  const [isTechLoggedIn, setIsTechLoggedIn] = useState(() => {
    try {
      return localStorage.getItem('dutec_tech_auth') === 'true';
    } catch {
      return false;
    }
  });
  const [techPassword, setTechPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  // Client Form State
  const [clientName, setClientName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [equipment, setEquipment] = useState('');
  const [problem, setProblem] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [submittedTicketInfo, setSubmittedTicketInfo] = useState<{
    protocol: string;
    clientName: string;
    companyName?: string;
    equipment: string;
    whatsapp: string;
    problem: string;
  } | null>(null);
  const [sendWhatsAppOnSubmit, setSendWhatsAppOnSubmit] = useState(true);

  // Gera a mensagem formatada para envio do chamado no WhatsApp
  const getWhatsAppTicketMessage = (info: {
    protocol: string;
    clientName: string;
    companyName?: string;
    equipment: string;
    whatsapp: string;
    problem: string;
  }) => {
    const link = getClientShareUrl();
    const cleanPhone = info.whatsapp.replace(/\D/g, '');
    const companyText = info.companyName ? `🏢 *Empresa:* ${info.companyName}\n` : '';
    return (
      `🛠️ *NOVO CHAMADO DE MANUTENÇÃO - DUNEX-TI*\n\n` +
      `📋 *Protocolo:* #${info.protocol}\n` +
      `👤 *Cliente:* ${info.clientName}\n` +
      companyText +
      `📱 *WhatsApp:* ${info.whatsapp}\n` +
      `💻 *Equipamento:* ${info.equipment}\n` +
      `⚠️ *Problema:* ${info.problem}\n\n` +
      `📍 *Acompanhe o status online:* ${link}&acao=historico&tel=${encodeURIComponent(cleanPhone)}`
    );
  };

  const handleSendToWhatsApp = (info: {
    protocol: string;
    clientName: string;
    companyName?: string;
    equipment: string;
    whatsapp: string;
    problem: string;
  }) => {
    const message = getWhatsAppTicketMessage(info);
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Client Sharing & QR Code State
  const [showShareModal, setShowShareModal] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Client History State
  const [searchWhatsapp, setSearchWhatsapp] = useState('');
  const [clientHistory, setClientHistory] = useState<Ticket[]>([]);
  const [searchingHistory, setSearchingHistory] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Technician Edit & Search State
  const [techCompanyFilter, setTechCompanyFilter] = useState('');
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [startingTicket, setStartingTicket] = useState<Ticket | null>(null);
  const [ticketToDelete, setTicketToDelete] = useState<Ticket | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [customStartDate, setCustomStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [customStartTime, setCustomStartTime] = useState(format(new Date(), 'HH:mm'));
  const [solution, setSolution] = useState('');
  const [recommendation, setRecommendation] = useState('');
  const [status, setStatus] = useState<Ticket['status']>('completed');

  // Full Ticket Editing State (Technician)
  const [ticketToEdit, setTicketToEdit] = useState<Ticket | null>(null);
  const [editClientName, setEditClientName] = useState('');
  const [editCompanyName, setEditCompanyName] = useState('');
  const [editWhatsapp, setEditWhatsapp] = useState('');
  const [editEquipment, setEditEquipment] = useState('');
  const [editProblem, setEditProblem] = useState('');
  const [editStatus, setEditStatus] = useState<Ticket['status']>('pending');
  const [editSolution, setEditSolution] = useState('');
  const [editRecommendation, setEditRecommendation] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Unique company names from tickets that have a company name defined
  const uniqueCompanies = React.useMemo(() => {
    const set = new Set<string>();
    tickets.forEach(t => {
      const name = (t.companyName || '').trim();
      if (name) set.add(name);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [tickets]);

  // Filtered tickets based on company name
  const filteredTickets = React.useMemo(() => {
    const filter = techCompanyFilter.trim().toLowerCase();
    if (!filter) return tickets;
    return tickets.filter(t => (t.companyName || '').toLowerCase().includes(filter));
  }, [tickets, techCompanyFilter]);

  // Notification & Alarm Sound State
  const initialTicketsLoaded = React.useRef(false);
  const knownTicketIdsRef = React.useRef<Set<string>>(new Set());
  const [alarmSoundEnabled, setAlarmSoundEnabled] = useState(() => {
    try {
      return localStorage.getItem('dunex_alarm_sound') !== 'false';
    } catch {
      return true;
    }
  });
  const [activeAlarmTicket, setActiveAlarmTicket] = useState<Ticket | null>(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  // Synchronize live refs to avoid stale closures in Firestore onSnapshot
  const viewRef = React.useRef(view);
  const isTechLoggedInRef = React.useRef(isTechLoggedIn);
  const userRef = React.useRef(user);
  const alarmSoundEnabledRef = React.useRef(alarmSoundEnabled);
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const lastAlarmTicketIdRef = React.useRef<string>('');
  const lastAlarmTimeRef = React.useRef<number>(0);

  // Pre-generate in-memory alarm chime
  const alarmWavDataUri = React.useMemo(() => {
    if (typeof window === 'undefined') return '';
    try {
      return createAlarmWavDataUri();
    } catch {
      return '';
    }
  }, []);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    isTechLoggedInRef.current = isTechLoggedIn;
  }, [isTechLoggedIn]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    alarmSoundEnabledRef.current = alarmSoundEnabled;
    try {
      localStorage.setItem('dunex_alarm_sound', String(alarmSoundEnabled));
    } catch {}
  }, [alarmSoundEnabled]);

  // Unlock Audio on first user interaction anywhere in the page
  useEffect(() => {
    const handleUserInteraction = () => {
      try {
        const ctx = getAudioContext();
        if (ctx && ctx.state === 'suspended') {
          ctx.resume().then(() => setAudioUnlocked(true)).catch(() => {});
        } else if (ctx && ctx.state === 'running') {
          setAudioUnlocked(true);
        }
      } catch {}
    };

    window.addEventListener('click', handleUserInteraction, { passive: true });
    window.addEventListener('touchstart', handleUserInteraction, { passive: true });
    window.addEventListener('keydown', handleUserInteraction, { passive: true });

    return () => {
      window.removeEventListener('click', handleUserInteraction);
      window.removeEventListener('touchstart', handleUserInteraction);
      window.removeEventListener('keydown', handleUserInteraction);
    };
  }, []);

  // Audio Context & Synthesized Multi-Tone Alarm Generator
  const getAudioContext = () => {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  };

  const playAlarmSound = () => {
    // 1. Play in-memory synthesized WAV chime via HTML5 Audio (works seamlessly in all browsers)
    try {
      if (alarmWavDataUri) {
        const audio = new Audio(alarmWavDataUri);
        audio.volume = 1.0;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {});
        }
      }
    } catch (e) {
      console.warn("HTML5 audio playback error:", e);
    }

    // 2. Play multi-tone oscillator chimes via Web Audio API
    try {
      const ctx = getAudioContext();
      if (ctx) {
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        const scheduleAlarmBurst = (offsetSec: number) => {
          const now = ctx.currentTime + offsetSec;

          // Note 1: Urgent Alert Pulse (987.77 Hz - B5)
          const osc1 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          osc1.type = 'triangle';
          osc1.frequency.setValueAtTime(987.77, now);
          gain1.gain.setValueAtTime(0.001, now);
          gain1.gain.exponentialRampToValueAtTime(0.35, now + 0.02);
          gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
          osc1.connect(gain1);
          gain1.connect(ctx.destination);
          osc1.start(now);
          osc1.stop(now + 0.18);

          // Note 2: Higher Attention Tone (1318.51 Hz - E6)
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(1318.51, now + 0.14);
          gain2.gain.setValueAtTime(0.001, now + 0.14);
          gain2.gain.exponentialRampToValueAtTime(0.45, now + 0.17);
          gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.start(now + 0.14);
          osc2.stop(now + 0.38);

          // Note 3: Resonant Alarm Bell (1760 Hz - A6)
          const osc3 = ctx.createOscillator();
          const gain3 = ctx.createGain();
          osc3.type = 'triangle';
          osc3.frequency.setValueAtTime(1760, now + 0.28);
          gain3.gain.setValueAtTime(0.001, now + 0.28);
          gain3.gain.exponentialRampToValueAtTime(0.5, now + 0.31);
          gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
          osc3.connect(gain3);
          gain3.connect(ctx.destination);
          osc3.start(now + 0.28);
          osc3.stop(now + 0.78);
        };

        scheduleAlarmBurst(0);
        scheduleAlarmBurst(0.65);
        scheduleAlarmBurst(1.30);
      }
    } catch (err) {
      console.warn("Web Audio alarm generation error:", err);
    }
  };

  const handleTestAlarm = () => {
    // Unlock browser audio context on user gesture
    getAudioContext();
    setAudioUnlocked(true);
    playAlarmSound();
    toast.success('🔊 Alarme Sonoro Testado com Sucesso!', {
      description: 'O som de alerta de chamado tocou nos alto-falantes.',
      duration: 4000
    });
  };

  // Immediate handler for newly incoming ticket alarm
  const handleIncomingTicketAlarm = (ticket: Ticket) => {
    const now = Date.now();
    // Avoid double-ringing for the same ticket within 4 seconds
    if (lastAlarmTicketIdRef.current === ticket.id && now - lastAlarmTimeRef.current < 4000) {
      return;
    }
    lastAlarmTicketIdRef.current = ticket.id;
    lastAlarmTimeRef.current = now;

    if (alarmSoundEnabledRef.current) {
      playAlarmSound();
    }
    setActiveAlarmTicket(ticket);
    toast.error(`🚨 NOVO CHAMADO: ${ticket.clientName}`, {
      description: `Equipamento: ${ticket.equipment} - ${ticket.problem?.slice(0, 70)}...`,
      duration: 15000,
      icon: <BellRing className="text-red-600 animate-pulse" size={20} />,
      action: {
        label: 'Ver no Painel',
        onClick: () => {
          setActiveAlarmTicket(null);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
    });
  };

  // Blinking tab title when an active alarm is pending
  useEffect(() => {
    if (!activeAlarmTicket) {
      document.title = 'DUNEX-TI - Sistema de Chamados de Manutenção';
      return;
    }
    let isOriginal = false;
    const interval = setInterval(() => {
      document.title = isOriginal 
        ? 'DUNEX-TI - Sistema de Chamados de Manutenção'
        : `🚨 NOVO CHAMADO: ${activeAlarmTicket.clientName}!`;
      isOriginal = !isOriginal;
    }, 900);
    return () => {
      clearInterval(interval);
      document.title = 'DUNEX-TI - Sistema de Chamados de Manutenção';
    };
  }, [activeAlarmTicket]);

  useEffect(() => {
    // 1. Cross-tab BroadcastChannel listener (para disparo instantâneo quando aba do cliente enviar chamado)
    let bc: BroadcastChannel | null = null;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        bc = new BroadcastChannel('dunex_tickets_realtime');
        bc.onmessage = (event) => {
          if (event.data && (isTechLoggedInRef.current || viewRef.current === 'technician')) {
            handleIncomingTicketAlarm({
              id: event.data.id,
              clientName: event.data.clientName,
              equipment: event.data.equipment,
              problem: event.data.problem,
              status: 'pending',
              whatsapp: event.data.whatsapp || ''
            });
          }
        };
      } catch (err) {
        console.warn('BroadcastChannel error:', err);
      }
    }

    // 2. Storage event listener (fallback instantâneo entre abas do mesmo navegador)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'dunex_ticket_realtime_event' && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          if (isTechLoggedInRef.current || viewRef.current === 'technician') {
            handleIncomingTicketAlarm({
              id: data.id,
              clientName: data.clientName,
              equipment: data.equipment,
              problem: data.problem,
              status: 'pending',
              whatsapp: data.whatsapp || ''
            });
          }
        } catch {}
      }
    };
    window.addEventListener('storage', handleStorageChange);

    // 3. Auth listener
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setIsTechLoggedIn(true);
        try {
          localStorage.setItem('dutec_tech_auth', 'true');
        } catch {}
      }
      setLoading(false);
    });

    // 4. Firestore real-time onSnapshot listener (para qualquer dispositivo online)
    const q = query(collection(db, 'tickets'), orderBy('createdAt', 'desc'));
    const unsubscribeTickets = onSnapshot(q, (snapshot) => {
      const ticketsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Ticket[];
      
      // Real-time alarm notification on ticket addition
      if (initialTicketsLoaded.current) {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const newId = change.doc.id;
            const isNewDoc = !knownTicketIdsRef.current.has(newId);
            knownTicketIdsRef.current.add(newId);

            if (isNewDoc) {
              const newTicket = { id: newId, ...change.doc.data() } as Ticket;
              if (newTicket.status === 'pending') {
                if (isTechLoggedInRef.current || viewRef.current === 'technician') {
                  handleIncomingTicketAlarm(newTicket);
                }
              }
            }
          }
        });
      } else {
        // Inicializa conjunto com os IDs existentes para não apitar nos chamados antigos já carregados
        snapshot.docs.forEach(doc => knownTicketIdsRef.current.add(doc.id));
        initialTicketsLoaded.current = true;
      }

      setTickets(ticketsData);
    });

    return () => {
      if (bc) bc.close();
      window.removeEventListener('storage', handleStorageChange);
      unsubscribeAuth();
      unsubscribeTickets();
    };
  }, []);

  // Detect URL parameters (?modo=cliente or ?modo=tecnico)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const modo = params.get('modo') || params.get('tab') || params.get('area');
      if (modo === 'tecnico' || modo === 'admin') {
        setView('technician');
      } else if (modo === 'cliente') {
        setView('client');
      }
      
      const acao = params.get('acao') || params.get('sub');
      if (acao === 'historico' || acao === 'consultar') {
        setClientSubView('history');
      } else if (acao === 'novo' || acao === 'abrir') {
        setClientSubView('form');
      }

      const tel = params.get('tel') || params.get('whatsapp');
      if (tel) {
        setWhatsapp(tel);
        setSearchWhatsapp(tel);
      }
    } catch {}
  }, []);

  const getClientShareUrl = () => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}?modo=cliente`;
    }
    return 'https://ais-pre-c3feqekoa3gvxbgrdmy76b-272434718853.us-east1.run.app?modo=cliente';
  };

  const formatPhoneNumber = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits.length ? `(${digits}` : '';
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  };

  useEffect(() => {
    if (showShareModal) {
      const url = getClientShareUrl();
      QRCode.toDataURL(url, {
        width: 320,
        margin: 2,
        color: {
          dark: '#0056b3',
          light: '#ffffff'
        }
      }).then(dataUrl => {
        setQrCodeDataUrl(dataUrl);
      }).catch(err => {
        console.error('Error generating QR code:', err);
      });
    }
  }, [showShareModal]);

  const handleCopyLink = async () => {
    const url = getClientShareUrl();
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      toast.success('Link copiado! Cole no WhatsApp ou envie para os clientes.');
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopiedLink(true);
      toast.success('Link copiado!');
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const handleDownloadQRCode = () => {
    if (!qrCodeDataUrl) return;
    const link = document.createElement('a');
    link.href = qrCodeDataUrl;
    link.download = 'dunex-ti-qrcode-chamados.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Download do QR Code concluído!');
  };

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      setIsTechLoggedIn(true);
      try {
        localStorage.setItem('dutec_tech_auth', 'true');
      } catch {}
      toast.success('Login com Google realizado com sucesso!');
    } catch (error) {
      console.error("Login failed:", error);
      toast.error('Não foi possível conectar com o Google.');
    }
  };

  const handleLogout = () => {
    signOut(auth);
    setIsTechLoggedIn(false);
    setTechCompanyFilter('');
    try {
      localStorage.removeItem('dutec_tech_auth');
    } catch {}
    toast.info('Sessão encerrada com sucesso.');
  };

  const handleTechLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPassword = techPassword.trim();
    if (cleanPassword === 'mardu2020' || cleanPassword.toLowerCase() === 'mardu2020') {
      setIsTechLoggedIn(true);
      try {
        localStorage.setItem('dutec_tech_auth', 'true');
      } catch {}
      setPasswordError(false);
      setTechPassword('');
      toast.success('Acesso autorizado! Bem-vindo ao Painel do Técnico.');
    } else {
      setPasswordError(true);
      toast.error('Senha incorreta! Digite mardu2020');
    }
  };

  const handleSearchHistory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchWhatsapp) return;
    setSearchingHistory(true);
    setHasSearched(true);
    try {
      // Filter the local tickets array or fetch from DB
      // Since we have onSnapshot for all tickets, we can just filter locally
      // but for a real app we'd query specifically.
      const filtered = tickets.filter(t => t.whatsapp.replace(/\D/g, '').includes(searchWhatsapp.replace(/\D/g, '')));
      setClientHistory(filtered);
    } catch (error) {
      console.error("Error searching history:", error);
    } finally {
      setSearchingHistory(false);
    }
  };

  const handleSubmitTicket = async (e: React.FormEvent, options?: { sendToWhatsApp?: boolean }) => {
    e.preventDefault();
    setSubmitting(true);
    const shouldSendToWhatsApp = options?.sendToWhatsApp !== undefined 
      ? options.sendToWhatsApp 
      : sendWhatsAppOnSubmit;

    const currentClientName = clientName.trim();
    const currentCompanyName = companyName.trim();
    const currentWhatsapp = whatsapp.trim();
    const currentEquipment = equipment.trim();
    const currentProblem = problem.trim();

    try {
      const docRef = await addDoc(collection(db, 'tickets'), {
        clientName: currentClientName,
        companyName: currentCompanyName,
        whatsapp: currentWhatsapp,
        equipment: currentEquipment,
        problem: currentProblem,
        createdAt: serverTimestamp(),
        status: 'pending'
      });
      const shortId = docRef.id.slice(0, 6).toUpperCase();

      // Dispara sinal imediato em tempo real para a aba do técnico (mesmo computador ou abas vizinhas)
      try {
        const ticketAlertPayload = {
          id: docRef.id,
          shortId,
          clientName: currentClientName,
          companyName: currentCompanyName,
          equipment: currentEquipment,
          problem: currentProblem,
          status: 'pending',
          whatsapp: currentWhatsapp,
          timestamp: Date.now()
        };
        if (typeof window !== 'undefined') {
          if ('BroadcastChannel' in window) {
            const channel = new BroadcastChannel('dunex_tickets_realtime');
            channel.postMessage(ticketAlertPayload);
            channel.close();
          }
          localStorage.setItem('dunex_ticket_realtime_event', JSON.stringify(ticketAlertPayload));
        }
      } catch (broadcastErr) {
        console.warn('Realtime broadcast error:', broadcastErr);
      }

      const ticketInfo = {
        protocol: shortId,
        clientName: currentClientName,
        companyName: currentCompanyName,
        equipment: currentEquipment,
        whatsapp: currentWhatsapp,
        problem: currentProblem
      };

      setSubmittedTicketInfo(ticketInfo);
      setSuccessMessage(`Chamado #${shortId} registrado com sucesso!`);
      setClientName('');
      setCompanyName('');
      setWhatsapp('');
      setEquipment('');
      setProblem('');
      toast.success(`Chamado #${shortId} enviado com sucesso!`);

      // Se a opção de abrir o WhatsApp estiver ativada
      if (shouldSendToWhatsApp) {
        handleSendToWhatsApp(ticketInfo);
      }
    } catch (error) {
      console.error("Error adding ticket:", error);
      toast.error('Erro ao enviar chamado. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartMaintenance = async (ticketId: string) => {
    try {
      let startDateTime = new Date(`${customStartDate}T${customStartTime}`);
      if (isNaN(startDateTime.getTime())) {
        startDateTime = new Date();
      }
      await updateDoc(doc(db, 'tickets', ticketId), {
        status: 'in-progress',
        startTime: Timestamp.fromDate(startDateTime),
        technicianId: user?.uid || auth.currentUser?.uid || 'tech-mardu2020'
      });
      setStartingTicket(null);
      toast.success('Manutenção iniciada com sucesso!');
    } catch (error) {
      console.error("Error starting maintenance:", error);
      toast.error('Erro ao iniciar manutenção. Verifique sua conexão.');
    }
  };

  const handleExportPDF = (ticket: Ticket) => {
    try {
      generateTicketPDF(ticket);
      toast.success(`Relatório em PDF da O.S. #${(ticket.id || '').slice(0, 8).toUpperCase()} gerado!`);
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast.error("Não foi possível gerar o PDF do chamado.");
    }
  };

  const handleDeleteTicket = async (ticket: Ticket) => {
    try {
      setIsDeleting(true);
      await deleteDoc(doc(db, 'tickets', ticket.id));
      toast.success(`Chamado de ${ticket.clientName} excluído com sucesso!`);
      setTicketToDelete(null);
    } catch (error: any) {
      console.error("Erro ao excluir chamado:", error);
      toast.error('Erro ao excluir chamado: ' + (error?.message || 'Tente novamente'));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenEditTicket = (ticket: Ticket) => {
    setTicketToEdit(ticket);
    setEditClientName(ticket.clientName || '');
    setEditCompanyName(ticket.companyName || '');
    setEditWhatsapp(ticket.whatsapp || '');
    setEditEquipment(ticket.equipment || '');
    setEditProblem(ticket.problem || '');
    setEditStatus(ticket.status || 'pending');
    setEditSolution(ticket.solution || '');
    setEditRecommendation(ticket.recommendation || '');
  };

  const handleSaveTicketEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketToEdit) return;

    if (!editClientName.trim()) {
      toast.error('O nome do cliente não pode ficar em branco.');
      return;
    }
    if (!editWhatsapp.trim()) {
      toast.error('O WhatsApp do cliente não pode ficar em branco.');
      return;
    }
    if (!editEquipment.trim()) {
      toast.error('O equipamento não pode ficar em branco.');
      return;
    }
    if (!editProblem.trim()) {
      toast.error('O problema relatado não pode ficar em branco.');
      return;
    }

    try {
      setIsSavingEdit(true);
      const updateData: any = {
        clientName: editClientName.trim(),
        companyName: editCompanyName.trim(),
        whatsapp: editWhatsapp.trim(),
        equipment: editEquipment.trim(),
        problem: editProblem.trim(),
        status: editStatus,
        solution: editSolution.trim(),
        recommendation: editRecommendation.trim()
      };

      // Se o status for alterado para concluído e ainda não tiver endTime, define término
      if (
        (editStatus === 'completed' || editStatus === 'completed-no-test') &&
        !ticketToEdit.endTime
      ) {
        updateData.endTime = serverTimestamp();
      }

      // Se o status for alterado para em andamento e ainda não tiver startTime, define início
      if (editStatus === 'in-progress' && !ticketToEdit.startTime) {
        updateData.startTime = serverTimestamp();
        if (!ticketToEdit.technicianId) {
          updateData.technicianId = user?.uid || auth.currentUser?.uid || 'tech-mardu2020';
        }
      }

      await updateDoc(doc(db, 'tickets', ticketToEdit.id), updateData);
      toast.success('Chamado atualizado com sucesso!');
      setTicketToEdit(null);
    } catch (err: any) {
      console.error('Erro ao atualizar chamado:', err);
      toast.error('Erro ao salvar alterações do chamado.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleCompleteMaintenance = async (e?: React.FormEvent, shouldDownloadPdf = false) => {
    if (e) e.preventDefault();
    if (!editingTicket) return;

    if (!solution.trim()) {
      toast.error('Por favor, informe a solução do problema antes de concluir.');
      return;
    }

    const ticketToPrint: Ticket = {
      ...editingTicket,
      status,
      solution,
      recommendation,
      endTime: new Date()
    };

    try {
      await updateDoc(doc(db, 'tickets', editingTicket.id), {
        status,
        solution,
        recommendation,
        endTime: serverTimestamp()
      });
      
      const finishedTicket = { ...ticketToPrint };
      setEditingTicket(null);
      setSolution('');
      setRecommendation('');

      if (shouldDownloadPdf) {
        try {
          generateTicketPDF(finishedTicket);
          toast.success('Manutenção finalizada e Relatório em PDF gerado!');
        } catch (pdfErr) {
          console.error("Erro ao gerar PDF:", pdfErr);
          toast.success('Manutenção concluída no sistema! Clique no botão Exportar PDF no chamado.');
        }
      } else {
        toast.success('Manutenção finalizada com sucesso!', {
          action: {
            label: 'Baixar PDF',
            onClick: () => handleExportPDF(finishedTicket)
          }
        });
      }
    } catch (error) {
      console.error("Error completing maintenance:", error);
      toast.error('Erro ao finalizar manutenção.');
    }
  };

  const getStatusBadge = (status: Ticket['status']) => {
    switch (status) {
      case 'pending':
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800 flex items-center gap-1"><Clock size={12} /> Pendente</span>;
      case 'in-progress':
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 flex items-center gap-1"><Wrench size={12} /> Em Manutenção</span>;
      case 'completed':
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 flex items-center gap-1"><CheckCircle2 size={12} /> Concluída</span>;
      case 'needs-next-step':
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800 flex items-center gap-1"><AlertCircle size={12} /> Nova Etapa</span>;
      case 'completed-no-test':
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800 flex items-center gap-1"><CheckCircle2 size={12} /> Concluída (S/ Teste)</span>;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#212529] font-sans">
      <Toaster position="top-right" richColors closeButton />
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-xs">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#0056b3] rounded-xl flex items-center justify-center text-white shadow-sm">
              <Settings size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[#0056b3] leading-none">DUNEX-TI</h1>
              <p className="text-[10px] text-gray-400 font-semibold tracking-wider uppercase mt-1">Suporte & Manutenção Online</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowShareModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50/70 hover:bg-blue-100/80 text-[#0056b3] text-xs font-bold transition-all cursor-pointer shadow-xs"
              title="Copiar link ou ver QR Code para abertura de chamados"
            >
              <QrCode size={15} />
              <span className="hidden sm:inline">Link / QR Code</span>
            </button>

            <div className="flex bg-gray-100 p-1 rounded-lg">
              <button 
                onClick={() => setView('client')}
                className={cn(
                  "px-4 py-1.5 text-sm font-medium rounded-md transition-all cursor-pointer",
                  view === 'client' ? "bg-white text-[#0056b3] shadow-sm font-bold" : "text-gray-500 hover:text-gray-700"
                )}
              >
                Cliente
              </button>
              <button 
                onClick={() => setView('technician')}
                className={cn(
                  "px-4 py-1.5 text-sm font-medium rounded-md transition-all cursor-pointer",
                  view === 'technician' ? "bg-white text-[#0056b3] shadow-sm font-bold" : "text-gray-500 hover:text-gray-700"
                )}
              >
                Técnico
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {view === 'client' ? (
          <div className="max-w-xl mx-auto">
            <div className="flex justify-center mb-8">
              <div className="inline-flex bg-gray-100 p-1 rounded-xl">
                <button 
                  onClick={() => setClientSubView('form')}
                  className={cn(
                    "px-6 py-2 text-sm font-bold rounded-lg transition-all",
                    clientSubView === 'form' ? "bg-white text-[#0056b3] shadow-sm" : "text-gray-500"
                  )}
                >
                  Novo Chamado
                </button>
                <button 
                  onClick={() => setClientSubView('history')}
                  className={cn(
                    "px-6 py-2 text-sm font-bold rounded-lg transition-all",
                    clientSubView === 'history' ? "bg-white text-[#0056b3] shadow-sm" : "text-gray-500"
                  )}
                >
                  Meus Chamados
                </button>
              </div>
            </div>

            {clientSubView === 'form' ? (
              submittedTicketInfo ? (
                <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 p-8 text-center animate-in fade-in zoom-in-95 duration-200">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                    <CheckCircle2 size={36} />
                  </div>
                  <span className="inline-block px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full border border-emerald-200 mb-2">
                    Protocolo #{submittedTicketInfo.protocol}
                  </span>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Chamado Aberto com Sucesso!</h2>
                  <p className="text-gray-600 text-sm max-w-md mx-auto mb-6">
                    Olá, <strong>{submittedTicketInfo.clientName}</strong>! Sua solicitação para o equipamento <strong>{submittedTicketInfo.equipment}</strong> já está registrada no sistema da <strong>DUNEX-TI</strong>.
                  </p>

                  <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 mb-4 text-left space-y-2 text-sm">
                    {submittedTicketInfo.companyName && (
                      <div className="flex justify-between items-center text-gray-600">
                        <span>Empresa:</span>
                        <span className="font-semibold text-gray-900">{submittedTicketInfo.companyName}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center text-gray-600">
                      <span>Equipamento:</span>
                      <span className="font-semibold text-gray-900">{submittedTicketInfo.equipment}</span>
                    </div>
                    <div className="flex justify-between items-center text-gray-600">
                      <span>WhatsApp informado:</span>
                      <span className="font-semibold text-gray-900">{submittedTicketInfo.whatsapp}</span>
                    </div>
                    <div className="flex justify-between items-center text-gray-600">
                      <span>Problema:</span>
                      <span className="font-semibold text-gray-900 line-clamp-1">{submittedTicketInfo.problem}</span>
                    </div>
                    <div className="flex justify-between items-center text-gray-600 pt-1 border-t border-gray-200/60">
                      <span>Status inicial:</span>
                      <span className="font-semibold text-amber-600 flex items-center gap-1">
                        <Clock size={13} /> Pendente de atendimento
                      </span>
                    </div>
                  </div>

                  {/* Botão de Enviar no WhatsApp com destaque */}
                  <button
                    type="button"
                    onClick={() => handleSendToWhatsApp(submittedTicketInfo)}
                    className="w-full bg-[#25D366] hover:bg-[#1EBE5D] text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-[#25D366]/25 transition-all flex items-center justify-center gap-2 cursor-pointer text-sm mb-3"
                  >
                    <MessageCircle size={19} />
                    Enviar Chamado Aberto para o WhatsApp
                  </button>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={() => {
                        setSearchWhatsapp(submittedTicketInfo.whatsapp);
                        setClientSubView('history');
                        const filtered = tickets.filter(t => t.whatsapp.replace(/\D/g, '').includes(submittedTicketInfo.whatsapp.replace(/\D/g, '')));
                        setClientHistory(filtered);
                        setHasSearched(true);
                      }}
                      className="flex-1 bg-[#0056b3] hover:bg-[#004494] text-white font-bold py-2.5 px-4 rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                    >
                      <ClipboardList size={16} /> Acompanhar Status
                    </button>

                    <button
                      onClick={() => setSubmittedTicketInfo(null)}
                      className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-sm transition-all cursor-pointer"
                    >
                      Novo Chamado
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
                  <div className="mb-8 text-center">
                    <h2 className="text-2xl font-bold mb-2">Solicitar Manutenção</h2>
                    <p className="text-gray-500">Preencha os dados abaixo para abrir um chamado.</p>
                  </div>

                  {successMessage && (
                    <div className="mb-6 p-4 bg-green-50 text-green-700 rounded-xl border border-green-100 flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
                      <CheckCircle2 className="shrink-0" />
                      <p className="text-sm font-medium">{successMessage}</p>
                    </div>
                  )}

                  <form onSubmit={handleSubmitTicket} className="space-y-5">
                    <div>
                      <label className="block text-sm font-semibold mb-1.5 text-gray-700">Nome do Cliente</label>
                      <div className="relative">
                        <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input 
                          required
                          type="text" 
                          value={clientName}
                          onChange={(e) => setClientName(e.target.value)}
                          placeholder="Seu nome completo"
                          className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0056b3]/20 focus:border-[#0056b3] outline-none transition-all"
                        />
                      </div>
                    </div>

                    {/* Novo Campo: Nome da Empresa */}
                    <div>
                      <label className="block text-sm font-semibold mb-1.5 text-gray-700">
                        Nome da Empresa <span className="text-gray-400 font-normal text-xs">(opcional)</span>
                      </label>
                      <div className="relative">
                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input 
                          type="text" 
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                          placeholder="Nome da sua empresa ou razão social"
                          className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0056b3]/20 focus:border-[#0056b3] outline-none transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold mb-1.5 text-gray-700">WhatsApp</label>
                      <div className="relative">
                        <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input 
                          required
                          type="tel" 
                          value={whatsapp}
                          onChange={(e) => setWhatsapp(formatPhoneNumber(e.target.value))}
                          placeholder="(00) 00000-0000"
                          maxLength={15}
                          className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0056b3]/20 focus:border-[#0056b3] outline-none transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold mb-1.5 text-gray-700">Equipamento</label>
                      <div className="relative">
                        <HardDrive className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input 
                          required
                          type="text" 
                          value={equipment}
                          onChange={(e) => setEquipment(e.target.value)}
                          placeholder="Nome ou número do equipamento"
                          className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0056b3]/20 focus:border-[#0056b3] outline-none transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold mb-1.5 text-gray-700">Problema Apresentado</label>
                      <div className="relative">
                        <MessageSquare className="absolute left-3 top-3 text-gray-400" size={18} />
                        <textarea 
                          required
                          rows={4}
                          value={problem}
                          onChange={(e) => setProblem(e.target.value)}
                          placeholder="Descreva o defeito detalhadamente..."
                          className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0056b3]/20 focus:border-[#0056b3] outline-none transition-all resize-none"
                        />
                      </div>
                    </div>

                    {/* Opção de Enviar Chamado para o WhatsApp */}
                    <label className="flex items-center gap-2.5 p-3 rounded-xl bg-green-50/70 border border-green-200/80 cursor-pointer hover:bg-green-50 transition-colors select-none">
                      <input 
                        type="checkbox"
                        checked={sendWhatsAppOnSubmit}
                        onChange={(e) => setSendWhatsAppOnSubmit(e.target.checked)}
                        className="w-4 h-4 text-green-600 rounded focus:ring-green-500 accent-green-600 cursor-pointer"
                      />
                      <div className="flex items-center gap-2 text-xs font-semibold text-green-900">
                        <MessageCircle size={16} className="text-green-600 shrink-0" />
                        <span>Abrir WhatsApp com o chamado preenchido após enviar</span>
                      </div>
                    </label>

                    <div className="space-y-2.5 pt-1">
                      <button 
                        disabled={submitting}
                        type="submit"
                        className="w-full bg-[#25D366] hover:bg-[#1EBE5D] text-white font-bold py-3.5 rounded-xl shadow-lg shadow-[#25D366]/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70 cursor-pointer text-base"
                      >
                        {submitting ? "Enviando Chamado..." : (
                          <>
                            <MessageCircle size={20} />
                            Enviar Chamado e Abrir no WhatsApp
                          </>
                        )}
                      </button>

                      <button 
                        disabled={submitting}
                        type="button"
                        onClick={(e) => handleSubmitTicket(e, { sendToWhatsApp: false })}
                        className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-70 cursor-pointer text-xs"
                      >
                        <Send size={14} />
                        Enviar Apenas pelo Sistema (Sem WhatsApp)
                      </button>
                    </div>
                  </form>
                </div>
              )
            ) : (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
                  <div className="mb-6 text-center">
                    <h2 className="text-2xl font-bold mb-2">Consultar Histórico</h2>
                    <p className="text-gray-500">Digite seu WhatsApp para ver seus chamados.</p>
                  </div>

                  <form onSubmit={handleSearchHistory} className="flex gap-2">
                    <div className="relative flex-1">
                      <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input 
                        required
                        type="tel" 
                        value={searchWhatsapp}
                        onChange={(e) => setSearchWhatsapp(e.target.value)}
                        placeholder="(00) 00000-0000"
                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0056b3]/20 focus:border-[#0056b3] outline-none transition-all"
                      />
                    </div>
                    <button 
                      type="submit"
                      className="bg-[#0056b3] text-white px-6 py-2.5 rounded-xl font-bold hover:bg-[#004494] transition-all"
                    >
                      Buscar
                    </button>
                  </form>
                </div>

                <div className="space-y-4">
                  {hasSearched && clientHistory.length === 0 && !searchingHistory && (
                    <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-300">
                      <p className="text-gray-500">Nenhum chamado encontrado para este número.</p>
                    </div>
                  )}

                  {clientHistory.map(ticket => (
                    <div key={ticket.id} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <HardDrive size={16} className="text-[#0056b3]" />
                          <h3 className="font-bold">{ticket.equipment}</h3>
                        </div>
                        {getStatusBadge(ticket.status)}
                      </div>
                      
                      <div className="space-y-3">
                        {ticket.companyName && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-600 font-medium">
                            <Building2 size={13} className="text-[#0056b3]" />
                            <span>Empresa: <strong>{ticket.companyName}</strong></span>
                          </div>
                        )}
                        <div>
                          <span className="text-xs font-bold uppercase text-gray-400">Problema Relatado</span>
                          <p className="text-sm text-gray-600">{ticket.problem}</p>
                        </div>
                        
                        {(ticket.status === 'completed' || ticket.status === 'completed-no-test') && ticket.solution && (
                          <div className="p-3 bg-green-50 rounded-lg border border-green-100">
                            <span className="text-xs font-bold uppercase text-green-600">Solução Aplicada</span>
                            <p className="text-sm text-green-800 mt-1">{ticket.solution}</p>
                            {ticket.recommendation && (
                              <p className="text-xs text-green-700 mt-2 italic">Recomendação: {ticket.recommendation}</p>
                            )}
                            <div className="mt-3 pt-2 border-t border-green-200/60">
                              <button
                                onClick={() => handleExportPDF(ticket)}
                                className="px-3 py-1.5 bg-white hover:bg-green-100 border border-green-200 text-green-800 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                              >
                                <FileDown size={14} className="text-green-700" />
                                Baixar Relatório Técnico (PDF)
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-3 border-t border-gray-50 text-[10px] text-gray-400 uppercase font-bold tracking-widest">
                          <span>Aberto em: {safeFormatDate(ticket.createdAt, 'dd/MM/yyyy HH:mm', '-')}</span>
                          {ticket.endTime && <span>Concluído em: {safeFormatDate(ticket.endTime, 'dd/MM/yyyy HH:mm', '-')}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {!isTechLoggedIn ? (
              <div className="max-w-md mx-auto text-center py-20">
                <div className="w-16 h-16 bg-[#0056b3]/10 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Settings size={32} className="text-[#0056b3]" />
                </div>
                <h2 className="text-2xl font-bold mb-4">Acesso ao Técnico</h2>
                <p className="text-gray-500 mb-8">Digite a senha de acesso para gerenciar os chamados.</p>
                
                <form onSubmit={handleTechLogin} className="space-y-4">
                  <div className="relative">
                    <input 
                      type={showPassword ? "text" : "password"} 
                      value={techPassword}
                      onChange={(e) => {
                        setTechPassword(e.target.value);
                        if (passwordError) setPasswordError(false);
                      }}
                      placeholder="Senha de acesso"
                      autoFocus
                      autoComplete="current-password"
                      className={cn(
                        "w-full pl-4 pr-12 py-3 bg-white border rounded-xl outline-none transition-all text-center text-lg tracking-widest font-mono",
                        passwordError ? "border-red-500 ring-2 ring-red-500/10" : "border-gray-200 focus:ring-2 focus:ring-[#0056b3]/20 focus:border-[#0056b3]"
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer p-1"
                      title={showPassword ? "Ocultar senha" : "Ver senha"}
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                  {passwordError && (
                    <p className="text-sm text-red-500 font-medium">Senha incorreta. Verifique se digitou: mardu2020</p>
                  )}
                  <button 
                    type="submit"
                    className="w-full bg-[#0056b3] hover:bg-[#004494] text-white font-bold py-3 rounded-xl shadow-lg shadow-[#0056b3]/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <KeyRound size={18} />
                    Entrar no Painel
                  </button>
                </form>

                <div className="mt-8 pt-8 border-t border-gray-100">
                  <p className="text-xs text-gray-400 uppercase tracking-widest font-bold mb-4">Ou use sua conta Google</p>
                  <button 
                    onClick={handleLogin}
                    className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold py-2.5 px-6 rounded-xl shadow-sm transition-all flex items-center justify-center gap-3 mx-auto"
                  >
                    <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
                    Entrar com Google
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-2xl font-bold">Painel do Técnico</h2>
                    <p className="text-gray-500 text-sm">Gerenciamento de chamados em tempo real</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Alarme Sonoro Toggle */}
                    <button
                      type="button"
                      onClick={() => {
                        const nextState = !alarmSoundEnabled;
                        setAlarmSoundEnabled(nextState);
                        if (nextState) {
                          toast.success('Alarme sonoro ativado! O sistema emitirá um som ao receber novos chamados.');
                          playAlarmSound();
                        } else {
                          toast.info('Alarme sonoro silenciado.');
                        }
                      }}
                      className={cn(
                        "px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs border",
                        alarmSoundEnabled 
                          ? "bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300" 
                          : "bg-gray-100 hover:bg-gray-200 text-gray-500 border-gray-200"
                      )}
                      title={alarmSoundEnabled ? "Alarme sonoro ativado (clique para silenciar)" : "Alarme sonoro silenciado (clique para ativar)"}
                    >
                      {alarmSoundEnabled ? (
                        <>
                          <BellRing size={15} className="text-amber-600 animate-pulse" />
                          <span>Alarme: Ativo</span>
                        </>
                      ) : (
                        <>
                          <VolumeX size={15} className="text-gray-400" />
                          <span>Alarme: Mudo</span>
                        </>
                      )}
                    </button>

                    {/* Testar Som do Alarme */}
                    <button
                      type="button"
                      onClick={handleTestAlarm}
                      className="bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                      title="Testar o alarme sonoro agora para verificar o volume"
                    >
                      <Volume2 size={15} className="text-[#0056b3]" />
                      <span>Testar Som</span>
                    </button>

                    <button 
                      onClick={() => setShowShareModal(true)}
                      className="bg-blue-50 hover:bg-blue-100 text-[#0056b3] border border-blue-200 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                      title="Copiar link ou ver QR Code de abertura de chamados para clientes"
                    >
                      <QrCode size={15} />
                      <span>Link / QR Code</span>
                    </button>
                    <button 
                      onClick={handleLogout}
                      className="text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-200 px-3 py-2 rounded-xl flex items-center gap-1.5 text-xs font-medium transition-all cursor-pointer"
                    >
                      <LogOut size={15} /> Sair
                    </button>
                  </div>
                </div>

                {/* Dica para Habilitação do Áudio no Navegador */}
                {!audioUnlocked && (
                  <div 
                    onClick={handleTestAlarm}
                    className="mb-4 p-3 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl flex items-center justify-between text-amber-900 text-xs font-semibold cursor-pointer transition-all shadow-xs"
                    title="Clique para autorizar a reprodução sonora no navegador"
                  >
                    <div className="flex items-center gap-2">
                      <Volume2 size={16} className="text-amber-600 animate-pulse" />
                      <span>Para garantir que o alarme toque sem bloqueio do navegador, clique aqui para autorizar o som.</span>
                    </div>
                    <span className="underline font-bold text-[#0056b3] shrink-0 ml-2">Autorizar e Testar Som</span>
                  </div>
                )}

                {/* Banner de Alarme Ativo com Notificação em Destaque */}
                {activeAlarmTicket && (
                  <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 text-white shadow-xl shadow-red-500/20 animate-in fade-in slide-in-from-top-3 border border-red-300">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                          <BellRing size={26} className="text-white animate-pulse" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-white text-red-700 text-[10px] font-black uppercase rounded-full tracking-wider shadow-xs">
                              🚨 Novo Chamado Recebido!
                            </span>
                            <span className="text-xs text-red-100 font-mono">
                              #{activeAlarmTicket.id.slice(0, 6).toUpperCase()}
                            </span>
                          </div>
                          <h3 className="text-base sm:text-lg font-bold mt-1 text-white">
                            {activeAlarmTicket.clientName}
                            {activeAlarmTicket.companyName && (
                              <span className="text-sm font-semibold opacity-90 ml-1.5">({activeAlarmTicket.companyName})</span>
                            )}
                            {" "}— <span className="font-normal opacity-95">{activeAlarmTicket.equipment}</span>
                          </h3>
                          <p className="text-xs text-red-100 line-clamp-1 italic mt-0.5">
                            "{activeAlarmTicket.problem}"
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        <button
                          type="button"
                          onClick={() => playAlarmSound()}
                          className="px-3 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                          title="Tocar o alarme sonoro novamente"
                        >
                          <Volume2 size={15} /> Tocar Som
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveAlarmTicket(null)}
                          className="px-4 py-2 bg-white text-red-700 hover:bg-red-50 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
                        >
                          Silenciar Alarme
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Campo de Busca e Filtro por Empresa */}
                <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 shadow-xs mb-6">
                  <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                    <div className="relative flex-1">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input
                        type="text"
                        value={techCompanyFilter}
                        onChange={(e) => setTechCompanyFilter(e.target.value)}
                        placeholder="Buscar por nome da empresa (ex: Padaria, Mercado, ACME...)"
                        className="w-full pl-10 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#0056b3]/20 focus:border-[#0056b3] outline-none text-sm transition-all"
                      />
                      {techCompanyFilter && (
                        <button
                          type="button"
                          onClick={() => setTechCompanyFilter('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 cursor-pointer transition-colors"
                          title="Limpar busca"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-gray-500 shrink-0 self-end sm:self-center font-medium">
                      <Filter size={14} className="text-[#0056b3]" />
                      <span>
                        {techCompanyFilter ? (
                          <>
                            Exibindo <strong className="text-gray-900 font-bold">{filteredTickets.length}</strong> de {tickets.length} chamados
                          </>
                        ) : (
                          <>
                            Total: <strong className="text-gray-900 font-bold">{tickets.length}</strong> chamados
                          </>
                        )}
                      </span>
                      {techCompanyFilter && (
                        <button
                          type="button"
                          onClick={() => setTechCompanyFilter('')}
                          className="ml-1 text-xs text-[#0056b3] hover:underline font-bold cursor-pointer"
                        >
                          (Limpar)
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Atalhos rápidos para as empresas cadastradas */}
                  {uniqueCompanies.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-3.5 pt-3.5 border-t border-gray-100">
                      <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mr-1 flex items-center gap-1">
                        Empresas:
                      </span>
                      <button
                        type="button"
                        onClick={() => setTechCompanyFilter('')}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer border",
                          !techCompanyFilter 
                            ? "bg-[#0056b3] text-white border-[#0056b3] shadow-xs" 
                            : "bg-gray-50 hover:bg-gray-100 text-gray-600 border-gray-200"
                        )}
                      >
                        Todas ({tickets.length})
                      </button>
                      {uniqueCompanies.map((comp) => {
                        const count = tickets.filter(t => (t.companyName || '').trim().toLowerCase() === comp.toLowerCase()).length;
                        const isSelected = techCompanyFilter.trim().toLowerCase() === comp.toLowerCase();
                        return (
                          <button
                            key={comp}
                            type="button"
                            onClick={() => setTechCompanyFilter(isSelected ? '' : comp)}
                            className={cn(
                              "px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer border flex items-center gap-1.5",
                              isSelected 
                                ? "bg-[#0056b3] text-white border-[#0056b3] shadow-xs font-bold" 
                                : "bg-slate-50 hover:bg-blue-50/50 text-slate-700 hover:text-[#0056b3] border-slate-200"
                            )}
                            title={`Filtrar chamados da empresa ${comp}`}
                          >
                            <Building2 size={12} className={isSelected ? "text-white" : "text-slate-500"} />
                            <span>{comp}</span>
                            <span className={cn(
                              "text-[10px] px-1.5 py-0.2 rounded-full font-bold",
                              isSelected ? "bg-white/20 text-white" : "bg-gray-200 text-gray-700"
                            )}>
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="grid gap-4">
                  {tickets.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-300">
                      <ClipboardList size={48} className="text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">Nenhum chamado encontrado.</p>
                    </div>
                  ) : filteredTickets.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-300 p-6">
                      <Building2 size={42} className="text-gray-300 mx-auto mb-3" />
                      <h4 className="font-bold text-gray-800 text-base mb-1">Nenhum chamado encontrado</h4>
                      <p className="text-gray-500 text-sm max-w-sm mx-auto mb-4">
                        Não localizamos chamados cadastrados para a empresa <strong className="text-gray-900 font-semibold">"{techCompanyFilter}"</strong>.
                      </p>
                      <button
                        type="button"
                        onClick={() => setTechCompanyFilter('')}
                        className="px-4 py-2 bg-[#0056b3] text-white rounded-xl text-xs font-bold hover:bg-[#004494] transition-all cursor-pointer shadow-xs inline-flex items-center gap-1.5"
                      >
                        <X size={14} /> Limpar Filtro de Busca
                      </button>
                    </div>
                  ) : (
                    filteredTickets.map(ticket => (
                      <div key={ticket.id} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-all">
                        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                          <div>
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <h3 className="font-bold text-lg">{ticket.clientName}</h3>
                              {ticket.companyName && (
                                <button
                                  type="button"
                                  onClick={() => setTechCompanyFilter(ticket.companyName || '')}
                                  className="text-xs bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-[#0056b3] px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1 border border-slate-200 hover:border-blue-200 transition-all cursor-pointer"
                                  title={`Filtrar por ${ticket.companyName}`}
                                >
                                  <Building2 size={12} className="text-slate-500" />
                                  {ticket.companyName}
                                </button>
                              )}
                              {getStatusBadge(ticket.status)}
                            </div>
                            <p className="text-sm text-gray-500 flex items-center gap-1">
                              <Clock size={14} /> 
                              {safeFormatDate(ticket.createdAt, 'dd/MM/yyyy HH:mm', 'Processando...')}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {ticket.status === 'pending' && (
                              <button 
                                onClick={() => {
                                  setStartingTicket(ticket);
                                  setCustomStartDate(format(new Date(), 'yyyy-MM-dd'));
                                  setCustomStartTime(format(new Date(), 'HH:mm'));
                                }}
                                className="bg-[#0056b3] text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#004494] transition-all flex items-center gap-2 cursor-pointer shadow-sm"
                              >
                                <Wrench size={16} /> Iniciar Manutenção
                              </button>
                            )}
                            {ticket.status === 'in-progress' && (
                              <button 
                                onClick={() => {
                                  setEditingTicket(ticket);
                                  setSolution(ticket.solution || '');
                                  setRecommendation(ticket.recommendation || '');
                                  setStatus('completed');
                                }}
                                className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-700 transition-all flex items-center gap-2 cursor-pointer shadow-sm"
                              >
                                <CheckCircle2 size={16} /> Finalizar Manutenção
                              </button>
                            )}
                            {(ticket.status === 'completed' || ticket.status === 'completed-no-test' || ticket.status === 'needs-next-step' || ticket.solution) && (
                              <button 
                                onClick={() => handleExportPDF(ticket)}
                                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 px-3.5 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs"
                                title="Exportar Relatório Completo em PDF"
                              >
                                <FileDown size={16} className="text-emerald-700" /> Exportar PDF
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleOpenEditTicket(ticket)}
                              className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 hover:border-amber-300 px-3 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                              title="Editar e alterar dados do chamado"
                            >
                              <Pencil size={15} className="text-amber-700" /> Editar
                            </button>
                            <button
                              onClick={() => setTicketToDelete(ticket)}
                              className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 hover:border-red-300 px-3 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                              title="Excluir este chamado"
                            >
                              <Trash2 size={16} /> Excluir
                            </button>
                          </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
                          <div className="space-y-3">
                            <div>
                              <span className="text-xs font-bold uppercase tracking-wider text-gray-400">WhatsApp</span>
                              <div className="flex items-center gap-2 mt-0.5">
                                <p className="text-sm font-medium flex items-center gap-1.5">
                                  <Smartphone size={14} className="text-[#0056b3]" />
                                  {ticket.whatsapp}
                                </p>
                                <a
                                  href={`https://wa.me/55${ticket.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá ${ticket.clientName}, sou da DUNEX-TI sobre o chamado do equipamento: ${ticket.equipment}.`)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 px-2 py-0.5 rounded font-semibold transition-all cursor-pointer"
                                  title="Iniciar conversa no WhatsApp com o cliente"
                                >
                                  <MessageCircle size={12} className="text-green-600" /> WhatsApp
                                </a>
                              </div>
                            </div>
                            <div>
                              <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Equipamento</span>
                              <p className="text-sm font-medium flex items-center gap-2">
                                <HardDrive size={14} className="text-[#0056b3]" />
                                {ticket.equipment}
                              </p>
                            </div>
                          </div>
                          <div>
                            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Problema</span>
                            <p className="text-sm text-gray-600 mt-1 leading-relaxed">{ticket.problem}</p>
                          </div>
                        </div>

                        {(ticket.status === 'completed' || ticket.status === 'needs-next-step' || ticket.status === 'completed-no-test') && (
                          <div className="mt-6 pt-6 border-t border-gray-100 bg-gray-50 -mx-6 -mb-6 p-6 rounded-b-xl space-y-4">
                            <div className="grid md:grid-cols-2 gap-4">
                              <div>
                                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Início</span>
                                <p className="text-sm font-medium">{safeFormatDate(ticket.startTime, 'HH:mm', '-')}</p>
                              </div>
                              <div>
                                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Término</span>
                                <p className="text-sm font-medium">{safeFormatDate(ticket.endTime, 'HH:mm', '-')}</p>
                              </div>
                            </div>
                            <div>
                              <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Solução</span>
                              <p className="text-sm text-gray-700">{ticket.solution}</p>
                            </div>
                            {ticket.recommendation && (
                              <div>
                                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Recomendação</span>
                                <p className="text-sm text-gray-700 italic">"{ticket.recommendation}"</p>
                              </div>
                            )}
                            <div className="pt-3 border-t border-gray-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                              <span className="text-xs text-gray-500 font-medium">
                                Relatório técnico com informações completas e termo de entrega
                              </span>
                              <button
                                onClick={() => handleExportPDF(ticket)}
                                className="bg-[#0056b3] hover:bg-[#004494] text-white px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm"
                              >
                                <FileDown size={14} />
                                Baixar Relatório em PDF (.pdf)
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </main>

      {/* Modal Iniciar Manutenção */}
      {startingTicket && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-xl font-bold">Iniciar Manutenção</h3>
              <button onClick={() => setStartingTicket(null)} className="text-gray-400 hover:text-gray-600">
                <AlertCircle size={24} />
              </button>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              handleStartMaintenance(startingTicket.id);
            }} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-semibold mb-1.5">Data de Início</label>
                <input 
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0056b3]/20 focus:border-[#0056b3] outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1.5">Hora de Início</label>
                <input 
                  type="time"
                  value={customStartTime}
                  onChange={(e) => setCustomStartTime(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0056b3]/20 focus:border-[#0056b3] outline-none transition-all"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => setStartingTicket(null)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-50 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-2.5 bg-[#0056b3] text-white rounded-xl font-bold hover:bg-[#004494] shadow-lg shadow-[#0056b3]/20 transition-all"
                >
                  Confirmar Início
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Finalizar Manutenção */}
      {editingTicket && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-xl font-bold">Finalizar Manutenção</h3>
              <button onClick={() => setEditingTicket(null)} className="text-gray-400 hover:text-gray-600">
                <AlertCircle size={24} />
              </button>
            </div>
            <form onSubmit={(e) => handleCompleteMaintenance(e, true)} className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Hora Início</label>
                  <p className="text-sm font-medium bg-gray-50 p-2 rounded-lg border border-gray-100">
                    {safeFormatDate(editingTicket.startTime, 'HH:mm', '-')}
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Hora Término</label>
                  <p className="text-sm font-medium bg-gray-50 p-2 rounded-lg border border-gray-100">
                    {format(new Date(), 'HH:mm')}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5">Solução do Problema</label>
                <textarea 
                  required
                  rows={3}
                  value={solution}
                  onChange={(e) => setSolution(e.target.value)}
                  placeholder="O que foi feito para resolver?"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0056b3]/20 focus:border-[#0056b3] outline-none transition-all resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5">Recomendação</label>
                <textarea 
                  rows={2}
                  value={recommendation}
                  onChange={(e) => setRecommendation(e.target.value)}
                  placeholder="Dicas ou observações para o cliente..."
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0056b3]/20 focus:border-[#0056b3] outline-none transition-all resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5">Status Final</label>
                <select 
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#0056b3]/20 focus:border-[#0056b3] outline-none transition-all"
                >
                  <option value="completed">Manutenção Concluída</option>
                  <option value="needs-next-step">Necessário Nova Etapa</option>
                  <option value="completed-no-test">Concluído (Sem Necessidade de Teste)</option>
                </select>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => setEditingTicket(null)}
                  className="px-4 py-2.5 border border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-50 transition-all cursor-pointer text-center text-sm"
                >
                  Cancelar
                </button>
                <button 
                  type="button"
                  onClick={(e) => handleCompleteMaintenance(e, false)}
                  className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition-all cursor-pointer text-center text-sm"
                >
                  Salvar sem Baixar
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-2.5 bg-[#0056b3] text-white rounded-xl font-bold hover:bg-[#004494] shadow-lg shadow-[#0056b3]/20 transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
                >
                  <FileDown size={18} />
                  Salvar e Exportar PDF
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Chamado Completo (Área do Técnico) */}
      {ticketToEdit && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8 overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100 flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-amber-500/10 via-white to-transparent shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shadow-xs">
                  <Pencil size={20} />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
                    Editar Chamado
                    <span className="text-xs font-mono font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md">
                      #{ticketToEdit.id.slice(0, 8).toUpperCase()}
                    </span>
                  </h3>
                  <p className="text-xs text-gray-500">Altere qualquer informação do chamado técnico</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setTicketToEdit(null)} 
                className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                title="Fechar"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveTicketEdit} className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
              {/* Row 1: Cliente e Empresa */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5 flex items-center gap-1.5">
                    <UserIcon size={14} className="text-[#0056b3]" /> Nome do Cliente *
                  </label>
                  <input
                    type="text"
                    required
                    value={editClientName}
                    onChange={(e) => setEditClientName(e.target.value)}
                    placeholder="Nome completo do cliente"
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#0056b3]/20 focus:border-[#0056b3] outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5 flex items-center gap-1.5">
                    <Building2 size={14} className="text-[#0056b3]" /> Nome da Empresa (Opcional)
                  </label>
                  <input
                    type="text"
                    value={editCompanyName}
                    onChange={(e) => setEditCompanyName(e.target.value)}
                    placeholder="Ex: Padaria Estrela, Clínica Sorriso"
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#0056b3]/20 focus:border-[#0056b3] outline-none transition-all"
                  />
                </div>
              </div>

              {/* Row 2: WhatsApp e Equipamento */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5 flex items-center gap-1.5">
                    <Smartphone size={14} className="text-[#0056b3]" /> WhatsApp *
                  </label>
                  <input
                    type="text"
                    required
                    value={editWhatsapp}
                    onChange={(e) => setEditWhatsapp(e.target.value)}
                    placeholder="(XX) XXXXX-XXXX"
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#0056b3]/20 focus:border-[#0056b3] outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5 flex items-center gap-1.5">
                    <HardDrive size={14} className="text-[#0056b3]" /> Equipamento *
                  </label>
                  <input
                    type="text"
                    required
                    value={editEquipment}
                    onChange={(e) => setEditEquipment(e.target.value)}
                    placeholder="Ex: Notebook Dell Inspiron, PC Gamer"
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#0056b3]/20 focus:border-[#0056b3] outline-none transition-all"
                  />
                </div>
              </div>

              {/* Status do Chamado */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5 flex items-center gap-1.5">
                  <Clock size={14} className="text-[#0056b3]" /> Status do Chamado *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label className={cn(
                    "flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all",
                    editStatus === 'pending'
                      ? "bg-yellow-50 border-yellow-300 text-yellow-900 shadow-xs"
                      : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                  )}>
                    <input
                      type="radio"
                      name="editStatus"
                      value="pending"
                      checked={editStatus === 'pending'}
                      onChange={() => setEditStatus('pending')}
                      className="text-yellow-600"
                    />
                    <span>Pendente</span>
                  </label>

                  <label className={cn(
                    "flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all",
                    editStatus === 'in-progress'
                      ? "bg-blue-50 border-blue-300 text-blue-900 shadow-xs"
                      : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                  )}>
                    <input
                      type="radio"
                      name="editStatus"
                      value="in-progress"
                      checked={editStatus === 'in-progress'}
                      onChange={() => setEditStatus('in-progress')}
                      className="text-blue-600"
                    />
                    <span>Em Manutenção</span>
                  </label>

                  <label className={cn(
                    "flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all",
                    editStatus === 'completed'
                      ? "bg-green-50 border-green-300 text-green-900 shadow-xs"
                      : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                  )}>
                    <input
                      type="radio"
                      name="editStatus"
                      value="completed"
                      checked={editStatus === 'completed'}
                      onChange={() => setEditStatus('completed')}
                      className="text-green-600"
                    />
                    <span>Concluída</span>
                  </label>

                  <label className={cn(
                    "flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all",
                    editStatus === 'needs-next-step'
                      ? "bg-orange-50 border-orange-300 text-orange-900 shadow-xs"
                      : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                  )}>
                    <input
                      type="radio"
                      name="editStatus"
                      value="needs-next-step"
                      checked={editStatus === 'needs-next-step'}
                      onChange={() => setEditStatus('needs-next-step')}
                      className="text-orange-600"
                    />
                    <span>Nova Etapa</span>
                  </label>

                  <label className={cn(
                    "flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all sm:col-span-2",
                    editStatus === 'completed-no-test'
                      ? "bg-purple-50 border-purple-300 text-purple-900 shadow-xs"
                      : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                  )}>
                    <input
                      type="radio"
                      name="editStatus"
                      value="completed-no-test"
                      checked={editStatus === 'completed-no-test'}
                      onChange={() => setEditStatus('completed-no-test')}
                      className="text-purple-600"
                    />
                    <span>Concluída (Sem Necessidade de Teste)</span>
                  </label>
                </div>
              </div>

              {/* Descrição do Problema */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5 flex items-center gap-1.5">
                  <MessageSquare size={14} className="text-[#0056b3]" /> Problema Relatado *
                </label>
                <textarea
                  required
                  rows={3}
                  value={editProblem}
                  onChange={(e) => setEditProblem(e.target.value)}
                  placeholder="Descrição do problema informado pelo cliente..."
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#0056b3]/20 focus:border-[#0056b3] outline-none transition-all resize-none"
                />
              </div>

              {/* Solução Aplicada */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5 flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-green-600" /> Solução Técnica Aplicada
                </label>
                <textarea
                  rows={3}
                  value={editSolution}
                  onChange={(e) => setEditSolution(e.target.value)}
                  placeholder="Descreva o procedimento técnico realizado para solucionar..."
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#0056b3]/20 focus:border-[#0056b3] outline-none transition-all resize-none"
                />
              </div>

              {/* Recomendação ao Cliente */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5 flex items-center gap-1.5">
                  <AlertCircle size={14} className="text-amber-600" /> Recomendações Técnicas
                </label>
                <textarea
                  rows={2}
                  value={editRecommendation}
                  onChange={(e) => setEditRecommendation(e.target.value)}
                  placeholder="Dicas de uso, cuidados preventivos ou recomendações..."
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#0056b3]/20 focus:border-[#0056b3] outline-none transition-all resize-none"
                />
              </div>

              {/* Modal Footer Buttons */}
              <div className="pt-3 border-t border-gray-100 flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setTicketToEdit(null)}
                  disabled={isSavingEdit}
                  className="w-full sm:w-auto px-4 py-2.5 text-sm font-semibold text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="w-full sm:w-auto px-6 py-2.5 bg-[#0056b3] hover:bg-[#004494] text-white rounded-xl text-sm font-bold transition-all shadow-md shadow-[#0056b3]/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSavingEdit ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Salvando Alterações...
                    </>
                  ) : (
                    <>
                      <Save size={16} /> Salvar Alterações
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Compartilhar Link / QR Code para Clientes */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 border border-gray-100">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#0056b3]/10 flex items-center justify-center text-[#0056b3]">
                  <QrCode size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Acesso Online para Clientes</h3>
                  <p className="text-xs text-gray-500">Envie o link ou imprima o QR Code para abertura de chamados</p>
                </div>
              </div>
              <button
                onClick={() => setShowShareModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* QR Code preview */}
              <div className="flex flex-col items-center justify-center p-4 bg-gray-50 rounded-xl border border-gray-200">
                {qrCodeDataUrl ? (
                  <img 
                    src={qrCodeDataUrl} 
                    alt="QR Code DUNEX-TI Abertura de Chamados" 
                    className="w-48 h-48 rounded-lg shadow-sm bg-white p-2 border border-gray-200"
                  />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center text-gray-400 text-sm">
                    Gerando QR Code...
                  </div>
                )}
                <span className="text-xs text-gray-500 mt-2 font-medium">Aponte a câmera do celular para abrir um chamado</span>
              </div>

              {/* URL Input with copy button */}
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">
                  Link Direto de Abertura de Chamado
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={getClientShareUrl()}
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-mono text-gray-700 select-all outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="px-4 py-2 bg-[#0056b3] hover:bg-[#004494] text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm shrink-0"
                  >
                    {copiedLink ? (
                      <>
                        <Check size={14} /> Copiado!
                      </>
                    ) : (
                      <>
                        <Copy size={14} /> Copiar Link
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Olá! Para abrir um chamado de suporte ou manutenção na DUNEX-TI, acesse nosso link direto: ${getClientShareUrl()}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm text-center"
                >
                  <MessageCircle size={15} /> Compartilhar no WhatsApp
                </a>

                <button
                  type="button"
                  onClick={handleDownloadQRCode}
                  className="px-3.5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border border-gray-200 text-center"
                >
                  <Download size={15} /> Baixar QR Code (PNG)
                </button>
              </div>

              {/* Informative instructions */}
              <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-3 text-xs text-blue-900 space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-[#0056b3]" /> Como seus clientes utilizam:
                </p>
                <ul className="list-disc list-inside text-blue-800 pl-1 space-y-0.5">
                  <li>O cliente <strong>não precisa de login nem senha</strong>.</li>
                  <li>Funciona diretamente em qualquer celular ou navegador de computador.</li>
                  <li>Assim que o cliente enviar, o chamado apita instantaneamente no seu Painel de Técnico!</li>
                </ul>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmar Exclusão de Chamado */}
      {ticketToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 border border-red-100">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Excluir Chamado</h3>
                <p className="text-xs text-red-600 font-medium">Esta ação não poderá ser desfeita</p>
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-100 rounded-xl p-3.5 mb-5 space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-gray-500 font-medium">Cliente:</span>
                <span className="font-semibold text-gray-800">{ticketToDelete.clientName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500 font-medium">Equipamento:</span>
                <span className="text-gray-800 font-medium">{ticketToDelete.equipment}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500 font-medium">Status:</span>
                <div>{getStatusBadge(ticketToDelete.status)}</div>
              </div>
              <div className="pt-2 border-t border-gray-200/60">
                <span className="text-gray-500 block text-xs uppercase font-bold tracking-wider mb-1">Problema:</span>
                <p className="text-gray-700 text-xs line-clamp-2 italic">"{ticketToDelete.problem}"</p>
              </div>
            </div>

            <p className="text-sm text-gray-600 mb-6">
              Deseja realmente remover o chamado de <strong className="text-gray-900">{ticketToDelete.clientName}</strong> do sistema? O registro será apagado permanentemente.
            </p>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setTicketToDelete(null)}
                className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => handleDeleteTicket(ticketToDelete)}
                className="px-5 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-md shadow-red-600/20 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Excluindo...
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    Confirmar Exclusão
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="max-w-5xl mx-auto px-4 py-12 border-t border-gray-200 mt-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2 opacity-50">
            <Settings size={20} />
            <span className="text-sm font-bold tracking-tight">DUNEX-TI</span>
          </div>
          <p className="text-sm text-gray-400">© 2026 DUNEX-TI. Todos os direitos reservados.</p>
          <div className="flex items-center gap-4">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Sistema Online</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
