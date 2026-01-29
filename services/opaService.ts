import { Ticket, Attendant, AppConfig, TicketStatus } from '../types';

// Mock Data Generators (Fallback)
const NAMES = ['Maria Silva', 'João Souza', 'Ana Pereira', 'Carlos Oliveira', 'Fernanda Lima', 'Roberto Santos'];
const CONTACTS = ['maria@exemplo.com', '11999998888', 'ana.p@company.com', 'carlos@tech.br', '5511988887777', 'roberto@email.com'];
const ATTENDANTS = ['Pedro Suporte', 'Julia Atendimento', 'Marcos Vendas'];

function generateMockTickets(): Ticket[] {
  return Array.from({ length: 8 }).map((_, i) => {
      let status: TicketStatus = 'waiting';
      const rand = Math.random();
      if (rand > 0.6) status = 'in_service';
      else if (rand > 0.3) status = 'bot';

      return {
          id: `MOCK-${i}`,
          protocol: `TEST-${i}`,
          clientName: NAMES[i % NAMES.length],
          contact: CONTACTS[i % CONTACTS.length],
          waitTimeSeconds: Math.floor(Math.random() * 600),
          status: status,
          department: 'Teste'
      };
  });
}

function generateMockAttendants(): Attendant[] {
  return ATTENDANTS.map((name, idx) => ({
    id: `ATT-${idx}`,
    name,
    status: 'online',
    activeChats: Math.floor(Math.random() * 3)
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

// Mapeia Status conforme solicitação do usuário
function mapApiStatus(statusRaw?: any): TicketStatus {
  if (!statusRaw) return 'finished'; // Ignora se não tiver status
  const s = String(statusRaw).toUpperCase().trim();
  
  // Debug para identificar status desconhecidos no console
  // console.log(`[StatusMap] Processing: ${s}`);

  // Em Atendimento ('EA')
  if (['EA', 'EM ATENDIMENTO', '2'].includes(s)) return 'in_service';
  
  // Com o Bot ('AG')
  if (['AG', 'AGUARDANDO', 'BOT'].includes(s)) return 'bot';

  // Em Espera ('E', 'EE')
  // 'A' removido propositalmente para filtrar apenas status de fila reais
  if (['E', 'EE', 'EM ESPERA', '1', 'T'].includes(s)) return 'waiting';
  
  // Finalizado
  if (['F', 'FINALIZADO', '3', '4'].includes(s)) return 'finished';
  
  // Fallback para 'finished' (oculto) em vez de 'waiting'
  // Isso impede que status desconhecidos ou 'A' (se não desejado) apareçam na lista de espera.
  return 'finished'; 
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
        const rawClients = data.clients || [];
        const rawContacts = data.contacts || [];

        console.log(`[OpaService] Tickets Brutos: ${rawTickets.length}`);
        
        // Debug para ajudar o usuário a ver quais status estão vindo
        if(rawTickets.length > 0) {
             const uniqueStatuses = [...new Set(rawTickets.map((t: any) => t.status || t.situacao))];
             console.log('[OpaService] Status Encontrados na API:', uniqueStatuses);
        }

        // 1. Criar mapa de Atendentes (ID -> Nome) e Lista Inicial
        const attendantMap = new Map<string, string>();
        
        let attendants: Attendant[] = rawAttendants.map((a: any) => {
          const id = String(a._id || a.id);
          const name = a.nome || a.name || 'Agente';
          attendantMap.set(id, name);
          
          // Mapeia status 'A' (Ativo da tabela de usuários) para 'online'
          const isOnline = a.status === 'A' || a.status === 'ativo' || a.is_online;

          return {
            id,
            name,
            status: isOnline ? 'online' : 'busy',
            activeChats: 0 // Será calculado abaixo
          };
        });

        // 2. Criar mapa de Clientes (ID -> Nome/Fantasia)
        const clientMap = new Map<string, string>();
        rawClients.forEach((c: any) => {
             const id = String(c._id || c.id);
             // Prioriza Nome, depois Fantasia
             const name = c.nome || c.fantasia || 'Cliente';
             clientMap.set(id, name);
        });

        // 3. Criar mapa de Contatos (Telefone -> Nome)
        const phoneMap = new Map<string, string>();
        rawContacts.forEach((c: any) => {
             if (c.nome && Array.isArray(c.fones)) {
                 c.fones.forEach((f: any) => {
                     if (f.numero) {
                         const cleanPhone = String(f.numero).replace(/\D/g, '');
                         phoneMap.set(cleanPhone, c.nome);
                     }
                 });
             }
        });

        // 4. Mapear Tickets
        const tickets: Ticket[] = rawTickets.map((t: any) => {
           const rawStatus = t.status || t.situacao;
           const status = mapApiStatus(rawStatus);
           const dateField = t.date || t.data_criacao; 

           let channelContact = '';
           if (t.canal_cliente) {
              channelContact = t.canal_cliente.split('@')[0];
           }

           let clientName = 'Cliente';
           let contact = 'N/A';
           
           if (t.id_cliente && typeof t.id_cliente === 'object') {
              clientName = t.id_cliente.nome || t.id_cliente.fantasia || clientName;
              contact = t.id_cliente.cpf_cnpj || t.id_cliente.telefone || channelContact || contact;
           } 
           else if (t.id_cliente && typeof t.id_cliente === 'string' && clientMap.has(t.id_cliente)) {
              clientName = clientMap.get(t.id_cliente) || clientName;
           }
           else if (t.cliente && typeof t.cliente === 'object' && (t.cliente.nome || t.cliente.fantasia)) {
              clientName = t.cliente.nome || t.cliente.fantasia;
           }
           else if (t.nome_cliente) {
              clientName = t.nome_cliente;
           }
           else if (t.origem && typeof t.origem === 'object') {
              if (t.origem.nome) clientName = t.origem.nome;
              else if (t.origem.apelido) clientName = t.origem.apelido;
              else if (t.origem.senderName) clientName = t.origem.senderName;
           }
           else if (t.client_name) {
              clientName = t.client_name;
           }

           if (contact === 'N/A' && channelContact) {
              contact = channelContact;
           }
           
           const isNameNumeric = /^\d+$/.test(clientName.replace(/\D/g, ''));
           
           if ((clientName === 'Cliente' || !clientName || isNameNumeric) && contact !== 'N/A') {
              const ticketPhone = contact.replace(/\D/g, '');
              if (phoneMap.has(ticketPhone)) {
                 clientName = phoneMap.get(ticketPhone)!;
              } else {
                 if (contact.startsWith('55') && contact.length >= 12) {
                    clientName = formatPhoneNumber(contact);
                 } else {
                    clientName = contact;
                 }
              }
           }

           let attendantName = undefined;
           if (t.id_atendente && typeof t.id_atendente === 'object') {
              attendantName = t.id_atendente.nome;
           } 
           else if (t.id_atendente) {
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

        // 5. Filtrar finalizados e desconhecidos (já mapeados como finished)
        const activeTickets = tickets.filter(t => t.status !== 'finished');

        // 6. Calcular Chats Ativos por Atendente
        activeTickets.forEach(t => {
           if (t.status === 'in_service' && t.attendantName) {
              const att = attendants.find(a => a.name === t.attendantName);
              if (att) {
                 att.activeChats++;
              }
           }
        });

        // 7. Fallback se não veio lista de atendentes
        if (attendants.length === 0 && activeTickets.length > 0) {
           const names = new Set<string>();
           activeTickets.forEach(t => {
             if (t.attendantName && t.status === 'in_service') names.add(t.attendantName);
           });
           attendants = Array.from(names).map((name, i) => ({
             id: `gen-${i}`, name, status: 'online', activeChats: 0
           }));
           activeTickets.forEach(t => {
              if (t.status === 'in_service' && t.attendantName) {
                 const att = attendants.find(a => a.name === t.attendantName);
                 if (att) att.activeChats++;
              }
           });
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