
import { Ticket, Attendant, AppConfig, TicketStatus } from '../types';

function toTimestamp(dateVal: any): number {
  if (!dateVal) return 0;
  // Algumas APIs retornam datas com espaço, convertemos para padrão ISO
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

function determineTicketStatus(t: any): TicketStatus {
  const s = String(t.status || '').toUpperCase().trim();
  if (s === 'F') return 'finished';
  if (s === 'EA' || s === 'E') return 'in_service';
  if (s === 'AG' || s === 'A') return 'waiting';
  if (s === 'PS' || s === 'BOT' || s === 'B') return 'bot';
  
  // Fallback baseado em campos
  if (t.id_atendente) return 'in_service';
  if (t.setor || t.id_motivo_atendimento) return 'waiting';
  return 'bot'; 
}

function formatPhone(phone: string): string {
  if (!phone) return '';
  let cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.startsWith('55') && cleaned.length > 10) cleaned = cleaned.substring(2);
  
  if (cleaned.length === 11) return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 7)}-${cleaned.substring(7)}`;
  if (cleaned.length === 10) return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 6)}-${cleaned.substring(6)}`;
  return phone;
}

export const opaService = {
  fetchData: async (config: AppConfig): Promise<{ tickets: Ticket[], attendants: Attendant[] }> => {
    if (!config.apiUrl) return { tickets: [], attendants: [] };
    
    try {
      const response = await fetch('/api/dashboard-data');
      if (!response.ok) return { tickets: [], attendants: [] };
      
      const result = await response.json();
      if (!result.success) return { tickets: [], attendants: [] };
      
      const rawTickets = result.tickets || [];
      const rawAttendants = result.attendants || [];
      const rawClients = result.clients || [];
      const rawContacts = result.contacts || [];

      // Identificadores comuns de Robôs no Opa Suite
      const ROBOT_ID = '5d1642ad4b16a50312cc8f4d';
      const ROBOT_NAMES = ["VICTOR", "ROBÔ", "BOT", "TRIAGEM", "AUTO"];

      const attendants: Attendant[] = rawAttendants
        .filter((a: any) => {
          const name = String(a.nome || '').toUpperCase();
          const id = String(a._id || a.id);
          return id !== ROBOT_ID && !ROBOT_NAMES.some(rn => name.includes(rn));
        })
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
          
          // Lógica de Atendente (Filtrando robôs aqui no front)
          let attName = undefined;
          const attObj = t.id_atendente;
          const attId = typeof attObj === 'object' ? String(attObj?._id || '') : String(attObj || '');
          const rawAttName = typeof attObj === 'object' ? String(attObj?.nome || '') : '';
          
          const isRobot = attId === ROBOT_ID || ROBOT_NAMES.some(rn => (rawAttName || '').toUpperCase().includes(rn));
          
          if (!isRobot && attId) {
              attName = rawAttName || attendantMap.get(attId);
          }

          // Resgate de nome do cliente
          let clientName = t.cliente_nome || t.id_cliente?.nome || t.id_contato?.nome || 'Cliente';
          if (clientName === 'Cliente' && t.protocolo) clientName = `Prot: ${t.protocolo}`;

          return {
            id: String(t._id || t.id),
            protocol: String(t.protocolo || 'N/A'),
            clientName: String(clientName),
            contact: formatPhone(t.cliente_fone || ''),
            waitTimeSeconds: status === 'waiting' ? calculateDuration(t.date) : 0,
            durationSeconds: (status === 'in_service' || status === 'finished') ? calculateDuration(t.date, t.fim) : 0,
            status,
            attendantName: attName,
            department: t.id_motivo_atendimento?.motivo || t.setor?.nome || 'Geral',
            createdAt: t.date,
            closedAt: t.fim
          };
        })
        // Removemos atendimentos que ficaram marcados como robô se o usuário não quiser vê-los
        // Mas por padrão, deixamos passar para o dashboard classificar como 'bot'
        ;

      // Contagem de chats ativos
      tickets.forEach(t => {
        if (t.status === 'in_service' && t.attendantName) {
          const a = attendants.find(att => att.name === t.attendantName);
          if (a) a.activeChats++;
        }
      });

      return { tickets, attendants };
    } catch (e) {
      console.error("[OpaService] Erro:", e);
      return { tickets: [], attendants: [] };
    }
  }
};
