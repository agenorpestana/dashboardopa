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
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const Dashboard: React.FC<DashboardProps> = ({ tickets, attendants }) => {
  
  const stats = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const waiting = tickets.filter(t => t.status === 'waiting');
    const bot = tickets.filter(t => t.status === 'bot');
    const inService = tickets.filter(t => t.status === 'in_service');
    const finished = tickets.filter(t => t.status === 'finished');
    
    // Totais Históricos
    const finishedToday = finished.filter(t => {
       const dateStr = t.createdAt ? new Date(t.createdAt).toISOString().split('T')[0] : '';
       return dateStr === todayStr;
    }).length;

    const finishedMonth = finished.filter(t => {
       const d = t.createdAt ? new Date(t.createdAt) : null;
       return d && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).length;

    // Tempo médio de espera
    const totalWaitTime = waiting.reduce((acc, curr) => acc + curr.waitTimeSeconds, 0);
    const avgWait = waiting.length > 0 ? totalWaitTime / waiting.length : 0;

    // Tempo médio de atendimento (dos tickets ativos)
    const totalServiceTime = inService.reduce((acc, curr) => acc + (curr.durationSeconds || 0), 0);
    const avgService = inService.length > 0 ? totalServiceTime / inService.length : 0;

    // Ranking Top 5 Atendentes
    const rankingMap: Record<string, number> = {};
    finished.forEach(t => {
       if (t.attendantName) {
          rankingMap[t.attendantName] = (rankingMap[t.attendantName] || 0) + 1;
       }
    });
    const ranking = Object.entries(rankingMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      waitingCount: waiting.length,
      botCount: bot.length,
      inServiceCount: inService.length,
      attendantCount: attendants.length,
      onlineAttendants: attendants.filter(a => a.status === 'online').length,
      avgWaitTimeSeconds: Math.round(avgWait),
      avgServiceTimeSeconds: Math.round(avgService),
      finishedToday,
      finishedMonth,
      ranking,
      waitingList: waiting.sort((a, b) => b.waitTimeSeconds - a.waitTimeSeconds),
      botList: bot.sort((a, b) => b.waitTimeSeconds - a.waitTimeSeconds),
      inServiceList: inService.sort((a, b) => (b.durationSeconds || 0) - (a.durationSeconds || 0)),
    };
  }, [tickets, attendants]);

  const chartData = [
    { name: 'Em Espera', value: stats.waitingCount, color: '#f59e0b' },
    { name: 'Com Bot', value: stats.botCount, color: '#8b5cf6' },
    { name: 'Atendimento', value: stats.inServiceCount, color: '#0ea5e9' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      
      {/* Top Header - Performance Metrics */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 border border-slate-700 rounded-xl p-5 flex flex-col xl:flex-row items-center justify-between shadow-xl gap-5">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Activity className="w-6 h-6 text-sky-400" />
            Performance da Operação
          </h2>
          <p className="text-slate-400 text-sm mt-0.5">KPIs de produtividade e agilidade.</p>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full xl:w-auto">
          {/* T.M. Espera */}
          <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800 flex flex-col justify-center min-w-[140px]">
            <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-1">T.M. Espera</p>
            <div className="flex items-center gap-2">
               <Timer className="w-4 h-4 text-amber-500" />
               <p className={`text-lg font-mono font-bold ${stats.avgWaitTimeSeconds > 600 ? 'text-red-500' : 'text-amber-400'}`}>
                {formatTime(stats.avgWaitTimeSeconds)}
              </p>
            </div>
          </div>

          {/* T.M. Atendimento */}
          <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800 flex flex-col justify-center min-w-[140px]">
            <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-1">T.M. Atendimento</p>
            <div className="flex items-center gap-2">
               <Headset className="w-4 h-4 text-sky-500" />
               <p className="text-lg font-mono font-bold text-sky-400">
                {formatTime(stats.avgServiceTimeSeconds)}
              </p>
            </div>
          </div>

          {/* Concluídos Dia */}
          <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800 flex flex-col justify-center min-w-[140px]">
            <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-1">Finalizados (Dia)</p>
            <div className="flex items-center gap-2">
               <CheckCircle2 className="w-4 h-4 text-emerald-500" />
               <p className="text-lg font-mono font-bold text-emerald-400">{stats.finishedToday}</p>
            </div>
          </div>

          {/* Concluídos Mês */}
          <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800 flex flex-col justify-center min-w-[140px]">
            <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-1">Finalizados (Mês)</p>
            <div className="flex items-center gap-2">
               <CalendarCheck className="w-4 h-4 text-violet-400" />
               <p className="text-lg font-mono font-bold text-violet-400">{stats.finishedMonth}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Em Espera" value={stats.waitingCount} icon={<Clock className="text-amber-500" />} colorClass="text-amber-500" trend="Fila humana" />
        <StatCard title="Com o Bot" value={stats.botCount} icon={<Bot className="text-violet-500" />} colorClass="text-violet-500" trend="Automação" />
        <StatCard title="Em Atendimento" value={stats.inServiceCount} icon={<Headset className="text-sky-500" />} colorClass="text-sky-500" trend="Conversas ativas" />
        <StatCard title="Atendentes" value={stats.attendantCount} icon={<Users className="text-emerald-500" />} colorClass="text-emerald-500" trend={`${stats.onlineAttendants} Online`} />
      </div>

      {/* Content Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <TicketList title="Em Espera" tickets={stats.waitingList} type="waiting" />
        <TicketList title="Com o Bot" tickets={stats.botList} type="bot" />
        <TicketList title="Em Atendimento" tickets={stats.inServiceList} type="in_service" />
      </div>

      {/* Footer Charts and Ranking */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Volume por Status Chart */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg h-64">
           <p className="text-xs uppercase text-slate-500 font-bold mb-4 tracking-wider flex items-center gap-2">
             <Activity className="w-4 h-4" /> Volume por Status
           </p>
           <ResponsiveContainer width="100%" height="80%">
             <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 30 }}>
               <XAxis type="number" hide />
               <YAxis dataKey="name" type="category" width={100} tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
               <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
               <Bar dataKey="value" barSize={20} radius={[0, 4, 4, 0]}>
                 {chartData.map((entry, index) => (
                   <Cell key={`cell-${index}`} fill={entry.color} />
                 ))}
               </Bar>
             </BarChart>
           </ResponsiveContainer>
        </div>

        {/* Ranking Top 5 Atendentes */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg h-64 overflow-hidden flex flex-col">
           <p className="text-xs uppercase text-slate-500 font-bold mb-4 tracking-wider flex items-center gap-2">
             <Trophy className="w-4 h-4 text-amber-500" /> Ranking Top 5 (Mês)
           </p>
           <div className="flex-1 space-y-3 overflow-y-auto pr-2 custom-scrollbar">
              {stats.ranking.length > 0 ? stats.ranking.map((item, index) => (
                <div key={index} className="flex items-center justify-between p-2 rounded-lg bg-slate-900/30 border border-slate-700/50">
                   <div className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        index === 0 ? 'bg-amber-500 text-amber-950' : 
                        index === 1 ? 'bg-slate-300 text-slate-900' : 
                        index === 2 ? 'bg-amber-700 text-amber-100' : 'bg-slate-700 text-slate-300'
                      }`}>
                        {index + 1}º
                      </span>
                      <span className="text-sm font-medium text-slate-200">{item.name}</span>
                   </div>
                   <span className="text-xs font-mono text-emerald-400 font-bold">{item.count} atendimentos</span>
                </div>
              )) : (
                <p className="text-slate-500 italic text-center py-10">Nenhum dado de finalização encontrado.</p>
              )}
           </div>
        </div>
      </div>
    </div>
  );
};