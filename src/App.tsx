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
  Globe,
  Laptop,
  Bookmark,
  Sparkles,
  ShieldCheck,
  HelpCircle,
  Info
} from 'lucide-react';
import QRCode from 'qrcode';
import { cn } from './lib/utils';
import { generateTicketPDF, safeFormatDate } from './lib/pdfGenerator';

// Types
interface Ticket {
  id: string;
  clientName: string;
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
  const [whatsapp, setWhatsapp] = useState('');
  const [equipment, setEquipment] = useState('');
  const [problem, setProblem] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [submittedTicketInfo, setSubmittedTicketInfo] = useState<{
    protocol: string;
    clientName: string;
    equipment: string;
    whatsapp: string;
  } | null>(null);

  // Client Sharing & QR Code State
  const [showShareModal, setShowShareModal] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Online Access & Direct Internet Deployment State
  const [showOnlineAccessModal, setShowOnlineAccessModal] = useState(false);
  const [copiedTechLink, setCopiedTechLink] = useState(false);
  const [showCustomDomainHelp, setShowCustomDomainHelp] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  // Client History State
  const [searchWhatsapp, setSearchWhatsapp] = useState('');
  const [clientHistory, setClientHistory] = useState<Ticket[]>([]);
  const [searchingHistory, setSearchingHistory] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Technician Edit State
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [startingTicket, setStartingTicket] = useState<Ticket | null>(null);
  const [ticketToDelete, setTicketToDelete] = useState<Ticket | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [customStartDate, setCustomStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [customStartTime, setCustomStartTime] = useState(format(new Date(), 'HH:mm'));
  const [solution, setSolution] = useState('');
  const [recommendation, setRecommendation] = useState('');
  const [status, setStatus] = useState<Ticket['status']>('completed');

  // Notification State
  const initialTicketsLoaded = React.useRef(false);
  const processedTicketIds = React.useRef<Set<string>>(new Set());

  useEffect(() => {
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

    const q = query(collection(db, 'tickets'), orderBy('createdAt', 'desc'));
    const unsubscribeTickets = onSnapshot(q, (snapshot) => {
      const ticketsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Ticket[];
      
      // Notification logic
      if (initialTicketsLoaded.current && view === 'technician' && (user || isTechLoggedIn)) {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const newTicket = change.doc.data() as Ticket;
            if (newTicket.status === 'pending') {
              toast.info('Novo Chamado Recebido!', {
                description: `Cliente: ${newTicket.clientName} - Equipamento: ${newTicket.equipment}`,
                duration: 10000,
                icon: <Bell className="text-[#0056b3]" size={18} />,
                action: {
                  label: 'Ver Chamados',
                  onClick: () => window.scrollTo({ top: 0, behavior: 'smooth' })
                }
              });
              
              // Play a subtle notification sound if browser allows
              try {
                const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3');
                audio.play();
              } catch (e) {
                console.log("Audio playback blocked by browser");
              }
            }
          }
        });
      }
      
      if (!initialTicketsLoaded.current && snapshot.docs.length > 0) {
        initialTicketsLoaded.current = true;
      }

      setTickets(ticketsData);
    });

    return () => {
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

  // Capture PWA install event
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const getPublicBaseUrl = () => {
    if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      if (origin.includes('ais-dev-')) {
        return origin.replace('ais-dev-', 'ais-pre-');
      }
      return origin;
    }
    return 'https://ais-pre-c3feqekoa3gvxbgrdmy76b-272434718853.us-east1.run.app';
  };

  const getClientShareUrl = () => {
    return `${getPublicBaseUrl()}?modo=cliente`;
  };

  const getTechShareUrl = () => {
    return `${getPublicBaseUrl()}?modo=tecnico`;
  };

  const handleCopyTechLink = async () => {
    const url = getTechShareUrl();
    try {
      await navigator.clipboard.writeText(url);
      setCopiedTechLink(true);
      toast.success('Link do Técnico copiado! Salve nos seus favoritos.');
      setTimeout(() => setCopiedTechLink(false), 2500);
    } catch {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopiedTechLink(true);
      toast.success('Link do Técnico copiado!');
      setTimeout(() => setCopiedTechLink(false), 2500);
    }
  };

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try {
        const choice = await deferredPrompt.userChoice;
        if (choice && choice.outcome === 'accepted') {
          toast.success('DUNEX-TI instalado como aplicativo com sucesso!');
          setIsInstallable(false);
        }
      } catch (err) {
        console.error('Install prompt error:', err);
      }
      setDeferredPrompt(null);
    } else {
      setShowOnlineAccessModal(true);
    }
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

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const docRef = await addDoc(collection(db, 'tickets'), {
        clientName,
        whatsapp,
        equipment,
        problem,
        createdAt: serverTimestamp(),
        status: 'pending'
      });
      const shortId = docRef.id.slice(0, 6).toUpperCase();
      setSubmittedTicketInfo({
        protocol: shortId,
        clientName,
        equipment,
        whatsapp
      });
      setSuccessMessage(`Chamado #${shortId} registrado com sucesso!`);
      setClientName('');
      setWhatsapp('');
      setEquipment('');
      setProblem('');
      toast.success(`Chamado #${shortId} enviado com sucesso!`);
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
            {/* Botão Ativar / Acessar na Internet sem IA Studio */}
            <button
              onClick={() => setShowOnlineAccessModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold transition-all cursor-pointer shadow-xs"
              title="Acessar aplicativo direto na internet sem precisar do IA Studio e instalar no celular"
            >
              <Globe size={15} className="text-emerald-600 animate-pulse" />
              <span className="hidden sm:inline">Ativar na Internet</span>
              <span className="sm:hidden">Online 24h</span>
            </button>

            {isInstallable && (
              <button
                onClick={handleInstallApp}
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
                title="Instalar DUNEX-TI no dispositivo"
              >
                <Smartphone size={14} />
                <span>Instalar App</span>
              </button>
            )}

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

                  <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 mb-6 text-left space-y-2 text-sm">
                    <div className="flex justify-between items-center text-gray-600">
                      <span>Equipamento:</span>
                      <span className="font-semibold text-gray-900">{submittedTicketInfo.equipment}</span>
                    </div>
                    <div className="flex justify-between items-center text-gray-600">
                      <span>WhatsApp informado:</span>
                      <span className="font-semibold text-gray-900">{submittedTicketInfo.whatsapp}</span>
                    </div>
                    <div className="flex justify-between items-center text-gray-600">
                      <span>Status inicial:</span>
                      <span className="font-semibold text-amber-600 flex items-center gap-1">
                        <Clock size={13} /> Pendente de atendimento
                      </span>
                    </div>
                  </div>

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

                    <button 
                      disabled={submitting}
                      type="submit"
                      className="w-full bg-[#0056b3] hover:bg-[#004494] text-white font-bold py-3 rounded-xl shadow-lg shadow-[#0056b3]/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70 cursor-pointer"
                    >
                      {submitting ? "Enviando..." : (
                        <>
                          Enviar Chamado
                          <Send size={18} />
                        </>
                      )}
                    </button>
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
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                  <div>
                    <h2 className="text-2xl font-bold">Painel do Técnico</h2>
                    <p className="text-gray-500">Gerenciamento de chamados em tempo real</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button 
                      onClick={() => setShowOnlineAccessModal(true)}
                      className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 px-3.5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all cursor-pointer shadow-xs"
                      title="Acessar aplicativo direto na internet sem precisar do IA Studio e instalar no celular"
                    >
                      <Globe size={16} className="text-emerald-600 animate-pulse" />
                      <span>Ativar na Internet / Instalar</span>
                    </button>
                    <button 
                      onClick={() => setShowShareModal(true)}
                      className="bg-blue-50 hover:bg-blue-100 text-[#0056b3] border border-blue-200 px-3.5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all cursor-pointer shadow-xs"
                      title="Copiar link ou ver QR Code de abertura de chamados para clientes"
                    >
                      <QrCode size={16} />
                      <span>Link / QR Code para Clientes</span>
                    </button>
                    <button 
                      onClick={handleLogout}
                      className="text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-200 px-3 py-2 rounded-xl flex items-center gap-1.5 text-sm font-medium transition-all cursor-pointer"
                    >
                      <LogOut size={16} /> Sair
                    </button>
                  </div>
                </div>

                {/* Banner Informativo de Ativação Online 24h */}
                <div className="bg-gradient-to-r from-[#003366] via-[#004080] to-[#0056b3] text-white rounded-2xl p-4 sm:p-5 mb-6 shadow-md border border-blue-700/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400"></span>
                      </span>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">Aplicativo 100% Online na Nuvem</span>
                    </div>
                    <h3 className="text-base sm:text-lg font-bold">Acesse e atenda chamados direto na internet sem precisar do IA Studio</h3>
                    <p className="text-xs text-blue-100 max-w-2xl leading-relaxed">
                      Seu sistema já está hospedado e ativo 24h nos servidores Google Cloud. Você e seus clientes podem abrir e gerenciar chamados pelo celular ou computador sem abrir o IA Studio.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <button
                      onClick={() => setShowOnlineAccessModal(true)}
                      className="px-3.5 py-2 bg-white text-[#0056b3] hover:bg-blue-50 text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
                    >
                      <Globe size={14} /> Links & Instalação
                    </button>
                    <button
                      onClick={handleCopyLink}
                      className="px-3.5 py-2 bg-blue-800/80 hover:bg-blue-800 text-white border border-blue-700 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      {copiedLink ? <Check size={14} /> : <Copy size={14} />} Link Cliente
                    </button>
                  </div>
                </div>

                <div className="grid gap-4">
                  {tickets.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-300">
                      <ClipboardList size={48} className="text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">Nenhum chamado encontrado.</p>
                    </div>
                  ) : (
                    tickets.map(ticket => (
                      <div key={ticket.id} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-all">
                        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                          <div>
                            <div className="flex items-center gap-3 mb-1">
                              <h3 className="font-bold text-lg">{ticket.clientName}</h3>
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

      {/* Modal Ativar Direto na Internet & Instalar App */}
      {showOnlineAccessModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 border border-gray-100 my-8 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-gray-100">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold mb-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  100% ONLINE E ATIVO NA NUVEM
                </div>
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Globe size={22} className="text-[#0056b3]" />
                  Acessar Direto na Internet (Sem IA Studio)
                </h3>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  O aplicativo <strong>DUNEX-TI</strong> já está hospedado e funcionando 24h na internet. Qualquer pessoa pode acessar pelo celular, tablet ou computador sem precisar do IA Studio.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowOnlineAccessModal(false)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center transition-all cursor-pointer text-sm font-bold shrink-0"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="overflow-y-auto py-4 space-y-5 flex-1 pr-1">
              {/* Card 1: Link do Cliente */}
              <div className="bg-blue-50/60 border border-blue-200/80 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Smartphone size={15} className="text-[#0056b3]" /> Link de Abertura de Chamados (Para Clientes)
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-[#0056b3]">
                    Sem Senha / Aberto
                  </span>
                </div>
                <p className="text-xs text-blue-950">
                  Envie este link para seus clientes abrirem chamados pelo WhatsApp, redes sociais ou site:
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    readOnly
                    value={getClientShareUrl()}
                    className="flex-1 bg-white border border-blue-200 rounded-xl px-3 py-2 text-xs font-mono text-gray-800 select-all outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="px-4 py-2 bg-[#0056b3] hover:bg-[#004494] text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm shrink-0"
                  >
                    {copiedLink ? <Check size={14} /> : <Copy size={14} />} {copiedLink ? 'Copiado!' : 'Copiar'}
                  </button>
                  <a
                    href={getClientShareUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer shrink-0"
                  >
                    <ExternalLink size={14} /> Testar
                  </a>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(`Olá! Para abrir um chamado de suporte ou manutenção na DUNEX-TI, acesse nosso link direto: ${getClientShareUrl()}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-green-700 font-bold hover:underline"
                  >
                    <MessageCircle size={14} /> Enviar link pelo WhatsApp
                  </a>
                  <span className="text-gray-300">•</span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowOnlineAccessModal(false);
                      setShowShareModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs text-[#0056b3] font-bold hover:underline cursor-pointer"
                  >
                    <QrCode size={14} /> Gerar QR Code para adesivo
                  </button>
                </div>
              </div>

              {/* Card 2: Link do Técnico */}
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Laptop size={15} className="text-gray-700" /> Link do Painel do Técnico (Para Você)
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                    Acesso Protegido
                  </span>
                </div>
                <p className="text-xs text-gray-600">
                  Use este link para gerenciar chamados, iniciar manutenções e emitir relatórios em PDF:
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    readOnly
                    value={getTechShareUrl()}
                    className="flex-1 bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs font-mono text-gray-800 select-all outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleCopyTechLink}
                    className="px-4 py-2 bg-gray-800 hover:bg-black text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm shrink-0"
                  >
                    {copiedTechLink ? <Check size={14} /> : <Copy size={14} />} {copiedTechLink ? 'Copiado!' : 'Copiar'}
                  </button>
                  <a
                    href={getTechShareUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer shrink-0"
                  >
                    <ExternalLink size={14} /> Abrir
                  </a>
                </div>
                <p className="text-[11px] text-gray-500 italic">
                  💡 Dica: Salve este link nos Favoritos do seu celular ou do seu navegador do computador (Ctrl+D).
                </p>
              </div>

              {/* Card 3: Instalar como Aplicativo PWA */}
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles size={15} className="text-emerald-600" /> Instalar como Aplicativo no Celular / PC (PWA)
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-200/80 text-emerald-900">
                    Sem Baixar de Loja
                  </span>
                </div>
                <p className="text-xs text-emerald-900 leading-relaxed">
                  Você e seus clientes podem instalar o <strong>DUNEX-TI</strong> direto na tela inicial. Ele funciona como um aplicativo normal com ícone, tela cheia e carregamento ultrarrápido:
                </p>

                {isInstallable && (
                  <button
                    type="button"
                    onClick={handleInstallApp}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                  >
                    <Smartphone size={16} /> Instalar DUNEX-TI Agora neste Dispositivo
                  </button>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
                  <div className="bg-white/90 border border-emerald-200 rounded-xl p-3">
                    <div className="font-bold text-gray-900 flex items-center gap-1.5 mb-1">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold">1</span>
                      Android (Chrome)
                    </div>
                    <p className="text-[11px] text-gray-600 leading-normal">
                      Abra o link, toque nos <strong>3 pontinhos (⋮)</strong> no topo e toque em <strong>"Instalar aplicativo"</strong> ou <strong>"Adicionar à tela inicial"</strong>.
                    </p>
                  </div>

                  <div className="bg-white/90 border border-emerald-200 rounded-xl p-3">
                    <div className="font-bold text-gray-900 flex items-center gap-1.5 mb-1">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold">2</span>
                      iPhone / iPad (Safari)
                    </div>
                    <p className="text-[11px] text-gray-600 leading-normal">
                      Abra no Safari, toque no botão <strong>Compartilhar (⎋)</strong> e selecione <strong>"Adicionar à Tela de Início"</strong>.
                    </p>
                  </div>

                  <div className="bg-white/90 border border-emerald-200 rounded-xl p-3">
                    <div className="font-bold text-gray-900 flex items-center gap-1.5 mb-1">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold">3</span>
                      Computador (PC/Mac)
                    </div>
                    <p className="text-[11px] text-gray-600 leading-normal">
                      No Chrome ou Edge, clique no ícone de <strong>Instalar</strong> ao lado da barra de endereço ou pressione <strong>Ctrl+D</strong> para favoritar.
                    </p>
                  </div>
                </div>
              </div>

              {/* Card 4: Hospedagem com Domínio Próprio (Vercel / Netlify) */}
              <div className="border border-gray-200 rounded-2xl p-4 bg-white">
                <button
                  type="button"
                  onClick={() => setShowCustomDomainHelp(!showCustomDomainHelp)}
                  className="w-full flex items-center justify-between text-left text-xs font-bold text-gray-800 hover:text-[#0056b3] transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <ShieldCheck size={16} className="text-[#0056b3]" />
                    Quer usar Domínio Próprio (ex: www.dunexti.com.br) ou Vercel?
                  </span>
                  <span className="text-gray-400 font-normal text-base">{showCustomDomainHelp ? '▲' : '▼'}</span>
                </button>

                {showCustomDomainHelp && (
                  <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-600 space-y-2 leading-relaxed animate-in fade-in duration-150">
                    <p>
                      Se você desejar publicar em um endereço personalizado como <strong>dunexti.com.br</strong> ou <strong>dunex-ti.vercel.app</strong>:
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-gray-700 pl-1 font-medium">
                      <li>O banco de dados <strong>Firebase Firestore</strong> fica 100% na nuvem do Google e funciona em qualquer hospedagem.</li>
                      <li>Você pode conectar o repositório gratuitamente na <strong>Vercel</strong> ou <strong>Netlify</strong> com 1 clique.</li>
                      <li>Na Vercel/Netlify, basta apontar seu domínio (DNS CNAME) para ter HTTPS gratuito e domínio próprio permanente!</li>
                    </ol>
                    <p className="text-[11px] text-gray-500 pt-1">
                      Enquanto isso, o link do Google Cloud Run fornecido acima já funciona perfeitamente sem nenhum custo e sem limites!
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-[11px] text-gray-400">
                DUNEX-TI • Cloud Run & Firebase Firestore
              </span>
              <button
                type="button"
                onClick={() => setShowOnlineAccessModal(false)}
                className="px-5 py-2 bg-[#0056b3] hover:bg-[#004494] text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-sm"
              >
                Entendi, Fechar
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
