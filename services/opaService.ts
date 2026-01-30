
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

      // 1. Dicionário de Nomes e Telefones de Clientes
      const clientLookup = new Map<string, {name: string, phone: string}>();
      rawClients.forEach((c: any) => {
        const id = String(c._id || c.id);
        clientLookup.set(id, {
          name: c.nome || '',
          phone: c.fone || c.telefone || c.cpf_cnpj || ''
        });
      });

      // 2. Dicionário de Nomes e Telefones de Contatos
      const contactLookup = new Map<string, {name: string, phone: string}>();
      rawContacts.forEach((c: any) => {
        const id = String(c._id || c.id);
        let phone = '';
        if (c.fones && Array.isArray(c.fones) && c.fones.length > 0) {
          phone = c.fones[0].numero || '';
        }
        contactLookup.set(id, {
          name: c.nome || '',
          phone: phone || c.email_principal || ''
        });
      });

      // 3. Dicionário de Atendentes (Crucial para Conversas Ativas)
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

        // --- RESOLUÇÃO DE IDENTIDADE DO CLIENTE ---
        let foundName = '';
        let foundPhone = '';

        const clientId = typeof t.id_cliente === 'object' ? t.id_cliente?._id : t.id_cliente;
        const contactId = typeof t.id_contato === 'object' ? t.id_contato?._id : t.id_contato;

        // Tenta extrair do id_cliente
        if (clientId && clientLookup.has(String(clientId))) {
          const info = clientLookup.get(String(clientId))!;
          foundName = info.name;
          foundPhone = info.phone;
        }

        // Tenta extrair do id_contato (se não achou ou se contato for mais específico)
        if ((!foundName || !foundPhone) && contactId && contactLookup.has(String(contactId))) {
          const info = contactLookup.get(String(contactId))!;
          if (!foundName) foundName = info.name;
          if (!foundPhone) foundPhone = info.phone;
        }

        // Fallbacks de emergência (campos flat que às vezes a API envia)
        if (!foundPhone) foundPhone = t.fone || t.contato_fone || t.cliente_fone || '';
        if (!foundName && t.id_cliente?.nome) foundName = t.id_cliente.nome;

        // Validação: O nome é útil ou é apenas um código/protocolo?
        const isTrash = (str: string) => {
          const s = str.trim().toUpperCase();
          return !s || s === 'CLIENTE' || s === 'ANONIMO' || s === protocol.toUpperCase() || /^(ITL|OPA|PRT)\d+/.test(s) || /^\d{10,}$/.test(s);
        };

        // Decisão de Exibição: Nome -> Telefone -> Protocolo
        let finalName = foundName;
        if (isTrash(finalName)) {
          finalName = foundPhone || protocol || 'Cliente';
        }

        // --- RESOLUÇÃO DO ATENDENTE ---
        let finalAttendant = undefined;
        if (t.id_atendente) {
          const attId = typeof t.id_atendente === 'object' ? t.id_atendente._id : t.id_atendente;
          // Se for objeto e tiver nome, usa direto. Se for só ID, usa o lookup.
          finalAttendant = t.id_atendente?.nome || attendantLookup.get(String(attId));
        }

        const dateCreated = t.date; 
        const dateFinished = t.fim;

        return {
          id: String(t._id || t.id),
          protocol: protocol,
          clientName: String(finalName).trim(),
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

      // Incrementar contagem de chats ativos
      tickets.forEach(t => {
        if (t.status === 'in_service' && t.attendantName) {
          const a = attendants.find(att => att.name === t.attendantName);
          if (a) a.activeChats++;
        }
      });

      return { tickets, attendants };
    } catch (e) {
      console.error("[OpaService] Erro fatal no processamento:", e);
      return { tickets: [], attendants: [] };
    }
  }
};
