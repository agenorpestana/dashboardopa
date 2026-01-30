
import { Ticket, Attendant, AppConfig, TicketStatus } from '../types';

function calculateSeconds(startStr?: string, endStr?: string): number {
  if (!startStr) return 0;
  try {
    const start = new Date(startStr.replace(' ', 'T')).getTime();
    if (isNaN(start)) return 0;
    const end = endStr ? new Date(endStr.replace(' ', 'T')).getTime() : new Date().getTime();
    if (isNaN(end)) return 0;
    
    const diff = Math.floor((end - start) / 1000);
    return diff > 0 ? diff : 0;
  } catch {
    return 0;
  }
}

function determineTicketStatus(t: any, departmentName?: string): TicketStatus {
  const statusRaw = t.status || t.situacao;
  const s = statusRaw ? String(statusRaw).toUpperCase().trim() : '';

  if (['F', '3', '4', 'FINALIZADO'].includes(s)) return 'finished';
  if (['EA', 'EM ATENDIMENTO', '2'].includes(s)) return 'in_service';
  if (s === 'PS') return 'bot';

  if (['AG', 'AGUARDANDO', 'BOT', 'E', 'EE', 'EM ESPERA', '1', 'T', ''].includes(s)) {
     const hasDept = departmentName && 
                    departmentName !== 'Geral' && 
                    departmentName !== 'Sem Setor' && 
                    departmentName.trim() !== '';
     return hasDept ? 'waiting' : 'bot';
  }

  if (t.id_atendente) return 'in_service';
  return 'bot'; 
}

export const opaService = {
  fetchData: async (config: AppConfig): Promise<{ tickets: Ticket[], attendants: Attendant[] }> => {
    if (!config.apiUrl || !config.apiToken) return { tickets: [], attendants: [] };
    try {
      const response = await fetch('/api/dashboard-data');
      if (!response.ok) return { tickets: [], attendants: [] };
      const data = await response.json();
      
      const rawTickets = data.tickets || [];
      const rawAttendants = data.attendants || [];
      const rawDepartments = data.departments || [];

      const deptMap = new Map();
      rawDepartments.forEach((d: any) => deptMap.set(String(d._id || d.id), d.nome));

      const attMap = new Map();
      const attendants: Attendant[] = rawAttendants.map((a: any) => {
        const id = String(a._id || a.id);
        const name = a.nome || a.name || 'Agente';
        attMap.set(id, name);
        return { id, name, status: 'online', activeChats: 0 };
      });

      const tickets: Ticket[] = rawTickets.map((t: any) => {
        const rawDept = t.setor || t.id_departamento || t.departamento;
        let deptName = '';
        if (typeof rawDept === 'object' && rawDept?.nome) deptName = rawDept.nome;
        else if (deptMap.has(String(rawDept))) deptName = deptMap.get(String(rawDept));

        const status = determineTicketStatus(t, deptName);
        
        const dateCreated = t.data_criacao || t.data_abertura || t.createdAt;
        const dateStarted = t.data_inicio || t.data_atendimento; 
        const dateEnded = t.data_fechamento || t.data_fim || t.updatedAt;

        // LÓGICA DE NOME RESTAURADA E MELHORADA
        const protocol = t.protocolo || '';
        let clientName = '';

        const namePriority = [
          t.id_cliente?.nome,
          t.id_cliente?.razao_social,
          t.id_contato?.nome,
          t.cliente_nome,
          t.contato_nome,
          t.nome
        ];

        for (const n of namePriority) {
          if (n && String(n).trim() !== '' && n !== protocol && String(n).toLowerCase() !== 'cliente') {
            clientName = String(n).trim();
            break;
          }
        }

        if (!clientName) clientName = protocol || 'Cliente';

        let attName = undefined;
        if (t.id_atendente?.nome) attName = t.id_atendente.nome;
        else if (attMap.has(String(t.id_atendente))) attName = attMap.get(String(t.id_atendente));

        return {
          id: String(t._id || t.id),
          protocol: protocol || 'N/A',
          clientName: clientName,
          contact: '',
          // Espera: Da criação até o Início (ou até Agora se não iniciou)
          waitTimeSeconds: calculateSeconds(dateCreated, dateStarted || undefined),
          // Atendimento: Do início até o Fim (ou até Agora se ainda ativo)
          durationSeconds: dateStarted ? calculateSeconds(dateStarted, status === 'finished' ? dateEnded : undefined) : 0,
          status,
          attendantName: attName,
          department: deptName || 'Sem Setor',
          createdAt: dateCreated,
          closedAt: dateEnded
        };
      });

      tickets.forEach(t => {
        if (t.status === 'in_service' && t.attendantName) {
          const a = attendants.find(att => att.name === t.attendantName);
          if (a) a.activeChats++;
        }
      });

      return { tickets, attendants };
    } catch (e) {
      console.error("[OpaService] Erro:", e);
      return { tickets: [], attendants: [] };
    }
  }
};
