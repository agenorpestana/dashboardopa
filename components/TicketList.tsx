import React from 'react';
import { Ticket } from '../types';
import { Clock, User, Hash, Bot } from 'lucide-react';

interface TicketListProps {
  title: string;
  tickets: Ticket[];
  type: 'waiting' | 'in_service' | 'bot';
}

const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const TicketList: React.FC<TicketListProps> = ({ title, tickets, type }) => {
  let accentColor = 'border-slate-500';
  let badgeColor = 'bg-slate-500/10 text-slate-500';
  let Icon = User;
  let timerColor = 'text-slate-300';
  let avatarColor = 'bg-slate-900/50 text-slate-400';

  if (type === 'waiting') {
    accentColor = 'border-amber-500';
    badgeColor = 'bg-amber-500/10 text-amber-500';
    Icon = Clock;
    timerColor = 'text-amber-400';
    avatarColor = 'bg-amber-900/50 text-amber-400';
  } else if (type === 'bot') {
    accentColor = 'border-violet-500';
    badgeColor = 'bg-violet-500/10 text-violet-500';
    Icon = Bot;
    timerColor = 'text-violet-400';
    avatarColor = 'bg-violet-900/50 text-violet-400';
  } else if (type === 'in_service') {
    accentColor = 'border-sky-500';
    badgeColor = 'bg-sky-500/10 text-sky-500';
    Icon = User;
    timerColor = 'text-slate-300';
    avatarColor = 'bg-sky-900/50 text-sky-400';
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden flex flex-col h-full shadow-lg min-h-[500px]">
      <div className={`p-4 border-b border-slate-700 bg-slate-800/50 flex justify-between items-center border-l-4 ${accentColor}`}>
        <h3 className="font-semibold text-base text-white uppercase tracking-wide flex items-center gap-2">
          <Icon className={`w-4 h-4 ${badgeColor.split(' ')[1]}`} />
          {title}
        </h3>
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${badgeColor}`}>
          {tickets.length}
        </span>
      </div>
      
      {/* Container com altura fixa para aproximadamente 6-7 linhas + Scrollbar */}
      <div className="overflow-y-auto max-h-[420px] custom-scrollbar flex-1">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-900/50 text-slate-500 text-[10px] uppercase tracking-wider sticky top-0 z-10">
              <th className="p-3 font-medium">Cliente</th> 
              <th className="p-3 font-medium text-right">{type === 'in_service' ? 'Duração' : 'Espera'}</th>
              <th className="p-3 font-medium text-right">Protocolo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {tickets.map((ticket) => (
              <tr key={ticket.id} className="hover:bg-slate-700/20 transition-colors group">
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${avatarColor}`}>
                      {ticket.clientName.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-slate-200 truncate pr-2 leading-tight">{ticket.clientName}</p>
                      {ticket.attendantName && type === 'in_service' && (
                        <p className="text-[10px] text-slate-500 truncate">Agent: {ticket.attendantName}</p>
                      )}
                      {type === 'waiting' && ticket.department && (
                         <p className="text-[10px] text-slate-500 truncate">{ticket.department}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  <span className={`font-mono text-xs font-medium ${timerColor}`}>
                    {formatTime(type === 'in_service' ? (ticket.durationSeconds || 0) : ticket.waitTimeSeconds)}
                  </span>
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                   <div className="flex items-center justify-end gap-1 text-slate-500 font-mono text-[10px] group-hover:text-slate-300">
                      <Hash className="w-2.5 h-2.5" />
                      {ticket.protocol}
                   </div>
                </td>
              </tr>
            ))}
            {tickets.length === 0 && (
              <tr>
                <td colSpan={3} className="p-10 text-center text-slate-500 text-sm italic">
                  Vazio
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};