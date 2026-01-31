
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

      // Mapeamento de Clientes
      const clientLookup = new Map<string, {name: string, phone: string}>();
      rawClients.forEach((c: any) => {
        const id = String(c._id || c.id);
        const phone = c.fone || c.telefone || c.whatsapp || c.celular || '';
        clientLookup.set(id, { name: c.nome || '', phone });
      });

      // Mapeamento de Contatos
      const contactLookup = new Map<string, {name: string, phone: string}>();
      rawContacts.forEach((c: any) => {
        const id = String(c._id || c.id);
        let phone = c.whatsapp || c.celular || '';
        if (!phone && c.fones && Array.isArray(c.fones) && c.fones.length > 0) {
          phone = c.fones[0].numero || c.fones[0].fone || '';
        }
        contactLookup.set(id, { name: c.nome || '', phone });
      });

      const attendantLookup = new Map<string, string>();
      const attendants: Attendant[] = rawAttendants.map((a: any) => {
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

        const clientId = typeof t.id_cliente === 'object' ? t.id_cliente?._id : t.id_cliente;
        const contactId = typeof t.id_contato === 'object' ? t.id_contato?._id : t.id_contato;

        if (clientId && clientLookup.has(String(clientId))) {
          const info = clientLookup.get(String(clientId))!;
          foundName = info.name;
          foundPhone = info.phone;
        }

        if (contactId && contactLookup.has(String(contactId))) {
          const info = contactLookup.get(String(contactId))!;
          if (!foundName || foundName.toUpperCase() === 'CLIENTE') foundName = info.name;
          if (!foundPhone) foundPhone = info.phone;
        }

        // Fallback direto do objeto populado caso o lookup falhe
        if (!foundName || foundName.toUpperCase() === 'CLIENTE') {
          foundName = t.id_cliente?.nome || t.id_contato?.nome || t.cliente_nome || '';
        }
        if (!foundPhone) {
          foundPhone = t.id_contato?.fones?.[0]?.numero || t.cliente_fone || '';
        }

        // Função para validar se o que temos é um nome real ou apenas lixo de sistema/protocolo
        const isJunk = (str: string) => {
          if (!str) return true;
          const s = str.trim().toUpperCase();
          const p = protocol.toUpperCase();
          return s === 'CLIENTE' || 
                 s === 'ANONIMO' || 
                 s === 'NULL' ||
                 s === p || 
                 s.includes(p) ||
                 /^(ITL|OPA|PRT)/.test(s) || // Padrões de protocolo
                 (s.length >= 8 && /^\d+$/.test(s)); // IDs numéricos longos
        };

        // --- LÓGICA DE EXIBIÇÃO FINAL ---
        // Prioridade 1: Nome Real (Se não for junk)
        // Prioridade 2: Telefone (Se nome for junk)
        let finalDisplayName = foundName;
        if (isJunk(finalDisplayName)) {
          finalDisplayName = foundPhone;
        }

        // Se após tudo ainda for inválido, forçamos o telefone disponível (WhatsApp)
        if (!finalDisplayName || isJunk(finalDisplayName)) {
          finalDisplayName = foundPhone || 'WhatsApp User';
        }

        let finalAttendant = undefined;
        if (t.id_atendente) {
          const attId = typeof t.id_atendente === 'object' ? t.id_atendente._id : t.id_atendente;
          finalAttendant = t.id_atendente?.nome || attendantLookup.get(String(attId));
        }

        return {
          id: String(t._id || t.id),
          protocol,
          clientName: String(finalDisplayName).trim(),
          contact: foundPhone,
          waitTimeSeconds: status === 'waiting' ? calculateDuration(t.date) : 0,
          durationSeconds: (status === 'in_service' || status === 'finished')
            ? calculateDuration(t.date, t.fim)
            : 0,
          status,
          attendantName: finalAttendant,
          department: t.id_motivo_atendimento?.motivo || t.setor?.nome || 'Suporte',
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
      console.error("[OpaService] Erro:", e);
      return { tickets: [], attendants: [] };
    }
  }
};
