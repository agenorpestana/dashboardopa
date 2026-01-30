
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
  if (t.id_atendente && typeof t.id_atendente === 'object' && t.id_atendente.nome) return 'in_service';
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

      // Criar Dicionários de Pesquisa para cruzamento de nomes
      const clientLookup = new Map<string, string>();
      rawClients.forEach((c: any) => {
        if (c._id && c.nome) clientLookup.set(String(c._id), String(c.nome));
      });

      const contactLookup = new Map<string, string>();
      rawContacts.forEach((c: any) => {
        if (c._id && c.nome) contactLookup.set(String(c._id), String(c.nome));
      });

      const attendants: Attendant[] = rawAttendants.map((a: any) => ({
        id: String(a._id || a.id),
        name: a.nome || 'Agente',
        status: a.status === 'A' ? 'online' : 'offline',
        activeChats: 0
      }));

      const tickets: Ticket[] = rawTickets.map((t: any) => {
        const protocol = (t.protocolo || '').trim();
        const status = determineTicketStatus(t);

        // Lógica de Cruzamento de Nome de Cliente
        let clientName = '';
        
        // 1. Tentar pegar do objeto populado id_cliente
        if (t.id_cliente && typeof t.id_cliente === 'object' && t.id_cliente.nome) {
          clientName = String(t.id_cliente.nome).trim();
        } 
        // 2. Tentar lookup pelo ID da string id_cliente
        else if (t.id_cliente && typeof t.id_cliente === 'string' && clientLookup.has(t.id_cliente)) {
          clientName = clientLookup.get(t.id_cliente)!;
        }
        // 3. Tentar pegar do objeto populado id_contato
        else if (t.id_contato && typeof t.id_contato === 'object' && t.id_contato.nome) {
          clientName = String(t.id_contato.nome).trim();
        }
        // 4. Tentar lookup pelo ID da string id_contato
        else if (t.id_contato && typeof t.id_contato === 'string' && contactLookup.has(t.id_contato)) {
          clientName = contactLookup.get(t.id_contato)!;
        }

        // Validação final: Se o nome parece um protocolo ou está vazio, usa o protocolo da API
        const isInvalidName = (str: string) => !str || /^(ITL|OPA)\d+/i.test(str) || /^\d{10,}$/.test(str) || str.toLowerCase() === 'cliente';
        
        if (isInvalidName(clientName)) {
           clientName = protocol || 'Cliente Anonimo';
        }

        const attName = t.id_atendente?.nome || undefined;
        const dateCreated = t.date; 
        const dateFinished = t.fim;

        return {
          id: String(t._id || t.id),
          protocol: protocol,
          clientName: clientName,
          contact: '',
          // Espera: Criado até agora (se waiting)
          waitTimeSeconds: status === 'waiting' ? calculateDuration(dateCreated) : 0,
          // Atendimento: Criado até o Fim (aproximação conforme doc)
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
