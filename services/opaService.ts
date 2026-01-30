
import { Ticket, Attendant, AppConfig, TicketStatus } from '../types';

/**
 * Converte strings de data da API (ISO 8601: 2023-12-15T19:11:50.657Z) para timestamp.
 */
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

/**
 * Mapeamento de Status baseado na Documentação:
 * EA = Em Atendimento
 * F = Finalizado
 * AG = Aguardando (Padrão Opa)
 * PS = Bot / Triagem
 */
function determineTicketStatus(t: any): TicketStatus {
  const s = String(t.status || '').toUpperCase().trim();
  
  if (s === 'F') return 'finished';
  if (s === 'EA') return 'in_service';
  if (s === 'AG') return 'waiting';
  if (s === 'PS' || s === 'BOT') return 'bot';

  // Fallback inteligente:
  // Se não é finalizado e tem atendente com nome, está em serviço
  if (t.id_atendente && typeof t.id_atendente === 'object' && t.id_atendente.nome) {
    return 'in_service';
  }

  // Se tem setor mas não tem atendente, está na fila de espera
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
      
      // A API do Opa retorna os dados dentro de uma propriedade "data"
      const rawTickets = result.tickets || [];
      const rawAttendants = result.attendants || [];

      // Mapeamento de Atendentes
      const attendants: Attendant[] = rawAttendants.map((a: any) => ({
        id: String(a._id || a.id),
        name: a.nome || 'Agente',
        status: a.status === 'A' ? 'online' : 'offline',
        activeChats: 0
      }));

      const tickets: Ticket[] = rawTickets.map((t: any) => {
        const protocol = (t.protocolo || '').trim();
        const status = determineTicketStatus(t);

        // Resolução do Nome do Cliente conforme Documentação (id_cliente.nome)
        let clientName = '';
        if (t.id_cliente && typeof t.id_cliente === 'object' && t.id_cliente.nome) {
          clientName = String(t.id_cliente.nome).trim();
        } else if (t.id_contato && typeof t.id_contato === 'object' && t.id_contato.nome) {
          clientName = String(t.id_contato.nome).trim();
        }

        // Se o nome extraído for igual ao protocolo ou padrão ITL/OPA, invalidamos
        const isProtocol = (str: string) => /^(ITL|OPA)\d+/i.test(str) || /^\d{10,}$/.test(str);
        if (!clientName || isProtocol(clientName)) {
           clientName = protocol || 'Cliente';
        }

        // Resolução do Atendente
        const attName = t.id_atendente?.nome || undefined;

        // Datas conforme documentação: 'date' para abertura, 'fim' para fechamento
        const dateCreated = t.date; 
        const dateFinished = t.fim;

        return {
          id: String(t._id || t.id),
          protocol: protocol,
          clientName: clientName,
          contact: '',
          // Espera: Criado até agora (se waiting) ou até o início (se in_service/finished)
          waitTimeSeconds: status === 'waiting' 
            ? calculateDuration(dateCreated) 
            : 0, // No dashboard, focamos na espera atual
          // Duração: Do início (date) até agora ou até o fim
          durationSeconds: status === 'in_service' || status === 'finished'
            ? calculateDuration(dateCreated, dateFinished)
            : 0,
          status,
          attendantName: attName,
          department: t.id_motivo_atendimento?.motivo || 'Suporte',
          createdAt: dateCreated,
          closedAt: dateFinished
        };
      });

      // Contagem de chats ativos por atendente
      tickets.forEach(t => {
        if (t.status === 'in_service' && t.attendantName) {
          const a = attendants.find(att => att.name === t.attendantName);
          if (a) a.activeChats++;
        }
      });

      return { tickets, attendants };
    } catch (e) {
      console.error("[OpaService] Erro de processamento:", e);
      return { tickets: [], attendants: [] };
    }
  }
};
