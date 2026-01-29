import { Ticket, Attendant, AppConfig, TicketStatus } from '../types';

// Mock Data Generators (Fallback)
const NAMES = ['Maria Silva', 'João Souza', 'Ana Pereira', 'Carlos Oliveira'];
const CONTACTS = ['maria@exemplo.com', '11999998888', 'ana.p@company.com', 'carlos@tech.br'];
const ATTENDANTS = ['Pedro Suporte', 'Julia Atendimento', 'Marcos Vendas'];

function generateMockTickets(): Ticket[] {
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

// Mapeia Status
function mapApiStatus(statusRaw?: any): TicketStatus {
  if (!statusRaw) return 'waiting'; 
  const s = String(statusRaw).toUpperCase().trim();
  if (s === 'EA' || s === 'EM ATENDIMENTO' || s === '2') return 'in_service';
  if (s === 'F' || s === 'FINALIZADO' || s === '3' || s === '4') return 'finished';
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

        // 1. Criar mapa de Atendentes (ID -> Nome)
        // Isso é necessário porque o ticket pode trazer apenas o ID string "5d16..."
        const attendantMap = new Map<string, string>();
        
        let attendants: Attendant[] = rawAttendants.map((a: any) => {
          const id = String(a._id || a.id);
          const name = a.nome || a.name || 'Agente';
          attendantMap.set(id, name);
          
          return {
            id,
            name,
            status: (a.status === 'ativo' || a.is_online || a.situacao === 1) ? 'online' : 'busy',
            activeChats: 0 
          };
        });

        // 2. Mapear Tickets
        const tickets: Ticket[] = rawTickets.map((t: any) => {
           const rawStatus = t.status || t.situacao;
           const status = mapApiStatus(rawStatus);
           const dateField = t.date || t.data_criacao; 

           // Cliente e Contato
           let clientName = 'Cliente';
           let contact = 'N/A';

           if (t.id_cliente && typeof t.id_cliente === 'object') {
              clientName = t.id_cliente.nome || clientName;
              contact = t.id_cliente.cpf_cnpj || t.id_cliente.telefone || contact;
           } else if (t.client_name) {
              clientName = t.client_name;
           }
           
           // Se contato ainda é N/A, tenta pegar do canal (ex: whatsapp ID)
           if (contact === 'N/A' && t.canal_cliente) {
              contact = t.canal_cliente.split('@')[0]; // Remove sufixo do whatsapp se houver
           }

           // Atendente: Tenta pegar objeto, senão busca no mapa, senão usa 'Atendente'
           let attendantName = undefined;
           if (t.id_atendente && typeof t.id_atendente === 'object') {
              attendantName = t.id_atendente.nome;
           } else if (t.id_atendente) {
              // Busca no mapa criado acima
              attendantName = attendantMap.get(String(t.id_atendente));
           }

           // Se não achou nome mas tem ID, exibe o ID encurtado (debug) ou "Atendente"
           if (!attendantName && t.id_atendente) {
              attendantName = "Atendente"; 
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

        // 3. Filtrar finalizados
        const activeTickets = tickets.filter(t => t.status !== 'finished');

        // 4. Se não veio lista de atendentes da API, improvisar com base nos tickets ativos
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
