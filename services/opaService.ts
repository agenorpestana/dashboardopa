
import { Ticket, Attendant, AppConfig, TicketStatus } from '../types';

function toTimestamp(dateVal: any): number {
  if (!dateVal) return 0;
  const ts = Date.parse(String(dateVal));
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
  if (s === 'EA') return 'in_service';
  if (s === 'AG') return 'waiting';
  if (s === 'PS' || s === 'BOT') return 'bot';
  if (t.id_atendente) return 'in_service';
  if (t.setor) return 'waiting';
  return 'bot'; 
}

/**
 * Formata números de telefone para o padrão brasileiro
 */
function formatPhone(phone: string): string {
  if (!phone) return '';
  let cleaned = phone.replace(/\D/g, '');
  
  if (cleaned.startsWith('55') && (cleaned.length === 12 || cleaned.length === 13)) {
    cleaned = cleaned.substring(2);
  }

  if (cleaned.length === 11) {
    return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 7)}-${cleaned.substring(7)}`;
  }
  if (cleaned.length === 10) {
    return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 6)}-${cleaned.substring(6)}`;
  }
  if (cleaned.length === 9) {
    return `${cleaned.substring(0, 5)}-${cleaned.substring(5)}`;
  }
  if (cleaned.length === 8) {
    return `${cleaned.substring(0, 4)}-${cleaned.substring(4)}`;
  }

  return phone;
}

export const opaService = {
  fetchData: async (config: AppConfig): Promise<{ tickets: Ticket[], attendants: Attendant[] }> => {
    if (!config.apiUrl || !config.apiToken) return { tickets: [], attendants: [] };
    
    try {
      const response = await fetch('/api/dashboard-data');
      if (!response.ok) return { tickets: [], attendants: [] };
      const result = await response.json();
      
      const rawTickets = result.tickets || [];
      const rawAttendants = result.attendants || [];
      const rawClients = result.clients || [];
      const rawContacts = result.contacts || [];

      // DADOS DO ROBÔ PARA EXCLUSÃO
      const ROBOT_ID = '5d1642ad4b16a50312cc8f4d';
      const ROBOT_NAMES = ["Victor (Robô de Adentimento)", "Victor"];

      const clientLookup = new Map<string, {name: string, phone: string}>();
      rawClients.forEach((c: any) => {
        const id = String(c._id || c.id);
        const phone = c.fone || c.telefone || c.whatsapp || c.celular || c.cpf_cnpj || '';
        clientLookup.set(id, { name: c.nome || '', phone: String(phone) });
      });

      const contactLookup = new Map<string, {name: string, phone: string}>();
      rawContacts.forEach((c: any) => {
        const id = String(c._id || c.id);
        let phone = c.whatsapp || c.celular || '';
        if (!phone && c.fones && Array.isArray(c.fones) && c.fones.length > 0) {
          phone = c.fones[0].numero || c.fones[0].fone || '';
        }
        contactLookup.set(id, { name: c.nome || '', phone: String(phone) });
      });

      const attendantLookup = new Map<string, string>();
      const attendants: Attendant[] = rawAttendants
        .filter((a: any) => {
          const id = String(a._id || a.id);
          const name = String(a.nome || '');
          // Filtra o robô pelo ID exato ou pelo nome
          return id !== ROBOT_ID && !ROBOT_NAMES.some(rName => name.includes(rName));
        })
        .map((a: any) => {
          const id = String(a._id || a.id);
          const name = a.nome || 'Agente';
          attendantLookup.set(id, name);
          return {
            id,
            name,
            status: a.status === 'A' ? 'online' : 'offline',
            activeChats: 0
          };
        });

      const tickets: Ticket[] = rawTickets.map((t: any) => {
        const protocol = (t.protocolo || '').trim();
        const status = determineTicketStatus(t);

        let foundName = '';
        let foundPhone = '';

        let phoneFromCanal = String(t.canal_cliente || '').split('@')[0];
        if (phoneFromCanal && !/^[a-f0-9-]{36}$/.test(phoneFromCanal)) { 
           foundPhone = phoneFromCanal;
        }

        const clientId = typeof t.id_cliente === 'object' ? t.id_cliente?._id : t.id_cliente;
        const contactId = typeof t.id_contato === 'object' ? t.id_contato?._id : t.id_contato;

        if (clientId && clientLookup.has(String(clientId))) {
          const info = clientLookup.get(String(clientId))!;
          foundName = info.name;
          if (!foundPhone) foundPhone = info.phone;
        }

        if (contactId && contactLookup.has(String(contactId))) {
          const info = contactLookup.get(String(contactId))!;
          if (!foundName || foundName.toUpperCase() === 'CLIENTE') foundName = info.name;
          if (!foundPhone) foundPhone = info.phone;
        }

        if (!foundName || foundName.toUpperCase() === 'CLIENTE') {
          foundName = t.id_cliente?.nome || t.id_contato?.nome || t.cliente_nome || '';
        }
        if (!foundPhone) {
          foundPhone = t.id_contato?.fones?.[0]?.numero || t.cliente_fone || t.contato_fone || '';
        }

        const isJunk = (str: string) => {
          if (!str) return true;
          const s = str.trim().toUpperCase();
          const p = protocol.toUpperCase();
          return s === 'CLIENTE' || s === 'ANONIMO' || s === 'NULL' || s === 'WHATSAPP USER' ||
                 s === p || s.includes(p) || /^(ITL|OPA|PRT)/.test(s) || (s.length >= 8 && /^\d+$/.test(s)); 
        };

        let finalDisplayName = foundName;
        if (isJunk(finalDisplayName)) {
          finalDisplayName = foundPhone;
        }
        if (!finalDisplayName || isJunk(finalDisplayName)) {
          finalDisplayName = foundPhone || 'Sem Nome';
        }

        // Formatação de telefone no nome se for puramente numérico
        if (/^\d+$/.test(finalDisplayName.replace(/\D/g, '')) && (finalDisplayName.length >= 8)) {
          finalDisplayName = formatPhone(finalDisplayName);
        }

        let finalAttendant = undefined;
        let isRobot = false;
        
        if (t.id_atendente) {
          const attId = typeof t.id_atendente === 'object' ? t.id_atendente._id : t.id_atendente;
          const attIdStr = String(attId);
          const attNameStr = String(t.id_atendente?.nome || attendantLookup.get(attIdStr) || '');

          if (attIdStr === ROBOT_ID || ROBOT_NAMES.some(r => attNameStr.includes(r))) {
            isRobot = true;
          } else {
            finalAttendant = attNameStr;
          }
        }

        return {
          id: String(t._id || t.id),
          protocol,
          clientName: String(finalDisplayName).trim(),
          contact: formatPhone(foundPhone),
          waitTimeSeconds: status === 'waiting' ? calculateDuration(t.date) : 0,
          durationSeconds: (status === 'in_service' || status === 'finished') ? calculateDuration(t.date, t.fim) : 0,
          status,
          attendantName: isRobot ? undefined : finalAttendant, // Se for robô, remove o nome do atendente deste ticket
          department: t.id_motivo_atendimento?.motivo || t.setor?.nome || 'Suporte',
          createdAt: t.date,
          closedAt: t.fim
        };
      });

      // Contabiliza chats ativos apenas para humanos
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
