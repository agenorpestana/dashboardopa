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
  const s = status.toLowerCase();
  if (s.includes('wait') || s.includes('pend') || s.includes('open') || s.includes('fila')) return 'waiting';
  if (s.includes('attend') || s.includes('service') || s.includes('chat') || s.includes('progress')) return 'in_service';
  return 'finished';
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
        const [ticketsResult, agentsResult] = await Promise.allSettled([
          fetch(`${baseUrl}/api/v1/tickets`, { headers, mode: 'cors' }), 
          fetch(`${baseUrl}/api/v1/agents`, { headers, mode: 'cors' })
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
               const list = Array.isArray(data) ? data : (data.data || data.items || []);
               console.log(`[OpaService] Tickets loaded: ${list.length}`);
               
               tickets = list.map((t: any) => ({
                id: String(t.id || t._id),
                protocol: t.protocol || `PROT-${t.id || Math.floor(Math.random() * 10000)}`,
                clientName: t.contact?.name || t.client_name || 'Cliente Desconhecido',
                contact: t.contact?.email || t.contact?.phone || t.contact || 'N/A',
                waitTimeSeconds: calculateSeconds(t.created_at || t.started_at),
                durationSeconds: t.accepted_at ? calculateSeconds(t.accepted_at) : undefined,
                status: mapApiStatus(t.status),
                attendantName: t.agent?.name || t.attendant_name,
                department: t.department?.name || t.department
              }));
            } catch (jsonError) {
              console.warn('[OpaService] Error parsing tickets JSON:', jsonError);
            }
          } else {
             console.warn(`[OpaService] Tickets endpoint status: ${response.status}`);
          }
        } else {
           // Log as warning instead of error to avoid console noise during CORS/Dev
           const msg = ticketsResult.reason?.message || 'Unknown network error';
           console.warn(`[OpaService] Tickets fetch issue: ${msg}`);
           if (msg.includes('Failed to fetch')) networkError = true;
        }

        // Process Agents
        if (agentsResult.status === 'fulfilled') {
          const response = agentsResult.value;
          if (response.ok) {
            isSuccess = true;
            try {
              const data = await response.json();
              const list = Array.isArray(data) ? data : (data.data || data.items || []);
              
              console.log(`[OpaService] Agents loaded: ${list.length}`);

              attendants = list.map((a: any) => ({
                id: String(a.id || a._id),
                name: a.name || 'Agente',
                status: (a.status === 'online' || a.is_online) ? 'online' : 'busy',
                activeChats: a.active_chats || a.chats_count || 0
              }));
            } catch (jsonError) {
               console.warn('[OpaService] Error parsing agents JSON:', jsonError);
            }
          } else {
            console.warn(`[OpaService] Agents endpoint status: ${response.status}`);
          }
        } else {
           const msg = agentsResult.reason?.message || 'Unknown network error';
           console.warn(`[OpaService] Agents fetch issue: ${msg}`);
        }

        if (isSuccess) {
          return { tickets, attendants };
        } else if (networkError) {
           console.warn("[OpaService] Network/CORS error detected. Switching to Simulation Mode.");
           throw new Error("Network/CORS Error"); // Trigger fallback
        } else {
           throw new Error("API responded with errors"); // Trigger fallback
        }

      } catch (error) {
        // Silent fallback - intended behaviour for demo/resilience
        // We only log a small warning if it's not the manual Network/CORS error
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