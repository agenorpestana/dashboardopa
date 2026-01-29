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
  // Math.max(0) previne números negativos caso o relógio do servidor esteja levemente adiantado
  return Math.max(0, Math.floor((now - start) / 1000));
}

// Formata telefone BR (55 + DDD + Numero)
function formatPhoneNumber(phone: string): string {
  if (!phone) return phone;
  // Remove caracteres não numéricos
  const nums = phone.replace(/\D/g, '');
  
  // Verifica se é celular BR (55 + 2 digitos DDD + 9 digitos numero)
  const mobileMatch = nums.match(/^55(\d{2})(\d{5})(\d{4})$/);
  if (mobileMatch) {
    return `(${mobileMatch[1]}) ${mobileMatch[2]}-${mobileMatch[3]}`;
  }

  // Verifica se é fixo BR (55 + 2 digitos DDD + 8 digitos numero)
  const landlineMatch = nums.match(/^55(\d{2})(\d{4})(\d{4})$/);
  if (landlineMatch) {
    return `(${landlineMatch[1]}) ${landlineMatch[2]}-${landlineMatch[3]}`;
  }

  return phone;
}

// Mapeia Status
function mapApiStatus(statusRaw?: any): TicketStatus {
  if (!statusRaw) return 'waiting'; 
  const s = String(statusRaw).toUpperCase().trim();
  
  // Em Atendimento
  if (s === 'EA' || s === 'EM ATENDIMENTO' || s === '2') return 'in_service';
  
  // Finalizado
  if (s === 'F' || s === 'FINALIZADO' || s === '3' || s === '4') return 'finished';
  
  // Aguardando / Triagem / Pendente
  if (s === 'AG' || s === 'AGUARDANDO' || s === 'T' || s === '1') return 'waiting';
  
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

           // Extrai contato do canal se disponível (ex: 55119999@c.us)
           let channelContact = '';
           if (t.canal_cliente) {
              channelContact = t.canal_cliente.split('@')[0];
           }

           // --- Lógica de Prioridade de Nome ---
           let clientName = 'Cliente';
           let contact = 'N/A';
           
           // 1. Prioridade: Campo "id_cliente" populado (objeto)
           if (t.id_cliente && typeof t.id_cliente === 'object') {
              clientName = t.id_cliente.nome || clientName;
              contact = t.id_cliente.cpf_cnpj || t.id_cliente.telefone || channelContact || contact;
           } 
           // 2. Prioridade: Campo "cliente" explícito
           else if (t.cliente && typeof t.cliente === 'object' && t.cliente.nome) {
              clientName = t.cliente.nome;
           }
           // 3. Prioridade: Campo "nome_cliente" (snake_case) na raiz
           else if (t.nome_cliente) {
              clientName = t.nome_cliente;
           }
           // 4. Prioridade: Dados de "origem" (geralmente Push Name do WhatsApp)
           else if (t.origem && typeof t.origem === 'object') {
              if (t.origem.nome) {
                 clientName = t.origem.nome;
              } else if (t.origem.apelido) {
                 clientName = t.origem.apelido;
              } else if (t.origem.senderName) {
                 clientName = t.origem.senderName;
              }
           }
           // 5. Fallback para nome antigo se existir
           else if (t.client_name) {
              clientName = t.client_name;
           }

           // Se contato ainda é N/A, usa o do canal
           if (contact === 'N/A' && channelContact) {
              contact = channelContact;
           }
           
           // Se o nome ainda for genérico "Cliente" E tivermos o contato, usamos o contato formatado como último recurso
           // Mas apenas se realmente não achamos nenhum nome acima.
           if ((clientName === 'Cliente' || !clientName) && contact !== 'N/A') {
              if (contact.startsWith('55') && contact.length >= 12) {
                 clientName = formatPhoneNumber(contact);
              } else {
                 clientName = contact;
              }
           }

           // Atendente: Tenta pegar objeto, senão busca no mapa, senão usa 'Atendente'
           let attendantName = undefined;
           if (t.id_atendente && typeof t.id_atendente === 'object') {
              attendantName = t.id_atendente.nome;
           } else if (t.id_atendente) {
              attendantName = attendantMap.get(String(t.id_atendente));
           }

           if (!attendantName && t.id_atendente) {
              attendantName = "Atendente"; 
           }

           return {
              id: String(t._id || t.id),
              protocol: t.protocolo || 'N/A',
              clientName: clientName || 'Cliente',
              contact: formatPhoneNumber(contact),
              waitTimeSeconds: calculateSeconds(dateField),
              durationSeconds: (status === 'in_service') ? calculateSeconds(dateField) : undefined,
              status,
              attendantName,
              department: typeof t.setor === 'object' ? t.setor?.nome : 'Geral'
           };
        });

        // 3. Filtrar finalizados (Garantia extra no front)
        const activeTickets = tickets.filter(t => t.status !== 'finished');

        // 4. Se não veio lista de atendentes da API, improvisar com base nos tickets
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
