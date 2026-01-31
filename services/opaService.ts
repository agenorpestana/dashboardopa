
import { Ticket, Attendant, AppConfig, TicketStatus, Department } from '../types';

function toTimestamp(dateVal: any): number {
  if (!dateVal) return 0;
  const strDate = String(dateVal).includes(' ') ? String(dateVal).replace(' ', 'T') : String(dateVal);
  const ts = Date.parse(strDate);
  return isNaN(ts) ? 0 : ts;
}

function calculateDuration(start: any, end?: any): number {
  const startTime = toTimestamp(start);
  if (startTime === 0) return 0;
  const endTime = end ? toTimestamp(end) : Date.now();
  const diff = Math.floor((endTime - startTime) / 1000);
  return diff > 0 ? diff : 0;
}

function formatPhone(value: string): string {
  const cleaned = value.replace(/\D/g, '');
  if (cleaned.startsWith('55') && cleaned.length >= 12) {
    const ddd = cleaned.substring(2, 4);
    const rest = cleaned.substring(4);
    if (rest.length === 9) return `(${ddd}) ${rest.substring(0, 5)}-${rest.substring(5)}`;
    else if (rest.length === 8) return `(${ddd}) ${rest.substring(0, 4)}-${rest.substring(4)}`;
  }
  if (cleaned.length === 11) return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 7)}-${cleaned.substring(7)}`;
  if (cleaned.length === 10) return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 6)}-${cleaned.substring(6)}`;
  return value;
}

function determineTicketStatus(t: any): TicketStatus {
  const s = String(t.status || '').toUpperCase().trim();
  if (s === 'F') return 'finished';
  if (s === 'EA' || s === 'E') return 'in_service';
  if (s === 'AG' || s === 'A') return 'waiting';
  if (s === 'PS' || s === 'BOT' || s === 'B' || s === 'T') return 'bot';
  if (t.id_atendente && s !== 'F') return 'in_service';
  return 'bot'; 
}

export const opaService = {
  fetchData: async (config: AppConfig): Promise<{ tickets: Ticket[], attendants: Attendant[], departments: Department[] }> => {
    if (!config.apiUrl) return { tickets: [], attendants: [], departments: [] };
    
    try {
      const response = await fetch('/api/dashboard-data');
      if (!response.ok) return { tickets: [], attendants: [], departments: [] };
      
      const result = await response.json();
      if (!result.success) return { tickets: [], attendants: [], departments: [] };
      
      const rawTickets = result.tickets || [];
      const rawAttendants = result.attendants || [];
      const rawDepts = result.departments || [];

      // Mapear Departamentos
      const departments: Department[] = rawDepts.map((d: any) => ({
        id: String(d._id || d.id),
        name: d.nome || 'Sem Nome'
      }));

      const deptMap = new Map(departments.map(d => [d.id, d.name]));

      const attendants: Attendant[] = rawAttendants.map((a: any) => ({
        id: String(a._id || a.id),
        name: a.nome || 'Agente',
        status: a.status === 'A' ? 'online' : 'offline',
        activeChats: 0
      }));

      const attendantNameMap = new Map(attendants.map(a => [a.id, a.name]));

      const tickets: Ticket[] = rawTickets.map((t: any) => {
        const status = determineTicketStatus(t);
        
        const attObj = t.id_atendente;
        const attId = typeof attObj === 'object' ? String(attObj?._id || '') : String(attObj || '');
        const attName = (typeof attObj === 'object' ? String(attObj?.nome || '') : '') || attendantNameMap.get(attId);

        let clientDisplayName = '';
        const rawName = t.cliente_nome || (typeof t.id_cliente === 'object' ? t.id_cliente?.nome : undefined);
        if (rawName && isNaN(Number(String(rawName).replace(/\s/g, '').replace(/\D/g, '')))) {
          clientDisplayName = String(rawName);
        } else {
          const phoneInfo = t.canal_cliente || rawName || '';
          const phonePart = String(phoneInfo).split('@')[0];
          clientDisplayName = phonePart.length > 5 ? formatPhone(phonePart) : 'Cliente';
        }

        const deptObj = t.id_motivo_atendimento || t.id_setor;
        const deptId = typeof deptObj === 'object' ? String(deptObj?._id || '') : String(deptObj || '');
        const deptName = (typeof deptObj === 'object' ? String(deptObj?.motivo || deptObj?.nome || '') : '') || deptMap.get(deptId) || 'Geral';

        return {
          id: String(t._id || t.id),
          protocol: String(t.protocolo || 'N/A'),
          clientName: clientDisplayName,
          contact: t.cliente_fone || t.canal_cliente || '',
          waitTimeSeconds: status === 'waiting' ? calculateDuration(t.date) : 0,
          durationSeconds: (status === 'in_service' || status === 'finished') ? calculateDuration(t.date, t.fim) : 0,
          status,
          attendantName: attName,
          department: deptName,
          departmentId: deptId,
          createdAt: t.date,
          closedAt: t.fim
        };
      });

      tickets.forEach(t => {
        if (t.status === 'in_service' && t.attendantName) {
          const a = attendants.find(att => att.name === t.attendantName);
          if (a) a.activeChats++;
        }
      });

      return { tickets, attendants, departments };
    } catch (e) {
      console.error("[OpaService] Error:", e);
      return { tickets: [], attendants: [], departments: [] };
    }
  }
};
