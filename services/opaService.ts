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

// Helper to map API status string/object to internal TicketStatus
function mapApiStatus(statusRaw?: any): TicketStatus {
  if (!statusRaw) return 'waiting'; 

  // Normalizar: se for objeto (ex: {id: 2, nome: "Em Atendimento"}), pegar id ou nome
  let s = '';
  if (typeof statusRaw === 'object' && statusRaw !== null) {
     s = String(statusRaw.id || statusRaw.nome || statusRaw.name || '').toUpperCase();
  } else {
     s = String(statusRaw).toUpperCase().trim();
  }

  // Mapeamento por ID Numérico (Comum em versões recentes do OPA)
  // 1 = Pendente/Fila, 2 = Em Atendimento, 3 = Finalizado, 4 = Cancelado
  if (s === '2') return 'in_service';
  if (s === '1') return 'waiting';
  if (s === '3' || s === '4') return 'finished';
  
  // Mapeamento por Texto
  if (['EA', 'EM ATENDIMENTO', 'ATENDIMENTO', 'IN_SERVICE', 'SERVING', 'EXECUCAO'].some(val => s.includes(val)) || s === 'EA') {
    return 'in_service';
  }
  
  if (['F', 'FINALIZADO', 'RESOLVIDO', 'CLOSED', 'R', 'C', 'CANCELADO', 'ENCERRADO'].some(val => s === val || s.includes(val))) {
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
        
        // Log Debug Info do Server se existir
        if (data.debug_info) {
          console.log('[OpaService] Server Debug:', data.debug_info);
        }

        const rawTickets = data.tickets || [];
        const rawAttendants = data.attendants || [];

        console.log(`[OpaService] Raw Tickets received: ${rawTickets.length}`);
        
        // --- DIAGNÓSTICO AVANÇADO ---
        if (rawTickets.length > 0) {
          console.groupCollapsed('[DEBUG] Análise de Dados da API');
          console.log('Exemplo do 1º Ticket (Raw):', rawTickets[0]);
          
          // Verificar quais campos de status existem
          const sample = rawTickets[0];
          console.log('Campos de Status detectados:', {
             status: sample.status,
             situacao: sample.situacao,
             state: sample.state,
             stage: sample.stage
          });
          
          const uniqueStatuses = [...new Set(rawTickets.map((t: any) => {
             const s = t.status || t.situacao || t.state;
             return typeof s === 'object' ? JSON.stringify(s) : s;
          }))];
          console.log('Status Únicos Encontrados:', uniqueStatuses);
          console.groupEnd();
        } else {
          console.warn('[OpaService] ATENÇÃO: Nenhum ticket retornado pelo Proxy. Verifique se o backend conseguiu conectar.');
        }
        // ---------------------------

        // Map Tickets
        const tickets: Ticket[] = rawTickets.map((t: any) => {
           // Normalização de campos para lidar com variações da API
           // Tenta 'situacao' primeiro, pois é comum ser o ID numérico
           const rawStatus = t.situacao || t.status || t.state;
           const mappedStatus = mapApiStatus(rawStatus);
           const dateField = t.date || t.created_at || t.started_at || t.data_criacao || t.data_inicio;
           
           return {
              id: String(t._id || t.id),
              protocol: t.protocolo || t.protocol || `PROT-${String(t._id || t.id).substring(0,6)}`,
              clientName: t.id_cliente?.nome || t.client_name || t.contact?.name || 'Cliente Desconhecido',
              contact: t.id_cliente?.cpf_cnpj || t.id_cliente?.telefone || t.contact || 'N/A',
              waitTimeSeconds: calculateSeconds(dateField),
              durationSeconds: (mappedStatus === 'in_service') ? calculateSeconds(dateField) : undefined,
              status: mappedStatus,
              attendantName: t.id_atendente?.nome || t.attendant_name || t.agent?.name,
              department: t.setor?.nome || t.setor?.toString() || t.department || 'Geral'
           };
        });

        // IMPORTANTE: Agora mostramos no console quantos ficaram em cada status após o mapeamento
        const countByStatus = tickets.reduce((acc: any, t) => {
            acc[t.status] = (acc[t.status] || 0) + 1;
            return acc;
        }, {});
        console.log('[OpaService] Contagem pós-mapeamento:', countByStatus);

        // Filtrar finalizados apenas para a UI
        const activeTickets = tickets.filter((t: Ticket) => t.status !== 'finished');
        
        console.log(`[OpaService] Tickets Ativos para UI: ${activeTickets.length}`);

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