import React, { useEffect, useState, useRef } from 'react';
import { X, User, Headset, MessageSquare, Clock, Calendar, Bot, Timer } from 'lucide-react';
import { Ticket } from '../types';

interface TicketModalProps {
  ticket: Ticket;
  onClose: () => void;
}

export const TicketModal: React.FC<TicketModalProps> = ({ ticket, onClose }) => {
  const [details, setDetails] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDuration, setActiveDuration] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isUserScrolling = useRef(false);

  const scrollToBottom = () => {
    if (messagesEndRef.current && !isUserScrolling.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  };

  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    
    // Check if the user has scrolled up from the bottom (allow 50px tolerance)
    const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 50;
    
    isUserScrolling.current = !isAtBottom;
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!ticket.createdAt) return;

    const calculateTime = () => {
      // If it's already closed, calculate duration between creation and closed time
      // Otherwise calculate from creation to now
      const start = new Date(ticket.createdAt!).getTime();
      const end = ticket.closedAt ? new Date(ticket.closedAt).getTime() : new Date().getTime();
      const diffMs = end - start;

      if (diffMs < 0) return setActiveDuration('0 minutos');

      const diffMins = Math.floor(diffMs / 60000);
      const days = Math.floor(diffMins / (24 * 60));
      const hours = Math.floor((diffMins % (24 * 60)) / 60);
      const mins = diffMins % 60;

      const parts = [];
      if (days > 0) parts.push(`${days} dia${days > 1 ? 's' : ''}`);
      if (hours > 0) parts.push(`${hours} hora${hours > 1 ? 's' : ''}`);
      if (mins > 0 || parts.length === 0) parts.push(`${mins} minuto${mins > 1 ? 's' : ''}`);

      setActiveDuration(parts.join(' '));
    };

    calculateTime();
    
    // Only update periodically if the ticket is not closed
    if (!ticket.closedAt) {
      const timer = setInterval(calculateTime, 60000);
      return () => clearInterval(timer);
    }
  }, [ticket.createdAt, ticket.closedAt]);

  useEffect(() => {
    let intervalId: number;

    const fetchData = async (isInitial = true) => {
      if (isInitial) setLoading(true);
      try {
        const promises = [
          fetch(`/api/ticket-messages/${ticket.id}`).then(res => res.json())
        ];
        
        if (isInitial) {
          promises.push(fetch(`/api/ticket-details/${ticket.id}`).then(res => res.json()));
        }

        const results = await Promise.all(promises);
        const messagesRes = results[0];
        const detailsRes = isInitial ? results[1] : null;
        
        if (isInitial && detailsRes?.success) setDetails(detailsRes.data);
        if (messagesRes.success) {
          const sorted = (messagesRes.data || []).sort((a: any, b: any) => {
            return new Date(a.data).getTime() - new Date(b.data).getTime();
          });
          setMessages(sorted);
        }
      } catch (err) {
        console.error("Erro ao buscar detalhes:", err);
      } finally {
        if (isInitial) setLoading(false);
      }
    };
    
    fetchData(true);

    intervalId = window.setInterval(() => {
      fetchData(false);
    }, 3000);

    return () => clearInterval(intervalId);
  }, [ticket]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(d);
    } catch {
      return dateStr;
    }
  };

  const getClientName = () => {
    if (details?.id_cliente?.nome) return details.id_cliente.nome;
    return ticket.clientName;
  };

  const getAttendantName = () => {
    if (details?.id_atendente?.nome) return details.id_atendente.nome;
    return ticket.attendantName || "Em atendimento";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700/50 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="bg-sky-500/10 p-2 rounded-lg">
              <MessageSquare className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                Protocolo: <span className="text-sky-400">{ticket.protocol}</span>
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold 
                  ${ticket.status === 'in_service' ? 'bg-sky-500/10 text-sky-400' : 'bg-slate-800 text-slate-300'}`}>
                  {ticket.department || 'Setor'}
                </span>
                <span>•</span>
                <Clock className="w-3 h-3" />
                <span>{formatDate(ticket.createdAt)}</span>
                {activeDuration && (
                  <>
                    <span>•</span>
                    <Timer className="w-3 h-3 text-amber-500" />
                    <span className="text-amber-400 font-medium">{activeDuration}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors border border-slate-700 hover:border-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Main Info Sidebar */}
          <div className="w-1/3 border-r border-slate-800 bg-slate-900/30 p-5 overflow-y-auto space-y-6">
            <div className="space-y-4 shadow-sm bg-slate-800/20 p-4 rounded-xl border border-slate-700/30">
              <h3 className="font-semibold text-xs text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-3">
                <User className="w-4 h-4 text-emerald-500" />
                Cliente / Contato
              </h3>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-lg font-bold text-slate-300">
                  {getClientName().substring(0,2).toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-slate-200">{getClientName()}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{details?.id_cliente?.cpf_cnpj || ticket.contact || 'S/N'}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4 shadow-sm bg-slate-800/20 p-4 rounded-xl border border-slate-700/30">
              <h3 className="font-semibold text-xs text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-3">
                <Headset className="w-4 h-4 text-sky-500" />
                Atendente Responsável
              </h3>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-lg font-bold text-slate-300">
                  {getAttendantName().substring(0,2).toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-slate-200">{getAttendantName()}</p>
                  <p className="text-xs text-slate-400 mt-0.5">ID: {details?.id_atendente?._id?.substring(0,8) || '--'}</p>
                </div>
              </div>
            </div>
            
            {details?.id_motivo_atendimento && (
              <div className="space-y-4 shadow-sm bg-slate-800/20 p-4 rounded-xl border border-slate-700/30">
                 <h3 className="font-semibold text-xs text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-3">
                  Motivo de Atendimento
                </h3>
                <p className="text-sm font-medium text-slate-300">
                  {details.id_motivo_atendimento.motivo || 'N/A'}
                </p>
              </div>
            )}
          </div>

          {/* Messages Area */}
          <div className="w-2/3 bg-slate-950/50 flex flex-col pt-4">
            <h3 className="px-5 font-semibold text-xs text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4">
              <MessageSquare className="w-4 h-4 text-violet-500" />
              Histórico da Conversa
            </h3>
            
            <div 
              ref={messagesContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto px-5 pb-5 space-y-4 custom-scrollbar"
            >
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 opacity-50">
                   <div className="w-8 h-8 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin"></div>
                   <p className="text-sm text-slate-500 animate-pulse">Carregando mensagens...</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-500">
                  <MessageSquare className="w-8 h-8 opacity-20" />
                  <p className="text-sm">Nenhuma mensagem registrada.</p>
                </div>
              ) : (
                messages.map((msg, i) => {
                  const isSystem = msg.tipo === "menuInterativo";
                  const isClient = msg.tipoDestinatario === "usuarios" || msg.tipoDestinatario === "atendentes";
                  const hasMenu = typeof msg.mensagem === 'object' && msg.mensagem !== null;

                  // Collect common URLs from Opa Suite formats
                  let rawFileUrl = msg.url_s3 || msg.s3_url || msg.aws_url || msg.arquivo?.url_s3 || msg.arquivo?.url || msg.url || msg.arquivo_url || msg.link || msg.anexo?.url || (Array.isArray(msg.arquivos) && msg.arquivos[0]?.url) || (Array.isArray(msg.anexos) && msg.anexos[0]?.url);
                  let textContent = typeof msg.mensagem === 'string' ? msg.mensagem : '';

                  const isMedia = ['imagem', 'image', 'audio', 'áudio', 'video', 'vídeo', 'documento', 'document', 'arquivo', 'ptt', 'midia', 'media'].includes(String(msg.tipo).toLowerCase()) || !!rawFileUrl || (textContent && textContent.match(/\.(jpeg|jpg|gif|png|webp|mp3|ogg|wav|mp4|webm|pdf|doc|docx)($|\?)/i));
                  
                  let fileIdParam = '';
                  
                  if (typeof msg.arquivo === 'string' && msg.arquivo.length > 0) {
                    if (msg.arquivo.startsWith('http')) {
                      if (!rawFileUrl) rawFileUrl = msg.arquivo;
                    } else if (/^[a-fA-F0-9]{24}$/.test(msg.arquivo)) {
                      // It's a Mongo ID.
                      fileIdParam = msg.arquivo;
                    }
                  } else if (msg.arquivo?._id || msg.id_arquivo) {
                     fileIdParam = msg.arquivo?._id || msg.id_arquivo;
                  } else if (msg.objeto && typeof msg.objeto === 'string' && /^[a-fA-F0-9]{24}$/.test(msg.objeto)) {
                     fileIdParam = msg.objeto;
                  } else if (msg.arquivoId || msg.fileId || msg.id) {
                     // speculative
                     if (msg.arquivoId && /^[a-fA-F0-9]{24}$/.test(msg.arquivoId)) fileIdParam = msg.arquivoId;
                     else if (msg.id_arquivo && /^[a-fA-F0-9]{24}$/.test(msg.id_arquivo)) fileIdParam = msg.id_arquivo;
                  }

                  // If still no url but msg has a direct url property
                  if (!rawFileUrl && msg.url) rawFileUrl = msg.url;


                  if (isMedia && !rawFileUrl && !fileIdParam && textContent.startsWith('http')) {
                    rawFileUrl = textContent;
                    textContent = '';
                  }

                  let fileUrl = rawFileUrl || '';
                  if (fileUrl && !fileUrl.includes('s3.amazonaws') && !fileUrl.includes('s3') && fileUrl.startsWith('http')) {
                     fileUrl = `/api/media-proxy?url=${encodeURIComponent(fileUrl)}`;
                  } else if (!fileUrl && fileIdParam) {
                     fileUrl = `/api/media-proxy?id=${fileIdParam}`;
                  }

                  // External fallback URL for direct browser access
                  let externalDirectFallback = rawFileUrl;
                  if (!externalDirectFallback && fileIdParam) {
                     // The login session is required to open the actual API url directly
                     externalDirectFallback = `https://atendimento.itlfibra.com/arquivo/${fileIdParam}`;
                  }

                  const isImage = ['imagem', 'image'].includes(String(msg.tipo).toLowerCase()) || (rawFileUrl && rawFileUrl.match(/\.(jpeg|jpg|gif|png|webp)($|\?)/i)) || (typeof msg.mensagem === 'string' && msg.mensagem.match(/\.(jpeg|jpg|gif|png|webp)($|\?)/i));
                  const isAudio = ['audio', 'áudio', 'ptt'].includes(String(msg.tipo).toLowerCase()) || (rawFileUrl && rawFileUrl.match(/\.(mp3|ogg|wav)($|\?)/i)) || (typeof msg.mensagem === 'string' && msg.mensagem.match(/\.(mp3|ogg|wav)($|\?)/i));
                  const isVideo = ['video', 'vídeo'].includes(String(msg.tipo).toLowerCase()) || (rawFileUrl && rawFileUrl.match(/\.(mp4|webm)($|\?)/i)) || (typeof msg.mensagem === 'string' && msg.mensagem.match(/\.(mp4|webm)($|\?)/i));

                  return (
                    <div key={msg._id || i} className={`w-full flex ${isClient ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[80%] rounded-xl p-3 ${
                        isSystem 
                          ? 'bg-slate-800 border border-slate-700/50 text-slate-300' 
                          : isClient 
                            ? 'bg-slate-800 border border-emerald-900/30 text-slate-200'
                            : 'bg-sky-900 border border-sky-800 text-slate-100'
                      }`}>
                        {hasMenu ? (
                          <div className="space-y-2 text-sm">
                            <p className="font-bold flex items-center gap-2 text-sky-400">
                               <Bot className="w-4 h-4" /> BOT
                            </p>
                            <p className="mb-2 font-medium">{msg.mensagem.titulo}</p>
                            {msg.mensagem.opcoes?.map((opt: any, idx: number) => (
                              <div key={opt.id || idx} className="bg-slate-900/50 px-3 py-1.5 rounded-lg text-xs border border-slate-700/50">
                                <span className="font-bold w-5 inline-block text-sky-400">{opt.id}</span>
                                {opt.texto}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <>
                            {textContent && <p className="text-sm whitespace-pre-wrap">{textContent}</p>}
                            {fileUrl ? (
                              <div className="mt-2">
                                {isImage && (
                                  <a href={externalDirectFallback} target="_blank" rel="noreferrer" className="block max-w-full mb-1">
                                    <img src={fileUrl} alt="Anexo" className="max-w-full rounded-lg max-h-64 object-contain" onError={(e) => {
                                       if (e.currentTarget.src !== externalDirectFallback) e.currentTarget.src = externalDirectFallback; 
                                    }}/>
                                    <span className="text-[10px] underline text-sky-400 opacity-70 hover:opacity-100">Se não carregar, clique para abrir (requer login Opa Suite em outra aba)</span>
                                  </a>
                                )}
                                {isAudio && (
                                  <div className="flex flex-col gap-1">
                                    <audio src={fileUrl} controls className="max-w-full h-10" onError={(e) => {
                                         if (e.currentTarget.src !== externalDirectFallback) e.currentTarget.src = externalDirectFallback; 
                                    }}/>
                                    <a href={externalDirectFallback} target="_blank" rel="noreferrer" className="text-[10px] underline text-sky-400 opacity-70 hover:opacity-100">Dificuldades em ouvir? Abra o áudio diretamente (requer login Opa Suite em outra aba)</a>
                                  </div>
                                )}
                                {isVideo && (
                                  <div className="flex flex-col gap-1">
                                    <video src={fileUrl} controls className="max-w-full rounded-lg max-h-64" onError={(e) => {
                                        if (e.currentTarget.src !== externalDirectFallback) e.currentTarget.src = externalDirectFallback; 
                                    }}/>
                                    <a href={externalDirectFallback} target="_blank" rel="noreferrer" className="text-[10px] underline text-sky-400 opacity-70 hover:opacity-100">Abrir vídeo diretamente (requer login Opa Suite em outra aba)</a>
                                  </div>
                                )}
                                {(!isImage && !isAudio && !isVideo) && (
                                  <a href={externalDirectFallback} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sky-400 bg-sky-950 p-2 rounded hover:bg-sky-900 transition-colors text-xs font-medium">
                                    📎 Ver Arquivo (Requer login Opa Suite em outra aba)
                                  </a>
                                )}
                              </div>
                            ) : (
                               isMedia && (
                                 <details className="mt-2 text-[10px] text-slate-500 bg-slate-900/50 p-2 rounded overflow-hidden">
                                   <summary className="cursor-pointer text-sky-400 hover:text-sky-300">Mostrar dados do anexo (Debug)</summary>
                                   <pre className="whitespace-pre-wrap break-words mt-1">{JSON.stringify(msg, null, 2)}</pre>
                                 </details>
                               )
                            )}
                          </>
                        )}
                        <p className="text-[10px] text-right mt-2 opacity-50 flex justify-end gap-2 items-center">
                          {formatDate(msg.data)}
                        </p>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
