
import React, { useMemo, useEffect } from 'react';
import { Ticket, Attendant, Department } from '../types';
import { StatCard } from './StatCard';
import { TicketList } from './TicketList';
import { Clock, Headset, Timer, Bot, Activity, CalendarCheck, CheckCircle2, BarChart3, Star, ListFilter } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface DashboardProps {
  tickets: Ticket[];
  attendants: Attendant[];
  departments: Department[];
  periods: any[];
}

const formatTime = (seconds: number) => {
  if (typeof seconds !== 'number' || seconds <= 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const Dashboard: React.FC<DashboardProps> = ({ tickets, attendants, departments, periods }) => {
  const stats = useMemo(() => {
    const now = new Date();
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

    const deptSummary: Record<string, { setor: string, id_setor: string, bot: number, aguardando: number }> = {};
    const detailedLogs: any[] = [];

    tickets.forEach(t => {
      if (t.status === 'bot' || t.status === 'waiting') {
        const key = t.departmentId || 'unassigned';
        if (!deptSummary[key]) {
          deptSummary[key] = { setor: t.department || 'Desconhecido', id_setor: t.departmentId || 'N/A', bot: 0, aguardando: 0 };
        }
        if (t.status === 'bot') deptSummary[key].bot++;
        if (t.status === 'waiting') deptSummary[key].aguardando++;

        detailedLogs.push({
            protocolo: t.protocol,
            cliente: t.clientName,
            status: t.status === 'bot' ? 'EM BOT' : 'AGUARDANDO',
            id_setor: t.departmentId,
            setor: t.department
        });
      }
    });

    const rankingMap: Record<string, number> = {};
    finishedMonth.forEach(t => {
       if (t.attendantName) {
         rankingMap[t.attendantName] = (rankingMap[t.attendantName] || 0) + 1;
       }
    });
    
    const ranking = Object.entries(rankingMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topTechnician = ranking.length > 0 ? ranking[0] : null;

    const validFinished = finished.filter(t => (t.durationSeconds || 0) > 0);
    const totalTMA = validFinished.reduce((acc, curr) => acc + (curr.durationSeconds || 0), 0);
    const avgService = validFinished.length > 0 ? totalTMA / validFinished.length : 0;

    const totalWait = waiting.reduce((acc, curr) => acc + curr.waitTimeSeconds, 0);
    const avgWait = waiting.length > 0 ? totalWait / waiting.length : 0;

    return {
      waiting, bot, inService,
      avgWait: Math.round(avgWait),
      avgService: Math.round(avgService),
      finishedToday: finishedToday.length,
      finishedMonth: finishedMonth.length,
      ranking,
      topTechnician,
      departmentSummary: Object.values(deptSummary),
      detailedLogs: detailedLogs.sort((a, b) => a.id_setor.localeCompare(b.id_setor))
    };
  }, [tickets, attendants]);

  useEffect(() => {
    console.clear();
    console.group("📂 OPA SUITE - MASTER LOG (F12)");
    
    if (departments.length > 0) {
      console.log("%c--- LISTA COMPLETA DE SETORES (MASTER LIST) ---", "color: #38bdf8; font-weight: bold;");
      console.table(departments.map(d => ({ "ID DO SETOR": d.id, "NOME DO SETOR": d.name })));
    }

    if (periods && periods.length > 0) {
      console.log("%c--- LISTA DE PERÍODOS CONFIGURADOS ---", "color: #a78bfa; font-weight: bold;");
      console.table(periods.map(p => ({ "ID PERÍODO": p._id, "NOME": p.nome, "ATIVO": p.ativo })));
    }

    if (stats.detailedLogs.length > 0) {
      console.log("%c--- RESUMO DE TRIAGEM ATIVA ---", "color: #fbbf24; font-weight: bold;");
      console.table(stats.departmentSummary);
      console.log("%c--- CHAMADOS EM TRIAGEM DETALHADOS ---", "color: #fbbf24; font-weight: bold;");
      console.table(stats.detailedLogs);
    }

    console.log("%cDICA: O filtro de finalizados agora busca desde o dia 01 com limite de 3000 registros.", "color: #10b981; font-weight: bold;");
    console.groupEnd();
  }, [departments, periods, stats.detailedLogs, stats.departmentSummary]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-5 flex flex-col xl:flex-row items-center justify-between shadow-xl gap-5">
        <div className="flex items-center gap-4">
          <div className="bg-sky-500/10 p-3 rounded-lg">
            <Activity className="w-6 h-6 text-sky-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Painel de Atendimento</h2>
            <p className="text-slate-400 text-sm">Dados reais filtrados (Sem Robôs)</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full xl:w-auto">
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 flex flex-col items-center min-w-[130px]">
            <p className="text-slate-500 text-[10px] uppercase font-bold mb-1">Espera Média</p>
            <div className="flex items-center gap-2">
              <Timer className="w-4 h-4 text-amber-500" />
              <p className="text-lg font-mono font-bold text-amber-400">{formatTime(stats.avgWait)}</p>
            </div>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 flex flex-col items-center min-w-[130px]">
            <p className="text-slate-500 text-[10px] uppercase font-bold mb-1">Conversa Média</p>
            <div className="flex items-center gap-2">
              <Headset className="w-4 h-4 text-sky-500" />
              <p className="text-lg font-mono font-bold text-sky-400">{formatTime(stats.avgService)}</p>
            </div>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 flex flex-col items-center min-w-[130px]">
            <p className="text-slate-500 text-[10px] uppercase font-bold mb-1">Hoje</p>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <p className="text-lg font-mono font-bold text-emerald-400">{stats.finishedToday}</p>
            </div>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 flex flex-col items-center min-w-[130px]">
            <p className="text-slate-500 text-[10px] uppercase font-bold mb-1">Mês Atual</p>
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
        <StatCard 
          title="Técnico Destaque" 
          value={stats.topTechnician ? stats.topTechnician.count : 0} 
          icon={<Star className="text-amber-400" />} 
          colorClass="text-amber-400"
          trend={stats.topTechnician ? stats.topTechnician.name : 'Nenhum finalizado'}
        />
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-sky-500" />
            Ranking de Finalizações (Mês)
          </h3>
          <div className="text-[10px] text-slate-500 uppercase flex items-center gap-2">
            <ListFilter className="w-3 h-3" />
            Master List de IDs disponível no Console (F12)
          </div>
        </div>
        
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.ranking} layout="vertical" margin={{ left: 20, right: 30 }}>
              <XAxis type="number" hide />
              <YAxis 
                dataKey="name" 
                type="category" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                width={120}
              />
              <Tooltip 
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#fff' }}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={24}>
                {stats.ranking.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={index === 0 ? '#38bdf8' : '#0ea5e9'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <TicketList title="Aguardando Setor" tickets={stats.waiting} type="waiting" />
        <TicketList title="Em Bot / Triagem" tickets={stats.bot} type="bot" />
        <TicketList title="Conversas Ativas" tickets={stats.inService} type="in_service" />
      </div>
    </div>
  );
};
