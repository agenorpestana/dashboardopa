import { Ticket, Attendant, AppConfig, TicketStatus } from '../types';

// Calcula segundos passados
function calculateSeconds(dateStr?: string): number {
  if (!dateStr) return 0;
  const start = new Date(dateStr).getTime();
  const now = new Date().getTime();
  return Math.max(0, Math.floor((now - start) / 1000));
}

// Formata telefone BR (55 + DDD + Numero)
function formatPhoneNumber(phone: string): string {
  if (!phone) return phone;
  const nums = phone.replace(/\D/g, '');
  
  const mobileMatch = nums.match(/^55(\d{2})(\d{5})(\d{4})$/);
  if (mobileMatch) return `(${mobileMatch[1]}) ${mobileMatch[2]}-${mobileMatch[3]}`;

  const landlineMatch = nums.match(/^55(\d{2})(\d{4})(\d{4})$/);
  if (landlineMatch) return `(${landlineMatch[1]}) ${landlineMatch[2]}-${landlineMatch[3]}`;

  return phone;
}

// Função de Lógica de Status (Status + Setor)
function determineTicketStatus(statusRaw: any, departmentName?: string): TicketStatus {
  if (!statusRaw) return 'finished'; 
  
  const s = String(statusRaw).toUpperCase().trim();

  // 1. Em Atendimento ('EA')
  if (['EA', 'EM ATENDIMENTO', '2'].includes(s)) {
    return 'in_service';
  }
  
  // 2. Lógica para 'AG' (Aguardando) e 'PS' (Pesquisa)
  if (['AG', 'AGUARDANDO', 'BOT', 'PS'].includes(s)) {
     if (s === 'PS') return 'bot';
     const hasDepartment = departmentName && departmentName !== 'Geral' && departmentName !== 'Sem Setor';
     if (hasDepartment) {
        return 'waiting';
     } else {
        return 'bot';
     }
  }

  // 3. Status explícitos de espera
  if (['E', 'EE', 'EM ESPERA', '1', 'T'].includes(s)) {
    return 'waiting';
  }
  
  // 4. Finalizados
  if (['F', 'FINALIZADO', '3', '4'].includes(s)) {
    return 'finished';
  }
  
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
        const rawDepartments = data.departments || [];

        // 1. Criar mapas de apoio
        const attendantMap = new Map<string, string>();
        let attendants: Attendant[] = rawAttendants.map((a: any) => {
          const id = String(a._id || a.id);
          const name = a.nome || a.name || 'Agente';
          attendantMap.set(id, name);
          const isOnline = a.status === 'A' || a.status === 'ativo' || a.is_online;
          return { id, name, status: isOnline ? 'online' : 'busy', activeChats: 0 };
        });

        const clientMap = new Map<string, string>();
        rawClients.forEach((c: any) => {
             clientMap.set(String(c._id || c.id), c.nome || c.fantasia || 'Cliente');
        });

        const phoneMap = new Map<string, string>();
        rawContacts.forEach((c: any) => {
             if (c.nome && Array.isArray(c.fones)) {
                 c.fones.forEach((f: any) => {
                     if (f.numero) phoneMap.set(String(f.numero).replace(/\D/g, ''), c.nome);
                 });
             }
        });

        const departmentMap = new Map<string, string>();
        rawDepartments.forEach((d: any) => {
            departmentMap.set(String(d._id || d.id), d.nome || 'Setor');
        });

        // 2. Mapear Tickets (Todos, incluindo finalizados)
        const tickets: Ticket[] = rawTickets.map((t: any) => {
           const rawStatus = t.status || t.situacao;
           const rawDept = t.setor || t.departamento || t.id_departamento; 

           let departmentName = undefined;
           if (typeof rawDept === 'object' && rawDept?.nome) departmentName = rawDept.nome;
           else if (typeof rawDept === 'string' && departmentMap.has(rawDept)) departmentName = departmentMap.get(rawDept);

           const status = determineTicketStatus(rawStatus, departmentName);
           const dateField = t.date || t.data_criacao || t.data_inicio; 
           const dateEnd = t.data_fechamento || t.updated_at;

           let clientName = 'Cliente';
           if (t.id_cliente && typeof t.id_cliente === 'object') clientName = t.id_cliente.nome || t.id_cliente.fantasia || clientName;
           else if (t.nome_cliente) clientName = t.nome_cliente;

           let attendantName = undefined;
           if (t.id_atendente && typeof t.id_atendente === 'object') attendantName = t.id_atendente.nome;
           else if (t.id_atendente) attendantName = attendantMap.get(String(t.id_atendente));

           return {
              id: String(t._id || t.id),
              protocol: t.protocolo || 'N/A',
              clientName: clientName || 'Cliente',
              contact: '',
              waitTimeSeconds: calculateSeconds(dateField),
              durationSeconds: (status === 'in_service' || status === 'finished') ? calculateSeconds(dateField) : undefined,
              status,
              attendantName,
              department: departmentName || 'Geral',
              createdAt: dateField,
              closedAt: dateEnd
           };
        });

        // 3. Calcular Chats Ativos apenas para os não finalizados
        tickets.forEach(t => {
           if (t.status === 'in_service' && t.attendantName) {
              const att = attendants.find(a => a.name === t.attendantName);
              if (att) att.activeChats++;
           }
        });

        return { tickets, attendants };

      } catch (error) {
        console.warn("[OpaService] Erro na conexão:", error);
        return { tickets: [], attendants: [] };
      }
    }
    return { tickets: [], attendants: [] };
  }
};