
import { Ticket, Attendant, AppConfig, TicketStatus } from '../types';

function calculateSeconds(dateStr?: string): number {
  if (!dateStr) return 0;
  const start = new Date(dateStr).getTime();
  const now = new Date().getTime();
  return Math.max(0, Math.floor((now - start) / 1000));
}

function determineTicketStatus(t: any, departmentName?: string): TicketStatus {
  const statusRaw = t.status || t.situacao;
  const s = statusRaw ? String(statusRaw).toUpperCase().trim() : '';

  // 1. FINALIZADO: Se o status for F ou códigos de finalização
  if (['F', '3', '4', 'FINALIZADO'].includes(s)) {
    return 'finished';
  }

  // 2. EM ATENDIMENTO: Se tem atendente atribuído E não está finalizado
  if (t.id_atendente || ['EA', 'EM ATENDIMENTO', '2'].includes(s)) {
    return 'in_service';
  }

  // 3. BOT ou ESPERA:
  if (['AG', 'AGUARDANDO', 'BOT', 'PS', 'E', 'EE', 'EM ESPERA', '1', 'T'].includes(s) || s === '') {
     if (s === 'PS') return 'bot';
     // Se tem departamento/setor, está na fila humana (Espera)
     const hasDept = departmentName && departmentName !== 'Geral' && departmentName !== 'Sem Setor';
     return hasDept ? 'waiting' : 'bot';
  }

  return 'finished'; 
}

export const opaService = {
  fetchData: async (config: AppConfig): Promise<{ tickets: Ticket[], attendants: Attendant[] }> => {
    if (!config.apiUrl || !config.apiToken) return { tickets: [], attendants: [] };
    try {
      const response = await fetch('/api/dashboard-data');
      if (!response.ok) return { tickets: [], attendants: [] };
      const data = await response.json();
      
      const rawTickets = data.tickets || [];
      const rawAttendants = data.attendants || [];
      const rawDepartments = data.departments || [];

      // Mapeamento de departamentos para busca rápida
      const deptMap = new Map();
      rawDepartments.forEach((d: any) => deptMap.set(String(d._id || d.id), d.nome));

      // Mapeamento de atendentes para busca rápida
      const attMap = new Map();
      const attendants: Attendant[] = rawAttendants.map((a: any) => {
        const id = String(a._id || a.id);
        const name = a.nome || a.name || 'Agente';
        attMap.set(id, name);
        return { id, name, status: 'online', activeChats: 0 };
      });

      const tickets: Ticket[] = rawTickets.map((t: any) => {
        const rawDept = t.setor || t.id_departamento || t.departamento;
        let deptName = '';
        if (typeof rawDept === 'object' && rawDept?.nome) deptName = rawDept.nome;
        else if (deptMap.has(String(rawDept))) deptName = deptMap.get(String(rawDept));

        const status = determineTicketStatus(t, deptName);
        const dateStart = t.data_inicio || t.data_criacao || t.date;
        const dateEnd = t.data_fechamento || t.updated_at;

        // Resolução do nome do cliente
        let clientName = 'Cliente';
        if (t.id_cliente?.nome) clientName = t.id_cliente.nome;
        else if (t.nome_cliente) clientName = t.nome_cliente;
        else if (t.cliente?.nome) clientName = t.cliente.nome;

        // Resolução do nome do atendente
        let attName = undefined;
        if (t.id_atendente?.nome) attName = t.id_atendente.nome;
        else if (attMap.has(String(t.id_atendente))) attName = attMap.get(String(t.id_atendente));

        return {
          id: String(t._id || t.id),
          protocol: t.protocolo || 'N/A',
          clientName,
          contact: '',
          waitTimeSeconds: calculateSeconds(dateStart),
          durationSeconds: calculateSeconds(dateStart),
          status,
          attendantName: attName,
          department: deptName || 'Geral',
          createdAt: dateStart,
          closedAt: dateEnd
        };
      });

      // Contagem de chats ativos para os atendentes
      tickets.forEach(t => {
        if (t.status === 'in_service' && t.attendantName) {
          const a = attendants.find(att => att.name === t.attendantName);
          if (a) a.activeChats++;
        }
      });

      return { tickets, attendants };
    } catch (e) {
      console.error("[OpaService] Erro fatal:", e);
      return { tickets: [], attendants: [] };
    }
  }
};
