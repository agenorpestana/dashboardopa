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
    // 1. Try Real API if config exists
    if (config.apiUrl && config.apiToken) {
      try {
        const baseUrl = config.apiUrl.replace(/\/$/, '').trim();
        const token = config.apiToken.trim();
        
        const headers = { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        };

        console.log(`[OpaService] Attempting to fetch from ${baseUrl}...`);

        // Use Promise.allSettled to handle partial failures
        // Endpoint adjusted to /api/v1/atendimento based on docs
        const [ticketsResult, agentsResult] = await Promise.allSettled([
          fetch(`${baseUrl}/api/v1/atendimento`, { headers, mode: 'cors' }), 
          fetch(`${baseUrl}/api/v1/atendente`, { headers, mode: 'cors' }) // Tentativa de endpoint de atendentes
        ]);

        let tickets: Ticket[] = [];
        let attendants: Attendant[] = [];
        let isSuccess = false;
        let networkError = false;

        // Process Tickets
        if (ticketsResult.status === 'fulfilled') {
          const response = ticketsResult.value;
          if (response.ok) {
            isSuccess = true;
            try {
               const data = await response.json();
               // Opa Suite usually wraps in "data" or returns array
               const list = Array.isArray(data) ? data : (data.data || data.items || []);
               console.log(`[OpaService] Tickets loaded: ${list.length}`);
               
               tickets = list.map((t: any) => {
                 // Mapping based on Opa Suite Docs
                 // _id, id_cliente: { nome, cpf_cnpj }, status: "EA"|"A", protocolo, date
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

            } catch (jsonError) {
              console.warn('[OpaService] Error parsing tickets JSON:', jsonError);
            }
          } else {
             console.warn(`[OpaService] Tickets endpoint status: ${response.status}`);
          }
        } else {
           const msg = ticketsResult.reason?.message || 'Unknown network error';
           console.warn(`[OpaService] Tickets fetch issue: ${msg}`);
           if (msg.includes('Failed to fetch')) networkError = true;
        }

        // Process Agents
        if (agentsResult.status === 'fulfilled') {
          const response = agentsResult.value;
          if (response.ok) {
            try {
              const data = await response.json();
              const list = Array.isArray(data) ? data : (data.data || []);
              
              console.log(`[OpaService] Agents loaded: ${list.length}`);

              attendants = list.map((a: any) => ({
                id: String(a._id || a.id),
                name: a.nome || a.name || 'Agente',
                status: (a.status === 'ativo' || a.status === 'online' || a.is_online) ? 'online' : 'busy',
                activeChats: 0
              }));
            } catch (jsonError) {
               console.warn('[OpaService] Error parsing agents JSON:', jsonError);
            }
          }
        }
        
        // Fallback: If agents endpoint failed, try to extract from active tickets
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

        if (isSuccess) {
          return { tickets, attendants };
        } else if (networkError) {
           throw new Error("Network/CORS Error"); 
        } else {
           throw new Error("API responded with errors");
        }

      } catch (error) {
        if (error instanceof Error && error.message !== "Network/CORS Error") {
            console.warn("[OpaService] connection issue:", error.message);
        }
      }
    }

    // 2. Mock Data Fallback
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