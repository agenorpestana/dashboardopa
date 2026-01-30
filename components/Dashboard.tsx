
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
  if (!seconds || seconds <= 0) return "00:00:00";
  // Limite de 100 horas para evitar bugs visuais de TMA
  if (seconds > 360000) seconds = 360000;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const Dashboard: React.FC<DashboardProps> = ({ tickets, attendants }) => {
  const stats = useMemo(() => {
    const now = new Date();
    const todayStr = now.toLocaleDateString();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const waiting = tickets.filter(t => t.status === 'waiting');
    const bot = tickets.filter(t => t.status === 'bot');
    const inService = tickets.filter(t => t.status === 'in_service');
    const finished = tickets.filter(t => t.status === 'finished');

    // Filtro Robusto de Finalizados hoje
    const finishedToday = finished.filter(t => {
      const dStr = t.closedAt || t.createdAt;
      if (!dStr) return false;
      return new Date(dStr).toLocaleDateString() === todayStr;
    });

    const finishedMonth = finished.filter(t => {
      const dStr = t.closedAt || t.createdAt;
      if (!dStr) return false;
      const d = new Date(dStr);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    // TMA: Média dos tickets finalizados (ignora outliers acima de 24h)
    const validServiceDurations = finished
      .map(t => t.durationSeconds || 0)
      .filter(d => d > 0 && d < 86400);

    const totalTMA = validServiceDurations.reduce((acc, curr) => acc + curr, 0);
    const avgService = validServiceDurations.length > 0 ? totalTMA / validServiceDurations.length : 0;

    // TME: Tempo Médio de Espera (tickets esperando agora)
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
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 border border-slate-700 rounded-xl p-5 flex flex-col xl:flex-row items-center justify-between shadow-xl gap-5">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2"><Activity className="w-6 h-6 text-sky-400" /> Dashboard Operacional</h2>
          <p className="text-slate-400 text-sm">Dados em tempo real + histórico de 30 dias.</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full xl:w-auto">
          <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800 min-w-[150px]">
            <p className="text-slate-500 text-[10px] uppercase font-bold mb-1">T.M. Espera</p>
            <div className="flex items-center gap-2"><Timer className="w-4 h-4 text-amber-500" /><p className="text-lg font-mono font-bold text-amber-400">{formatTime(stats.avgWait)}</p></div>
          </div>
          <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800 min-w-[150px]">
            <p className="text-slate-500 text-[10px] uppercase font-bold mb-1">T.M. Atendimento</p>
            <div className="flex items-center gap-2"><Headset className="w-4 h-4 text-sky-500" /><p className="text-lg font-mono font-bold text-sky-400">{formatTime(stats.avgService)}</p></div>
          </div>
          <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800 min-w-[150px]">
            <p className="text-slate-500 text-[10px] uppercase font-bold mb-1">Finalizados (Dia)</p>
            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /><p className="text-lg font-mono font-bold text-emerald-400">{stats.finishedToday}</p></div>
          </div>
          <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800 min-w-[150px]">
            <p className="text-slate-500 text-[10px] uppercase font-bold mb-1">Finalizados (Mês)</p>
            <div className="flex items-center gap-2"><CalendarCheck className="w-4 h-4 text-violet-400" /><p className="text-lg font-mono font-bold text-violet-400">{stats.finishedMonth}</p></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Em Espera" value={stats.waiting.length} icon={<Clock className="text-amber-500" />} colorClass="text-amber-500" />
        <StatCard title="Com o Bot" value={stats.bot.length} icon={<Bot className="text-violet-500" />} colorClass="text-violet-500" />
        <StatCard title="Em Atendimento" value={stats.inService.length} icon={<Headset className="text-sky-500" />} colorClass="text-sky-500" />
        <StatCard title="Atendentes" value={stats.onlineCount} icon={<Users className="text-emerald-500" />} colorClass="text-emerald-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <TicketList title="Em Espera" tickets={stats.waiting} type="waiting" />
        <TicketList title="Com o Bot" tickets={stats.bot} type="bot" />
        <TicketList title="Em Atendimento" tickets={stats.inService} type="in_service" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg h-64">
           <p className="text-xs uppercase text-slate-500 font-bold mb-4 flex items-center gap-2"><Activity className="w-4 h-4" /> Distribuição de Volume</p>
           <ResponsiveContainer width="100%" height="80%">
             <BarChart data={[
               {name:'Espera',v:stats.waiting.length,c:'#f59e0b'},
               {name:'Bot',v:stats.bot.length,c:'#8b5cf6'},
               {name:'Ativos',v:stats.inService.length,c:'#0ea5e9'}
             ]} layout="vertical">
               <XAxis type="number" hide />
               <YAxis dataKey="name" type="category" width={80} tick={{fill:'#94a3b8',fontSize:12}} axisLine={false} tickLine={false} />
               <Tooltip cursor={{fill:'transparent'}} contentStyle={{backgroundColor:'#1e293b',border:'none',borderRadius:'8px'}} />
               <Bar dataKey="v" barSize={24} radius={[0,4,4,0]}>
                 {[
                   {c:'#f59e0b'},{c:'#8b5cf6'},{c:'#0ea5e9'}
                 ].map((e,i)=><Cell key={i} fill={e.c}/>)}
               </Bar>
             </BarChart>
           </ResponsiveContainer>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg h-64 flex flex-col">
           <p className="text-xs uppercase text-slate-500 font-bold mb-4 flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-500" /> Ranking Top 5 (Mês)</p>
           <div className="flex-1 space-y-2 overflow-y-auto pr-2 custom-scrollbar">
              {stats.ranking.length > 0 ? stats.ranking.map((item, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 rounded bg-slate-900/30 border border-slate-700/50 hover:border-slate-600 transition-colors">
                   <div className="flex items-center gap-3">
                     <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${i === 0 ? 'bg-amber-500 text-amber-950' : 'bg-slate-700 text-slate-300'}`}>{i+1}</span>
                     <span className="text-sm text-slate-200">{item.name}</span>
                   </div>
                   <span className="text-xs font-mono text-emerald-400 font-bold">{item.count} concl.</span>
                </div>
              )) : (
                <div className="flex-1 flex items-center justify-center text-slate-500 italic text-sm">Sem dados de finalização</div>
              )}
           </div>
        </div>
      </div>
    </div>
  );
};
