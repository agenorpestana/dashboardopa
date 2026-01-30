
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
  let accent = 'border-slate-500';
  let badge = 'bg-slate-500/10 text-slate-500';
  let Icon = User;

  if (type === 'waiting') { accent = 'border-amber-500'; badge = 'bg-amber-500/10 text-amber-500'; Icon = Clock; }
  else if (type === 'bot') { accent = 'border-violet-500'; badge = 'bg-violet-500/10 text-violet-500'; Icon = Bot; }
  else if (type === 'in_service') { accent = 'border-sky-500'; badge = 'bg-sky-500/10 text-sky-500'; Icon = User; }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden flex flex-col shadow-lg">
      <div className={`p-4 border-b border-slate-700 bg-slate-800/50 flex justify-between items-center border-l-4 ${accent}`}>
        <h3 className="font-semibold text-sm text-white uppercase tracking-wider flex items-center gap-2"><Icon className="w-4 h-4" /> {title}</h3>
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${badge}`}>{tickets.length}</span>
      </div>
      
      <div className="overflow-y-auto h-[320px] custom-scrollbar">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-900/50 text-slate-500 text-[10px] uppercase sticky top-0 z-10">
              <th className="p-3">Cliente</th> 
              <th className="p-3 text-right">{type === 'in_service' ? 'Duração' : 'Espera'}</th>
              <th className="p-3 text-right">Protocolo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {tickets.map((t) => (
              <tr key={t.id} className="hover:bg-slate-700/20 group transition-colors">
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-[9px] font-bold text-slate-300">{t.clientName.substring(0,2).toUpperCase()}</div>
                    <div className="min-w-0">
                      <p className="font-medium text-xs text-slate-200 truncate">{t.clientName}</p>
                      <p className="text-[9px] text-slate-500 truncate">{type === 'in_service' ? t.attendantName : t.department}</p>
                    </div>
                  </div>
                </td>
                <td className="p-3 text-right font-mono text-xs text-slate-400">{formatTime(type === 'in_service' ? t.durationSeconds : t.waitTimeSeconds)}</td>
                <td className="p-3 text-right font-mono text-[10px] text-slate-600 group-hover:text-slate-400">{t.protocol}</td>
              </tr>
            ))}
            {tickets.length === 0 && <tr><td colSpan={3} className="p-10 text-center text-slate-500 text-xs italic">Vazio</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};
