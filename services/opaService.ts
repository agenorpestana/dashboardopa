
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
  // Se houver atendente vinculado, consideramos em serviço
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

      // Dicionários de Nomes e Telefones
      const clientNameMap = new Map<string, string>();
      const clientPhoneMap = new Map<string, string>();
      rawClients.forEach((c: any) => {
        const id = String(c._id);
        if (c.nome) clientNameMap.set(id, String(c.nome));
        if (c.fone) clientPhoneMap.set(id, String(c.fone));
        else if (c.cpf_cnpj) clientPhoneMap.set(id, String(c.cpf_cnpj));
      });

      const contactNameMap = new Map<string, string>();
      const contactPhoneMap = new Map<string, string>();
      rawContacts.forEach((c: any) => {
        const id = String(c._id);
        if (c.nome) contactNameMap.set(id, String(c.nome));
        
        // Tenta extrair primeiro telefone da lista de fones
        if (c.fones && Array.isArray(c.fones) && c.fones.length > 0) {
          contactPhoneMap.set(id, String(c.fones[0].numero || ''));
        } else if (c.email_principal) {
          contactPhoneMap.set(id, String(c.email_principal));
        }
      });

      // Mapeamento de Atendentes (Lookup Map para nomes)
      const attendantNameMap = new Map<string, string>();
      const attendants: Attendant[] = rawAttendants.map((a: any) => {
        const id = String(a._id || a.id);
        const name = a.nome || 'Agente';
        attendantNameMap.set(id, name);
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

        // 1. Tentar Nome Real
        let resolvedName = '';
        let resolvedPhone = '';

        const clientId = typeof t.id_cliente === 'object' ? t.id_cliente?._id : t.id_cliente;
        const contactId = typeof t.id_contato === 'object' ? t.id_contato?._id : t.id_contato;

        // Prioridade 1: Objeto populado
        if (t.id_cliente?.nome) resolvedName = t.id_cliente.nome;
        else if (t.id_contato?.nome) resolvedName = t.id_contato.nome;
        
        // Prioridade 2: Lookups por ID
        if (!resolvedName && clientId) resolvedName = clientNameMap.get(String(clientId)) || '';
        if (!resolvedName && contactId) resolvedName = contactNameMap.get(String(contactId)) || '';

        // Prioridade 3: Lookups de Telefone (Caso não tenha nome)
        if (clientId) resolvedPhone = clientPhoneMap.get(String(clientId)) || '';
        if (!resolvedPhone && contactId) resolvedPhone = contactPhoneMap.get(String(contactId)) || '';
        if (!resolvedPhone && t.id_contato?.fones?.[0]?.numero) resolvedPhone = t.id_contato.fones[0].numero;

        // Validação de "Nome que é Protocolo"
        const isProtocol = (str: string) => !str || /^(ITL|OPA)\d+/i.test(str) || /^\d{10,}$/.test(str) || str.toLowerCase() === 'cliente';

        let finalDisplayName = resolvedName;
        
        // Se o nome for inválido ou protocolo, tenta o telefone
        if (isProtocol(finalDisplayName)) {
          finalDisplayName = resolvedPhone || protocol || 'Cliente Anonimo';
        }

        // --- CORREÇÃO DO NOME DO ATENDENTE ---
        let attName = undefined;
        if (t.id_atendente) {
          if (typeof t.id_atendente === 'object' && t.id_atendente.nome) {
            attName = t.id_atendente.nome;
          } else {
            // Se vier apenas o ID (string), busca no mapa de atendentes
            attName = attendantNameMap.get(String(t.id_atendente));
          }
        }

        const dateCreated = t.date; 
        const dateFinished = t.fim;

        return {
          id: String(t._id || t.id),
          protocol: protocol,
          clientName: String(finalDisplayName).trim(),
          contact: resolvedPhone,
          waitTimeSeconds: status === 'waiting' ? calculateDuration(dateCreated) : 0,
          durationSeconds: (status === 'in_service' || status === 'finished')
            ? calculateDuration(dateCreated, dateFinished)
            : 0,
          status,
          attendantName: attName,
          department: t.id_motivo_atendimento?.motivo || 'Suporte',
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
      console.error("[OpaService] Erro:", e);
      return { tickets: [], attendants: [] };
    }
  }
};
