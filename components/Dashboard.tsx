import React, { useMemo } from 'react';
import { Ticket, Attendant } from '../types';
import { StatCard } from './StatCard';
import { TicketList } from './TicketList';
import { Clock, Users, Headset, Timer, Bot, Activity } from 'lucide-react';
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
    const waiting = tickets.filter(t => t.status === 'waiting');
    const bot = tickets.filter(t => t.status === 'bot');
    const inService = tickets.filter(t => t.status === 'in_service');
    
    // Tempo médio de espera
    const totalWaitTime = waiting.reduce((acc, curr) => acc + curr.waitTimeSeconds, 0);
    const avgWait = waiting.length > 0 ? totalWaitTime / waiting.length : 0;

    // Tempo médio de atendimento (dos tickets ativos)
    const totalServiceTime = inService.reduce((acc, curr) => acc + (curr.durationSeconds || 0), 0);
    const avgService = inService.length > 0 ? totalServiceTime / inService.length : 0;

    return {
      waitingCount: waiting.length,
      botCount: bot.length,
      inServiceCount: inService.length,
      attendantCount: attendants.length,
      onlineAttendants: attendants.filter(a => a.status === 'online').length,
      avgWaitTimeSeconds: Math.round(avgWait),
      avgServiceTimeSeconds: Math.round(avgService),
      waitingList: waiting.sort((a, b) => b.waitTimeSeconds - a.waitTimeSeconds), // Longest wait first
      botList: bot.sort((a, b) => b.waitTimeSeconds - a.waitTimeSeconds),
      inServiceList: inService.sort((a, b) => (b.durationSeconds || 0) - (a.durationSeconds || 0)),
    };
  }, [tickets, attendants]);

  // Data for the chart
  const chartData = [
    { name: 'Em Espera', value: stats.waitingCount, color: '#f59e0b' },
    { name: 'Com Bot', value: stats.botCount, color: '#8b5cf6' },
    { name: 'Atendimento', value: stats.inServiceCount, color: '#0ea5e9' },
    { name: 'Atendentes', value: stats.attendantCount, color: '#10b981' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Top Header - Average Time Metrics */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 border border-slate-700 rounded-xl p-6 flex flex-col xl:flex-row items-center justify-between shadow-xl gap-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Activity className="w-6 h-6 text-sky-400" />
            Visão Geral da Operação
          </h2>
          <p className="text-slate-400 text-sm mt-1">Monitoramento em tempo real de filas e performance.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4 w-full xl:w-auto">
          {/* Card Tempo Espera */}
          <div className="flex-1 flex items-center gap-4 bg-slate-950/50 px-6 py-3 rounded-lg border border-slate-800 shadow-inner">
            <div className="p-2 bg-amber-500/10 rounded-full">
              <Timer className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-slate-400 font-medium uppercase text-xs tracking-wide">T.M. Espera</p>
              <p className={`text-2xl font-mono font-bold ${stats.avgWaitTimeSeconds > 600 ? 'text-red-500' : 'text-amber-400'}`}>
                {formatTime(stats.avgWaitTimeSeconds)}
              </p>
            </div>
          </div>

          {/* Card Tempo Atendimento */}
          <div className="flex-1 flex items-center gap-4 bg-slate-950/50 px-6 py-3 rounded-lg border border-slate-800 shadow-inner">
             <div className="p-2 bg-sky-500/10 rounded-full">
              <Headset className="w-5 h-5 text-sky-500" />
            </div>
            <div>
              <p className="text-slate-400 font-medium uppercase text-xs tracking-wide">T.M. Atendimento</p>
              <p className="text-2xl font-mono font-bold text-sky-400">
                {formatTime(stats.avgServiceTimeSeconds)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Em Espera"
          value={stats.waitingCount}
          icon={<Clock className="text-amber-500" />}
          colorClass="text-amber-500"
          trend="Aguardando Humano"
        />
        <StatCard
          title="Com o Bot"
          value={stats.botCount}
          icon={<Bot className="text-violet-500" />}
          colorClass="text-violet-500"
          trend="Retenção Automática"
        />
        <StatCard
          title="Em Atendimento"
          value={stats.inServiceCount}
          icon={<Headset className="text-sky-500" />}
          colorClass="text-sky-500"
          trend="Conversas ativas"
        />
        <StatCard
          title="Atendentes"
          value={stats.attendantCount}
          icon={<Users className="text-emerald-500" />}
          colorClass="text-emerald-500"
          trend={`${stats.onlineAttendants} Online agora`}
        />
      </div>

      {/* Content Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-auto min-h-[600px]">
        {/* Waiting List */}
        <div className="h-full">
           <TicketList 
             title="Em Espera" 
             tickets={stats.waitingList} 
             type="waiting" 
           />
        </div>

        {/* Bot List */}
        <div className="h-full">
           <TicketList 
             title="Com o Bot" 
             tickets={stats.botList} 
             type="bot" 
           />
        </div>

        {/* In Service List + Mini Chart */}
        <div className="h-full flex flex-col gap-6">
           <div className="flex-1">
             <TicketList 
               title="Em Atendimento" 
               tickets={stats.inServiceList} 
               type="in_service" 
             />
           </div>
           
           {/* Mini Chart Section */}
           <div className="h-48 bg-slate-800 border border-slate-700 rounded-xl p-4 hidden xl:block">
              <p className="text-xs uppercase text-slate-500 font-bold mb-2 tracking-wider">Volume por Status</p>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 20 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={90} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                    cursor={{fill: '#334155', opacity: 0.2}}
                  />
                  <Bar dataKey="value" barSize={16} radius={[0, 4, 4, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
           </div>
        </div>
      </div>
    </div>
  );
};