import { Ticket, Attendant, AppConfig, TicketStatus } from '../types';

// Mock Data Generators
const NAMES = ['Maria Silva', 'João Souza', 'Ana Pereira', 'Carlos Oliveira', 'Fernanda Lima', 'Roberto Santos'];
const CONTACTS = ['maria@exemplo.com', '11999998888', 'ana.p@company.com', 'carlos@tech.br', 'fernanda@design.com', '11988887777'];
const ATTENDANTS = ['Pedro Suporte', 'Julia Atendimento', 'Marcos Vendas', 'Lucia Financeiro', 'Rafael N2'];

function generateMockTickets(): Ticket[] {
  const tickets: Ticket[] = [];
  
  // Generate Waiting Tickets
  for (let i = 0; i < 10; i++) {
    tickets.push({
      id: `WAIT-${i}`,
      protocol: `202405${1000 + i}`,
      clientName: NAMES[i % NAMES.length],
      contact: CONTACTS[i % CONTACTS.length],
      waitTimeSeconds: Math.floor(Math.random() * 600) + 60, // 1 to 10 mins
      status: 'waiting',
      department: 'Suporte Geral'
    });
  }

  // Generate In Service Tickets
  for (let i = 0; i < 23; i++) {
    tickets.push({
      id: `SERV-${i}`,
      protocol: `202405${2000 + i}`,
      clientName: NAMES[(i + 2) % NAMES.length],
      contact: CONTACTS[(i + 2) % CONTACTS.length],
      waitTimeSeconds: 120,
      durationSeconds: Math.floor(Math.random() * 1800) + 300, // 5 to 30 mins
      status: 'in_service',
      attendantName: ATTENDANTS[i % ATTENDANTS.length],
      department: 'Vendas'
    });
  }

  return tickets;
}

function generateMockAttendants(): Attendant[] {
  return ATTENDANTS.map((name, idx) => ({
    id: `ATT-${idx}`,
    name,
    status: Math.random() > 0.2 ? 'online' : 'busy',
    activeChats: Math.floor(Math.random() * 5)
  }));
}

// Helper to calculate seconds from a date string
function calculateSeconds(dateStr?: string): number {
  if (!dateStr) return 0;
  const start = new Date(dateStr).getTime();
  const now = new Date().getTime();
  return Math.max(0, Math.floor((now - start) / 1000));
}

// Helper to map API status string to internal TicketStatus
function mapApiStatus(status?: string): TicketStatus {
  if (!status) return 'waiting';
  const s = status.toUpperCase();
  // Opa Suite: EA = Em Atendimento, A = Aberto (Fila)
  if (s === 'EA' || s === 'ATENDIMENTO' || s.includes('SERVICE')) return 'in_service';
  if (s === 'F' || s === 'FINALIZADO' || s === 'R' || s === 'RESOLVIDO') return 'finished';
  return 'waiting';
}

// API Service
export const opaService = {
  fetchData: async (config: AppConfig): Promise<{ tickets: Ticket[], attendants: Attendant[] }> => {
    // 1. Try to fetch from our Local Proxy (Server.js)
    // We ignore the passed 'config' for the fetch URL because server.js reads it securely from DB.
    // However, we check if config exists in App state to know if we SHOULD attempt fetch.
    if (config.apiUrl && config.apiToken) {
      try {
        console.log(`[OpaService] Fetching data via local proxy...`);
        
        // Call our own backend. This avoids CORS because it's same-origin.
        const response = await fetch('/api/dashboard-data');

        if (!response.ok) {
           throw new Error(`Proxy error: ${response.status}`);
        }

        const data = await response.json();
        
        // Data comes pre-structured from our server proxy
        const rawTickets = data.tickets || [];
        const rawAttendants = data.attendants || [];

        console.log(`[OpaService] Tickets received: ${rawTickets.length}`);
        
        // Map Tickets
        const tickets: Ticket[] = rawTickets.map((t: any) => {
           return {
              id: String(t._id || t.id),
              protocol: t.protocolo || t.protocol || `PROT-${t._id?.substring(0,6)}`,
              clientName: t.id_cliente?.nome || t.client_name || 'Cliente Desconhecido',
              contact: t.id_cliente?.cpf_cnpj || t.id_cliente?.telefone || t.contact || 'N/A',
              waitTimeSeconds: calculateSeconds(t.date || t.created_at || t.started_at),
              durationSeconds: (t.status === 'EA') ? calculateSeconds(t.date) : undefined,
              status: mapApiStatus(t.status),
              attendantName: t.id_atendente?.nome || t.attendant_name,
              department: t.setor?.toString() || 'Geral'
           };
        }).filter((t: Ticket) => t.status !== 'finished');

        // Map Attendants
        let attendants: Attendant[] = rawAttendants.map((a: any) => ({
          id: String(a._id || a.id),
          name: a.nome || a.name || 'Agente',
          status: (a.status === 'ativo' || a.status === 'online' || a.is_online) ? 'online' : 'busy',
          activeChats: 0
        }));

        // Fallback: If agents endpoint failed (empty array), try to extract from active tickets
        if (attendants.length === 0 && tickets.length > 0) {
           const agentMap = new Map<string, number>();
           tickets.forEach(t => {
              if (t.status === 'in_service' && t.attendantName) {
                 agentMap.set(t.attendantName, (agentMap.get(t.attendantName) || 0) + 1);
              }
           });
           
           agentMap.forEach((count, name) => {
              attendants.push({
                 id: `inf-${name}`,
                 name,
                 status: 'online',
                 activeChats: count
              });
           });
        }

        return { tickets, attendants };

      } catch (error) {
        console.warn("[OpaService] Proxy connection issue, falling back to mock:", error);
      }
    }

    // 2. Mock Data Fallback (if no config or error)
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          tickets: generateMockTickets(),
          attendants: generateMockAttendants()
        });
      }, 500); 
    });
  }
};