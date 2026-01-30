
import { Ticket, Attendant, AppConfig, TicketStatus } from '../types';

function calculateSeconds(dateStr?: string): number {
  if (!dateStr) return 0;
  const start = new Date(dateStr).getTime();
  const now = new Date().getTime();
  return Math.max(0, Math.floor((now - start) / 1000));
}

function determineTicketStatus(t: any, departmentName?: string): TicketStatus {
  const statusRaw = t.status || t.situacao;
  if (!statusRaw) return 'finished'; 
  const s = String(statusRaw).toUpperCase().trim();

  // Se tem atendente e não está finalizado, é in_service
  if (t.id_atendente && !['F', '3', '4', 'FINALIZADO'].includes(s)) {
    return 'in_service';
  }

  if (['EA', 'EM ATENDIMENTO', '2'].includes(s)) return 'in_service';
  
  if (['AG', 'AGUARDANDO', 'BOT', 'PS', 'E', 'EE', 'EM ESPERA', '1', 'T'].includes(s)) {
     if (s === 'PS') return 'bot';
     const hasDept = departmentName && departmentName !== 'Geral' && departmentName !== 'Sem Setor';
     return hasDept ? 'waiting' : 'bot';
  }

  if (['F', 'FINALIZADO', '3', '4'].includes(s)) return 'finished';
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

      const deptMap = new Map();
      rawDepartments.forEach((d: any) => deptMap.set(String(d._id || d.id), d.nome));

      const attMap = new Map();
      const attendants: Attendant[] = rawAttendants.map((a: any) => {
        const id = String(a._id || a.id);
        const name = a.nome || a.name || 'Agente';
        attMap.set(id, name);
        return { id, name, status: 'online', activeChats: 0 };
      });

      const tickets: Ticket[] = rawTickets.map((t: any) => {
        const rawDept = t.setor || t.id_departamento;
        let deptName = '';
        if (typeof rawDept === 'object') deptName = rawDept.nome;
        else if (deptMap.has(String(rawDept))) deptName = deptMap.get(String(rawDept));

        const status = determineTicketStatus(t, deptName);
        const dateStart = t.data_inicio || t.data_criacao || t.date;
        const dateEnd = t.data_fechamento || t.updated_at;

        let clientName = 'Cliente';
        if (t.id_cliente?.nome) clientName = t.id_cliente.nome;
        else if (t.nome_cliente) clientName = t.nome_cliente;
        else if (t.cliente?.nome) clientName = t.cliente.nome;

        let attName = undefined;
        if (t.id_atendente?.nome) attName = t.id_atendente.nome;
        else if (attMap.has(String(t.id_atendente))) attName = attMap.get(String(t.id_atendente));

        return {
          id: String(t._id || t.id),
          protocol: t.protocolo || 'N/A',
          clientName,
          contact: '',
          waitTimeSeconds: calculateSeconds(dateStart),
          durationSeconds: (status === 'in_service' || status === 'finished') ? calculateSeconds(dateStart) : 0,
          status,
          attendantName: attName,
          department: deptName || 'Geral',
          createdAt: dateStart,
          closedAt: dateEnd
        };
      });

      tickets.forEach(t => {
        if (t.status === 'in_service' && t.attendantName) {
          const a = attendants.find(att => att.name === t.attendantName);
          if (a) a.activeChats++;
        }
      });

      return { tickets, attendants };
    } catch (e) {
      console.error(e);
      return { tickets: [], attendants: [] };
    }
  }
};
