import React, { useEffect, useState } from 'react';
import { X, User, Bot, Clock, MessageSquare, Phone } from 'lucide-react';
import { Ticket } from '../types';

interface TicketModalProps {
  ticketId: string;
  onClose: () => void;
}

export const TicketModal: React.FC<TicketModalProps> = ({ ticketId, onClose }) => {
  const [ticketData, setTicketData] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTicketData = async () => {
      setLoading(true);
      try {
        const [ticketRes, messagesRes] = await Promise.all([
          fetch(`/api/ticket/${ticketId}`),
          fetch(`/api/ticket/${ticketId}/messages`)
        ]);
        
        const ticketJson = await ticketRes.json();
        const messagesJson = await messagesRes.json();
        
        if (ticketJson.success) {
          setTicketData(ticketJson.data);
        }
        if (messagesJson.success) {
          setMessages(messagesJson.data || []);
        }
      } catch (err) {
        console.error("Error fetching ticket data", err);
      } finally {
        setLoading(false);
      }
    };
    fetchTicketData();
  }, [ticketId]);

  const renderMessageContent = (msg: any) => {
    if (msg.tipo === 'menuInterativo' && typeof msg.mensagem === 'object') {
      return (
        <div>
          <p className="font-bold mb-1">{msg.mensagem.titulo}</p>
          <ul className="space-y-1">
            {msg.mensagem.opcoes?.map((opt: any) => (
              <li key={opt.id} className="text-sm bg-slate-800/50 p-1.5 rounded">{opt.id} - {opt.texto}</li>
            ))}
          </ul>
        </div>
      );
    }
    
    if (typeof msg.mensagem === 'string') {
      return <p>{msg.mensagem}</p>;
    }

    return <p className="italic text-slate-500">Mensagem não suportada</p>;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-slate-900 border border-slate-700 shadow-2xl rounded-xl w-full max-w-4xl flex flex-col h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="bg-sky-500/10 p-2 rounded-lg">
              <MessageSquare className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">Detalhes do Protocolo</h2>
              <p className="text-sm text-slate-400 font-mono">{ticketData?.protocolo || 'Carregando...'}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-lg transition-colors border border-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <div className="w-10 h-10 border-4 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" />
              <p className="text-slate-500 animate-pulse">Carregando atendimento e conversa...</p>
            </div>
          ) : ticketData ? (
            <>
              {/* Sidebar Info */}
              <div className="w-full md:w-80 border-r border-slate-800 bg-slate-900/40 p-4 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 flex flex-col gap-2">
                  <h3 className="text-xs uppercase font-bold text-slate-500 flex items-center gap-2 mb-2">
                    <User className="w-4 h-4" /> Cliente
                  </h3>
                  <div className="flex flex-col gap-1">
                    <span className="text-slate-200 font-medium">{ticketData.id_cliente?.nome || 'Não informado'}</span>
                    <span className="text-slate-400 text-sm whitespace-nowrap overflow-hidden text-ellipsis" title={ticketData.id_cliente?.cpf_cnpj || ''}>
                      {ticketData.id_cliente?.cpf_cnpj || 'Doc não informado'}
                    </span>
                    <span className="text-slate-500 text-xs uppercase mt-1">Canal: {ticketData.canal || 'N/A'}</span>
                  </div>
                </div>

                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 flex flex-col gap-2">
                  <h3 className="text-xs uppercase font-bold text-slate-500 flex items-center gap-2 mb-2">
                    <Bot className="w-4 h-4" /> Atendimento
                  </h3>
                  <div className="flex flex-col gap-2">
                    <div>
                      <span className="text-slate-400 text-xs block mb-1">Atendente:</span>
                      <span className="text-slate-200 font-medium text-sm">{ticketData.id_atendente?.nome || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-xs block mb-1">Status:</span>
                      <span className="text-sky-400 font-medium text-xs px-2 py-0.5 bg-sky-400/10 rounded border border-sky-400/20">{ticketData.status}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-xs block mb-1">Data/Hora:</span>
                      <span className="text-slate-200 font-mono text-xs">
                        {ticketData.date ? new Date(ticketData.date).toLocaleString() : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Chat Area */}
              <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
                <div className="p-3 border-b border-slate-800 bg-slate-900/80 backdrop-blur">
                  <h3 className="text-xs uppercase font-bold text-slate-500">Conversa em Tempo Real</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 custom-scrollbar">
                  {messages.length > 0 ? (
                    messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()).map((msg, index) => {
                      // Se tem id_user (ou destinatario é quem tem id_user no payload anterior), é cliente
                      // Aqui vamos simplificar: se tem id_user é cliente. Se tem id_atend é atendente/bot.
                      const isClient = !!msg.id_user;
                      return (
                        <div key={msg._id || index} className={`flex ${isClient ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] rounded-xl p-3 ${isClient ? 'bg-sky-600/20 border border-sky-600/30 text-sky-100' : 'bg-slate-800 border border-slate-700 text-slate-300'}`}>
                            <div className="flex justify-between items-end gap-4 mb-1">
                              <span className="text-[10px] font-bold text-slate-400 uppercase">
                                {isClient ? (ticketData.id_cliente?.nome || 'Cliente') : (ticketData.id_atendente?.nome || 'Atendente')}
                              </span>
                              <span className="text-[9px] text-slate-500 font-mono">
                                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <div className="text-sm break-words whitespace-pre-wrap">
                              {renderMessageContent(msg)}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 space-y-2">
                       <MessageSquare className="w-10 h-10 mx-auto text-slate-700" />
                       <p>Nenhuma mensagem encontrada neste protocolo.</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
             <div className="text-center py-10 text-slate-500 w-full">
               <p>Não foi possível carregar os dados.</p>
             </div>
          )}
        </div>
      </div>
    </div>
  );
};
