import React from 'react';
import { Ticket } from '../types';
import { Clock, User, Mail, Hash, Phone } from 'lucide-react';

interface TicketListProps {
  title: string;
  tickets: Ticket[];
  type: 'waiting' | 'in_service';
}

const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const TicketList: React.FC<TicketListProps> = ({ title, tickets, type }) => {
  const isWaiting = type === 'waiting';
  const accentColor = isWaiting ? 'border-amber-500' : 'border-sky-500';
  const badgeColor = isWaiting ? 'bg-amber-500/10 text-amber-500' : 'bg-sky-500/10 text-sky-500';

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden flex flex-col h-full shadow-lg">
      <div className={`p-4 border-b border-slate-700 bg-slate-800/50 flex justify-between items-center border-l-4 ${accentColor}`}>
        <h3 className="font-semibold text-lg text-white uppercase tracking-wide flex items-center gap-2">
          {isWaiting ? <Clock className="w-5 h-5 text-amber-500" /> : <User className="w-5 h-5 text-sky-500" />}
          {title}
        </h3>
        <span className={`px-2 py-1 rounded text-xs font-bold ${badgeColor}`}>
          {tickets.length} Total
        </span>
      </div>
      
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-900/50 text-slate-400 text-xs uppercase tracking-wider">
              <th className="p-4 font-medium">Cliente</th>
              <th className="p-4 font-medium">Contato</th>
              <th className="p-4 font-medium text-right">{isWaiting ? 'Espera' : 'Duração'}</th>
              <th className="p-4 font-medium text-right">Protocolo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {tickets.map((ticket) => (
              <tr key={ticket.id} className="hover:bg-slate-700/30 transition-colors group">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isWaiting ? 'bg-amber-900/50 text-amber-400' : 'bg-sky-900/50 text-sky-400'}`}>
                      {ticket.clientName.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-slate-200">{ticket.clientName}</p>
                      {ticket.attendantName && (
                        <p className="text-xs text-slate-500">Atendente: {ticket.attendantName}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="p-4 text-slate-400 text-sm">
                   <div className="flex items-center gap-2">
                      {ticket.contact.includes('@') ? <Mail className="w-3 h-3"/> : <Phone className="w-3 h-3"/>}
                      {ticket.contact}
                   </div>
                </td>
                <td className="p-4 text-right">
                  <span className={`font-mono text-sm font-medium ${isWaiting ? 'text-amber-400' : 'text-slate-300'}`}>
                    {formatTime(isWaiting ? ticket.waitTimeSeconds : (ticket.durationSeconds || 0))}
                  </span>
                </td>
                <td className="p-4 text-right">
                   <div className="flex items-center justify-end gap-1 text-slate-500 font-mono text-sm group-hover:text-slate-300">
                      <Hash className="w-3 h-3" />
                      {ticket.protocol}
                   </div>
                </td>
              </tr>
            ))}
            {tickets.length === 0 && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-slate-500 italic">
                  Nenhum atendimento neste status.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
