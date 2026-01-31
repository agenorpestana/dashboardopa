
import { Ticket, Attendant, AppConfig, TicketStatus } from '../types';

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
  // Formato Brasil com DDI (55739...)
  if (cleaned.startsWith('55') && cleaned.length >= 12) {
    const ddd = cleaned.substring(2, 4);
    const part1 = cleaned.length === 13 ? cleaned.substring(4, 9) : cleaned.substring(4, 8);
    const part2 = cleaned.length === 13 ? cleaned.substring(9) : cleaned.substring(8);
    return `(${ddd}) ${part1}-${part2}`;
  }
  // Formato local sem DDI (739...)
  if (cleaned.length >= 10 && cleaned.length <= 11) {
    const ddd = cleaned.substring(0, 2);
    const part1 = cleaned.length === 11 ? cleaned.substring(2, 7) : cleaned.substring(2, 6);
    const part2 = cleaned.length === 11 ? cleaned.substring(7) : cleaned.substring(6);
    return `(${ddd}) ${part1}-${part2}`;
  }
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
  fetchData: async (config: AppConfig): Promise<{ tickets: Ticket[], attendants: Attendant[] }> => {
    if (!config.apiUrl) return { tickets: [], attendants: [] };
    
    try {
      const response = await fetch('/api/dashboard-data');
      if (!response.ok) return { tickets: [], attendants: [] };
      
      const result = await response.json();
      if (!result.success) {
        console.error("[OpaService] API Error:", result.error);
        return { tickets: [], attendants: [] };
      }
      
      const rawTickets = result.tickets || [];
      const rawAttendants = result.attendants || [];

      const attendants: Attendant[] = rawAttendants
        .map((a: any) => ({
          id: String(a._id || a.id),
          name: a.nome || 'Agente',
          status: a.status === 'A' ? 'online' : 'offline',
          activeChats: 0
        }));

      const attendantMap = new Map(attendants.map(a => [a.id, a.name]));

      const tickets: Ticket[] = rawTickets
        .map((t: any) => {
          const status = determineTicketStatus(t);
          
          let attName = undefined;
          const attObj = t.id_atendente;
          const attId = typeof attObj === 'object' ? String(attObj?._id || '') : String(attObj || '');
          const rawAttName = typeof attObj === 'object' ? String(attObj?.nome || '') : '';
          
          if (attId) {
              attName = rawAttName || attendantMap.get(attId) || 'Atendente';
          }

          // Lógica de Nome: Prioriza nome real. Se não houver, tenta extrair e formatar o telefone.
          let clientDisplayName = t.cliente_nome || (typeof t.id_cliente === 'object' ? t.id_cliente?.nome : undefined);
          
          if (!clientDisplayName && t.canal_cliente) {
             const phonePart = String(t.canal_cliente).split('@')[0];
             if (phonePart && phonePart.length > 5) {
                clientDisplayName = formatPhone(phonePart);
             }
          }

          // Se o nome for puramente numérico (comum quando o contato não está salvo), formatamos
          if (clientDisplayName && /^\d+$/.test(clientDisplayName.replace(/\D/g, ''))) {
            clientDisplayName = formatPhone(clientDisplayName);
          }

          if (!clientDisplayName) clientDisplayName = 'Cliente';

          return {
            id: String(t._id || t.id),
            protocol: String(t.protocolo || 'N/A'),
            clientName: String(clientDisplayName),
            contact: t.cliente_fone || t.canal_cliente || '',
            waitTimeSeconds: status === 'waiting' ? calculateDuration(t.date) : 0,
            durationSeconds: (status === 'in_service' || status === 'finished') ? calculateDuration(t.date, t.fim) : 0,
            status,
            attendantName: attName,
            department: (typeof t.id_motivo_atendimento === 'object' ? t.id_motivo_atendimento?.motivo : undefined) || 'Geral',
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

      return { tickets, attendants };
    } catch (e) {
      console.error("[OpaService] Error:", e);
      return { tickets: [], attendants: [] };
    }
  }
};
