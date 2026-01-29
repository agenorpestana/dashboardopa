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
function mapApiStatus(statusRaw?: string): TicketStatus {
  if (!statusRaw) return 'waiting'; // Assumir fila se não tiver status
  
  const s = String(statusRaw).toUpperCase().trim();
  
  // Logs para ajudar no debug se aparecer algo novo
  // console.log('Mapeando status:', s);

  // LISTA DE STATUS - OPA SUITE E SIMILARES
  // EA = Em Atendimento
  // A = Aberto (Fila)
  // P = Pendente (Fila)
  // T = Triagem (Fila)
  // F = Finalizado
  // C = Cancelado
  
  if (['EA', 'EM ATENDIMENTO', 'ATENDIMENTO', 'IN_SERVICE', 'SERVING'].some(val => s.includes(val)) || s === 'EA') {
    return 'in_service';
  }
  
  if (['F', 'FINALIZADO', 'RESOLVIDO', 'CLOSED', 'R', 'C', 'CANCELADO'].some(val => s === val || s.includes(val))) {
    return 'finished';
  }
  
  // Qualquer outra coisa (A, P, T, Aberto, Pendente, Triagem) cai como fila
  return 'waiting';
}

// API Service
export const opaService = {
  fetchData: async (config: AppConfig): Promise<{ tickets: Ticket[], attendants: Attendant[] }> => {
    // 1. Try to fetch from our Local Proxy (Server.js)
    if (config.apiUrl && config.apiToken) {
      try {
        console.log(`[OpaService] Fetching data via local proxy...`);
        
        const response = await fetch('/api/dashboard-data');

        if (!response.ok) {
           throw new Error(`Proxy error: ${response.status}`);
        }

        const data = await response.json();
        
        // Data comes pre-structured from our server proxy
        const rawTickets = data.tickets || [];
        const rawAttendants = data.attendants || [];

        console.log(`[OpaService] Raw Tickets received: ${rawTickets.length}`);
        
        // --- DIAGNÓSTICO DE DEBUG ---
        if (rawTickets.length > 0) {
          // 1. Mostrar estrutura do primeiro ticket para verificar campos
          console.log('[DEBUG] Estrutura do 1º Ticket:', rawTickets[0]);
          
          // 2. Listar todos os status únicos retornados pela API
          const uniqueStatuses = [...new Set(rawTickets.map((t: any) => t.status))];
          console.log('[DEBUG] Lista de Status Encontrados na API:', uniqueStatuses);
        }
        // ---------------------------

        // Map Tickets
        const tickets: Ticket[] = rawTickets.map((t: any) => {
           // Normalização de campos para lidar com variações da API
           const rawStatus = t.status || t.situacao || t.state;
           const mappedStatus = mapApiStatus(rawStatus);
           const dateField = t.date || t.created_at || t.started_at || t.data_criacao;
           
           return {
              id: String(t._id || t.id),
              protocol: t.protocolo || t.protocol || `PROT-${String(t._id || t.id).substring(0,6)}`,
              clientName: t.id_cliente?.nome || t.client_name || t.contact?.name || 'Cliente Desconhecido',
              contact: t.id_cliente?.cpf_cnpj || t.id_cliente?.telefone || t.contact || 'N/A',
              waitTimeSeconds: calculateSeconds(dateField),
              // Se status for EA, duração é calculada. Se não, é undefined.
              durationSeconds: (mappedStatus === 'in_service') ? calculateSeconds(dateField) : undefined,
              status: mappedStatus,
              attendantName: t.id_atendente?.nome || t.attendant_name || t.agent?.name,
              department: t.setor?.nome || t.setor?.toString() || t.department || 'Geral'
           };
        });

        // Filtrar finalizados. 
        // IMPORTANTE: Se o dashboard estiver vazio, verifique o log [DEBUG] Status Encontrados.
        // Se só tiver status "F" ou "FINALIZADO", a API está enviando histórico antigo.
        const activeTickets = tickets.filter((t: Ticket) => t.status !== 'finished');
        
        console.log(`[OpaService] Tickets Ativos (pós-filtro): ${activeTickets.length}`);

        // Map Attendants
        let attendants: Attendant[] = rawAttendants.map((a: any) => ({
          id: String(a._id || a.id),
          name: a.nome || a.name || 'Agente',
          status: (a.status === 'ativo' || a.status === 'online' || a.is_online) ? 'online' : 'busy',
          activeChats: 0
        }));

        // Fallback: Se a lista de atendentes vier vazia, extrair dos tickets ativos
        if (attendants.length === 0 && activeTickets.length > 0) {
           const agentMap = new Map<string, number>();
           activeTickets.forEach(t => {
              if (t.status === 'in_service' && t.attendantName) {
                 agentMap.set(t.attendantName, (agentMap.get(t.attendantName) || 0) + 1);
              }
           });
           
           agentMap.forEach((count, name) => {
              attendants.push({
                 id: `inf-${name.replace(/\s+/g, '')}`,
                 name,
                 status: 'online',
                 activeChats: count
              });
           });
        }

        return { tickets: activeTickets, attendants };

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