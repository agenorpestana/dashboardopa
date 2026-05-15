import React, { useEffect, useState } from 'react';
import { X, User, Bot, Clock, MessageSquare, Phone } from 'lucide-react';
import { Ticket } from '../types';

interface TicketModalProps {
  ticketId: string;
  onClose: () => void;
}

export const TicketModal: React.FC<TicketModalProps> = ({ ticketId, onClose }) => {
  const [ticketData, setTicketData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTicket = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/ticket/${ticketId}`);
        const data = await res.json();
        if (data.success) {
          setTicketData(data.data);
        }
      } catch (err) {
        console.error("Error fetching ticket", err);
      } finally {
        setLoading(false);
      }
    };
    fetchTicket();
  }, [ticketId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-slate-900 border border-slate-700 shadow-2xl rounded-xl w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
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

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 flex flex-col gap-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-10 h-10 border-4 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" />
              <p className="text-slate-500 animate-pulse">Carregando detalhes do atendimento...</p>
            </div>
          ) : ticketData ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 flex flex-col gap-2">
                  <h3 className="text-xs uppercase font-bold text-slate-500 flex items-center gap-2 mb-2">
                    <User className="w-4 h-4" /> Cliente
                  </h3>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-sm">Nome:</span>
                    <span className="text-slate-200 font-medium">{ticketData.id_cliente?.nome || 'Não informado'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-sm">Documento:</span>
                    <span className="text-slate-200">{ticketData.id_cliente?.cpf_cnpj || 'Não informado'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-sm">Canal:</span>
                    <span className="text-slate-200 uppercase">{ticketData.canal || 'N/A'}</span>
                  </div>
                </div>

                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 flex flex-col gap-2">
                  <h3 className="text-xs uppercase font-bold text-slate-500 flex items-center gap-2 mb-2">
                    <Bot className="w-4 h-4" /> Atendimento
                  </h3>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-sm">Atendente:</span>
                    <span className="text-slate-200 font-medium">{ticketData.id_atendente?.nome || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-sm">Status:</span>
                    <span className="text-sky-400 font-medium px-2 bg-sky-400/10 rounded">{ticketData.status}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-sm">Data/Hora:</span>
                    <span className="text-slate-200 font-mono text-sm max-w-[150px] truncate" title={ticketData.date}>
                      {new Date(ticketData.date).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col bg-slate-950 border border-slate-800 rounded-lg overflow-hidden h-[300px]">
                <div className="p-3 border-b border-slate-800 bg-slate-900/50">
                  <h3 className="text-xs uppercase font-bold text-slate-500">Histórico de Conversa (Em Breve)</h3>
                </div>
                <div className="p-4 flex-1 overflow-y-auto flex items-center justify-center text-center">
                  <div className="max-w-xs text-slate-500 text-sm space-y-2">
                    <MessageSquare className="w-8 h-8 mx-auto text-slate-700" />
                    <p>O histórico de mensagens detalhado ainda não está disponível no payload fornecido pela API.</p>
                  </div>
                </div>
              </div>
            </>
          ) : (
             <div className="text-center py-10 text-slate-500">
               <p>Não foi possível carregar os dados.</p>
             </div>
          )}
        </div>
      </div>
    </div>
  );
};
