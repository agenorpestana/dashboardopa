
import React, { useMemo } from 'react';
import { Ticket, Attendant } from '../types';
import { StatCard } from './StatCard';
import { TicketList } from './TicketList';
import { Clock, Users, Headset, Timer, Bot, Activity, CalendarCheck, CheckCircle2, Trophy } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface DashboardProps {
  tickets: Ticket[];
  attendants: Attendant[];
}

const formatTime = (seconds: number) => {
  if (typeof seconds !== 'number' || seconds <= 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const Dashboard: React.FC<DashboardProps> = ({ tickets, attendants }) => {
  const stats = useMemo(() => {
    const now = new Date();
    // Offset para pegar a data local correta
    const offset = now.getTimezoneOffset() * 60000;
    const todayStr = new Date(now.getTime() - offset).toISOString().split('T')[0];
    
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const waiting = tickets.filter(t => t.status === 'waiting');
    const bot = tickets.filter(t => t.status === 'bot');
    const inService = tickets.filter(t => t.status === 'in_service');
    const finished = tickets.filter(t => t.status === 'finished');

    const finishedToday = finished.filter(t => {
      const dateStr = t.closedAt || t.createdAt;
      return dateStr && String(dateStr).startsWith(todayStr.substring(0, 10));
    });

    const finishedMonth = finished.filter(t => {
      const dateStr = t.closedAt || t.createdAt;
      if (!dateStr) return false;
      const d = new Date(String(dateStr).replace(' ', 'T'));
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const validFinished = finished.filter(t => (t.durationSeconds || 0) > 0);
    const totalTMA = validFinished.reduce((acc, curr) => acc + (curr.durationSeconds || 0), 0);
    const avgService = validFinished.length > 0 ? totalTMA / validFinished.length : 0;

    const totalWait = waiting.reduce((acc, curr) => acc + curr.waitTimeSeconds, 0);
    const avgWait = waiting.length > 0 ? totalWait / waiting.length : 0;

    const rankingMap: Record<string, number> = {};
    finishedMonth.forEach(t => {
       if (t.attendantName) rankingMap[t.attendantName] = (rankingMap[t.attendantName] || 0) + 1;
    });
    const ranking = Object.entries(rankingMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      waiting, bot, inService,
      onlineCount: attendants.length,
      avgWait: Math.round(avgWait),
      avgService: Math.round(avgService),
      finishedToday: finishedToday.length,
      finishedMonth: finishedMonth.length,
      ranking
    };
  }, [tickets, attendants]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-5 flex flex-col xl:flex-row items-center justify-between shadow-xl gap-5">
        <div className="flex items-center gap-4">
          <div className="bg-sky-500/10 p-3 rounded-lg">
            <Activity className="w-6 h-6 text-sky-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Monitoramento em Tempo Real</h2>
            <p className="text-slate-400 text-sm">Resumo da operação Opa Suite</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full xl:w-auto">
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 flex flex-col items-center min-w-[130px]">
            <p className="text-slate-500 text-[10px] uppercase font-bold mb-1">Média Espera</p>
            <div className="flex items-center gap-2">
              <Timer className="w-4 h-4 text-amber-500" />
              <p className="text-lg font-mono font-bold text-amber-400">{formatTime(stats.avgWait)}</p>
            </div>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 flex flex-col items-center min-w-[130px]">
            <p className="text-slate-500 text-[10px] uppercase font-bold mb-1">Média Conversa</p>
            <div className="flex items-center gap-2">
              <Headset className="w-4 h-4 text-sky-500" />
              <p className="text-lg font-mono font-bold text-sky-400">{formatTime(stats.avgService)}</p>
            </div>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 flex flex-col items-center min-w-[130px]">
            <p className="text-slate-500 text-[10px] uppercase font-bold mb-1">Finalizados (Hoje)</p>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <p className="text-lg font-mono font-bold text-emerald-400">{stats.finishedToday}</p>
            </div>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 flex flex-col items-center min-w-[130px]">
            <p className="text-slate-500 text-[10px] uppercase font-bold mb-1">Finalizados (Mês)</p>
            <div className="flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-violet-400" />
              <p className="text-lg font-mono font-bold text-violet-400">{stats.finishedMonth}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Fila de Espera" value={stats.waiting.length} icon={<Clock className="text-amber-500" />} colorClass="text-amber-500" />
        <StatCard title="Em Triagem" value={stats.bot.length} icon={<Bot className="text-violet-500" />} colorClass="text-violet-500" />
        <StatCard title="Atendimentos" value={stats.inService.length} icon={<Headset className="text-sky-500" />} colorClass="text-sky-500" />
        <StatCard title="Atendentes Online" value={stats.onlineCount} icon={<Users className="text-emerald-500" />} colorClass="text-emerald-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <TicketList title="Aguardando Setor" tickets={stats.waiting} type="waiting" />
        <TicketList title="Em Bot / Triagem" tickets={stats.bot} type="bot" />
        <TicketList title="Conversas Ativas" tickets={stats.inService} type="in_service" />
      </div>
    </div>
  );
};
