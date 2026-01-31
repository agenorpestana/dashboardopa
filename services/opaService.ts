
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

      // Dicionários de Nomes e Telefones de Clientes
      const clientLookup = new Map<string, {name: string, phone: string}>();
      rawClients.forEach((c: any) => {
        const id = String(c._id || c.id);
        clientLookup.set(id, {
          name: c.nome || '',
          phone: c.fone || c.telefone || c.whatsapp || c.celular || c.cpf_cnpj || ''
        });
      });

      // Dicionários de Nomes e Telefones de Contatos
      const contactLookup = new Map<string, {name: string, phone: string}>();
      rawContacts.forEach((c: any) => {
        const id = String(c._id || c.id);
        let phone = '';
        if (c.fones && Array.isArray(c.fones) && c.fones.length > 0) {
          phone = c.fones[0].numero || c.fones[0].fone || '';
        }
        contactLookup.set(id, {
          name: c.nome || '',
          phone: phone || c.whatsapp || c.celular || c.email_principal || ''
        });
      });

      // Dicionário de Atendentes
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

        // --- RESOLUÇÃO DE IDENTIDADE ---
        let foundName = '';
        let foundPhone = '';

        const clientId = typeof t.id_cliente === 'object' ? t.id_cliente?._id : t.id_cliente;
        const contactId = typeof t.id_contato === 'object' ? t.id_contato?._id : t.id_contato;

        // Tenta buscar nos Mapas
        if (clientId && clientLookup.has(String(clientId))) {
          const info = clientLookup.get(String(clientId))!;
          foundName = info.name;
          foundPhone = info.phone;
        }

        if (contactId && contactLookup.has(String(contactId))) {
          const info = contactLookup.get(String(contactId))!;
          if (!foundName) foundName = info.name;
          if (!foundPhone) foundPhone = info.phone;
        }

        // Tenta buscar em propriedades diretas do ticket (algumas versões da API enviam flat)
        if (!foundName) foundName = t.cliente_nome || t.contato_nome || (t.id_cliente?.nome) || (t.id_contato?.nome) || '';
        if (!foundPhone) foundPhone = t.cliente_fone || t.contato_fone || (t.id_contato?.fones?.[0]?.numero) || '';

        // Validação: O que temos é um nome real ou lixo de sistema?
        const isSystemJunk = (str: string) => {
          if (!str) return true;
          const s = str.trim().toUpperCase();
          // Detecta padrões ITL, OPA, PRT ou sequências numéricas longas (protocolos)
          return s === 'CLIENTE' || 
                 s === 'ANONIMO' || 
                 s === protocol.toUpperCase() || 
                 /^(ITL|OPA|PRT)\d+/.test(s) || 
                 /^\d{10,}$/.test(s);
        };

        // Decisão Hierárquica: Nome Real -> Telefone -> Protocolo (Último caso)
        let finalDisplayName = foundName;
        if (isSystemJunk(finalDisplayName)) {
          // Se o nome é junk, priorizamos o telefone
          finalDisplayName = foundPhone;
          
          // Se o telefone também for junk ou vazio, aí sim usamos o protocolo
          if (isSystemJunk(finalDisplayName)) {
            finalDisplayName = protocol || 'Cliente';
          }
        }

        // --- RESOLUÇÃO DO ATENDENTE ---
        let finalAttendant = undefined;
        if (t.id_atendente) {
          const attId = typeof t.id_atendente === 'object' ? t.id_atendente._id : t.id_atendente;
          finalAttendant = t.id_atendente?.nome || attendantLookup.get(String(attId));
        }

        const dateCreated = t.date; 
        const dateFinished = t.fim;

        return {
          id: String(t._id || t.id),
          protocol: protocol,
          clientName: String(finalDisplayName).trim(),
          contact: foundPhone,
          waitTimeSeconds: status === 'waiting' ? calculateDuration(dateCreated) : 0,
          durationSeconds: (status === 'in_service' || status === 'finished')
            ? calculateDuration(dateCreated, dateFinished)
            : 0,
          status,
          attendantName: finalAttendant,
          department: t.id_motivo_atendimento?.motivo || t.setor?.nome || 'Suporte',
          createdAt: dateCreated,
          closedAt: dateFinished
        };
      });

      // Contagem de chats ativos
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
