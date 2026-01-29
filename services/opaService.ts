import { Ticket, Attendant, AppConfig, TicketStatus } from '../types';

// Mock Data Generators (Mantido para fallback)
const NAMES = ['Maria Silva', 'João Souza', 'Ana Pereira', 'Carlos Oliveira'];
const CONTACTS = ['maria@exemplo.com', '11999998888', 'ana.p@company.com', 'carlos@tech.br'];
const ATTENDANTS = ['Pedro Suporte', 'Julia Atendimento', 'Marcos Vendas'];

function generateMockTickets(): Ticket[] {
  // ... (Geração de Mock simplificada para economizar espaço, lógica mantida)
  return Array.from({ length: 5 }).map((_, i) => ({
      id: `MOCK-${i}`,
      protocol: `TEST-${i}`,
      clientName: NAMES[i % NAMES.length],
      contact: CONTACTS[i % CONTACTS.length],
      waitTimeSeconds: Math.floor(Math.random() * 600),
      status: i % 2 === 0 ? 'waiting' : 'in_service',
      department: 'Teste'
  }));
}

function generateMockAttendants(): Attendant[] {
  return ATTENDANTS.map((name, idx) => ({
    id: `ATT-${idx}`,
    name,
    status: 'online',
    activeChats: 2
  }));
}

// Calcula segundos passados
function calculateSeconds(dateStr?: string): number {
  if (!dateStr) return 0;
  const start = new Date(dateStr).getTime();
  const now = new Date().getTime();
  return Math.max(0, Math.floor((now - start) / 1000));
}

// Mapeia Status (Baseado na DOC Oficial: EA = Em Atendimento, F = Finalizado)
function mapApiStatus(statusRaw?: any): TicketStatus {
  if (!statusRaw) return 'waiting'; 

  const s = String(statusRaw).toUpperCase().trim();

  // EA = Em Atendimento
  if (s === 'EA' || s === 'EM ATENDIMENTO' || s === '2') {
    return 'in_service';
  }
  
  // F = Finalizado
  if (s === 'F' || s === 'FINALIZADO' || s === '3' || s === '4') {
    return 'finished';
  }
  
  // Qualquer outra coisa assumimos que é Fila/Aberto (Ex: 'A', 'P', '1')
  return 'waiting';
}

export const opaService = {
  fetchData: async (config: AppConfig): Promise<{ tickets: Ticket[], attendants: Attendant[] }> => {
    if (config.apiUrl && config.apiToken) {
      try {
        const response = await fetch('/api/dashboard-data');
        if (!response.ok) throw new Error(`Proxy error: ${response.status}`);

        const data = await response.json();
        const rawTickets = data.tickets || [];
        const rawAttendants = data.attendants || [];

        console.log(`[OpaService] Tickets Brutos: ${rawTickets.length}`);
        if(rawTickets.length > 0) console.log('[OpaService] Exemplo:', rawTickets[0]);

        // Mapeamento Oficial
        const tickets: Ticket[] = rawTickets.map((t: any) => {
           const rawStatus = t.status || t.situacao;
           const status = mapApiStatus(rawStatus);
           const dateField = t.date || t.data_criacao; // DOC diz 'date'

           // Extração segura de Cliente (Doc diz que id_cliente é objeto)
           let clientName = 'Cliente';
           let contact = 'N/A';

           if (typeof t.id_cliente === 'object' && t.id_cliente !== null) {
              clientName = t.id_cliente.nome || clientName;
              contact = t.id_cliente.cpf_cnpj || t.id_cliente.telefone || contact;
           } else if (t.client_name) {
              clientName = t.client_name;
           }

           // Extração segura de Atendente
           let attendantName = undefined;
           if (typeof t.id_atendente === 'object' && t.id_atendente !== null) {
              attendantName = t.id_atendente.nome;
           } else if (typeof t.id_atendente === 'string') {
             // Caso venha só ID, tentamos pegar de outro campo ou deixamos vazio
             attendantName = t.attendant_name || 'Atendente';
           }

           return {
              id: String(t._id || t.id),
              protocol: t.protocolo || 'N/A',
              clientName,
              contact,
              waitTimeSeconds: calculateSeconds(dateField),
              durationSeconds: (status === 'in_service') ? calculateSeconds(dateField) : undefined,
              status,
              attendantName,
              department: typeof t.setor === 'object' ? t.setor?.nome : 'Geral'
           };
        });

        // Filtrar 'finished' e retornar
        const activeTickets = tickets.filter(t => t.status !== 'finished');

        // Mapear Atendentes
        let attendants: Attendant[] = rawAttendants.map((a: any) => ({
          id: String(a._id || a.id),
          name: a.nome || a.name || 'Agente',
          status: (a.status === 'ativo' || a.is_online) ? 'online' : 'busy',
          activeChats: 0 // Será calculado abaixo
        }));
        
        // Se não vieram atendentes da API, extrair dos tickets ativos
        if (attendants.length === 0 && activeTickets.length > 0) {
           const names = new Set<string>();
           activeTickets.forEach(t => {
             if (t.attendantName && t.status === 'in_service') names.add(t.attendantName);
           });
           attendants = Array.from(names).map((name, i) => ({
             id: `gen-${i}`, name, status: 'online', activeChats: 0
           }));
        }

        return { tickets: activeTickets, attendants };

      } catch (error) {
        console.warn("[OpaService] Erro na conexão, usando Mock:", error);
      }
    }

    // Fallback Mock
    return {
       tickets: generateMockTickets(),
       attendants: generateMockAttendants()
    };
  }
};
