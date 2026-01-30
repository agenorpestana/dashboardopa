
import { Ticket, Attendant, AppConfig, TicketStatus } from '../types';

function calculateSeconds(startStr?: string, endStr?: string): number {
  if (!startStr) return 0;
  try {
    const start = new Date(startStr).getTime();
    if (isNaN(start)) return 0;
    
    // Usamos o tempo do servidor se disponível, ou o tempo local
    const end = endStr ? new Date(endStr).getTime() : new Date().getTime();
    if (isNaN(end)) return 0;
    
    const diff = Math.floor((end - start) / 1000);
    // Se a diferença for negativa (drift de relógio), retornamos pelo menos 1 segundo se o ticket existir
    return diff > 0 ? diff : 1;
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

function formatPhone(phone?: any): string | null {
  if (!phone) return null;
  const p = String(phone).replace(/\D/g, '');
  if (p.length < 8) return p;
  
  if (p.startsWith('55') && p.length >= 12) {
    const sub = p.substring(2);
    return sub.length === 11 ? `(${sub.substring(0,2)}) ${sub.substring(2,7)}-${sub.substring(7)}` : `(${sub.substring(0,2)}) ${sub.substring(2,6)}-${sub.substring(6)}`;
  } else if (p.length === 11) {
    return `(${p.substring(0,2)}) ${p.substring(2,7)}-${p.substring(7)}`;
  } else if (p.length === 10) {
    return `(${p.substring(0,2)}) ${p.substring(2,6)}-${p.substring(6)}`;
  }
  return p;
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
        
        // MAPEAMENTO DE DATAS (Opa Suite é inconsistente entre versões)
        const dateCreated = t.data_criacao || t.data_abertura || t.createdAt || t.data_cad;
        const dateStarted = t.data_inicio || t.data_atendimento || t.dt_atendimento || t.dt_inicio; 
        const dateEnded = t.data_fechamento || t.data_fim || t.updatedAt || t.data_fin;

        // RESOLUÇÃO DE NOME AVANÇADA
        let nameFound = null;
        
        // 1. Tentar campos de nome direto
        const prioritizedNames = [
          t.id_cliente?.razao_social,
          t.id_cliente?.nome,
          t.id_contato?.nome,
          t.cliente_nome,
          t.contato_nome,
          t.nome_cliente,
          t.nome
        ];

        for (const n of prioritizedNames) {
          const val = n ? String(n).trim() : '';
          // Se o valor NÃO for o protocolo (ex: ITL...) e NÃO for "Cliente", usamos ele.
          if (val && 
              val.toLowerCase() !== 'cliente' && 
              !/^[A-Z]{2,4}\d{6,}/.test(val) && // Regex mais específica para protocolos Opa
              val.length > 3) {
            nameFound = val;
            break;
          }
        }

        // 2. Se não achou nome real, tentar telefone
        if (!nameFound) {
          const phone = t.id_contato?.fone || t.id_cliente?.fone || t.contato_fone || t.fone;
          const formatted = formatPhone(phone);
          if (formatted && formatted.length > 5) {
            nameFound = formatted;
          }
        }

        // 3. Fallback: Se ainda estiver vazio ou for apenas o protocolo, tenta pegar o protocolo formatado
        if (!nameFound) {
          nameFound = t.protocolo || `Ticket ${String(t._id || t.id).slice(-6)}`;
        }

        let attName = undefined;
        if (t.id_atendente?.nome) attName = t.id_atendente.nome;
        else if (attMap.has(String(t.id_atendente))) attName = attMap.get(String(t.id_atendente));

        return {
          id: String(t._id || t.id),
          protocol: t.protocolo || 'N/A',
          clientName: nameFound,
          contact: '',
          // Espera: da criação ao início. Se ainda não iniciou, usa data atual.
          waitTimeSeconds: calculateSeconds(dateCreated, dateStarted || undefined),
          // Atendimento: do início ao fim. Se ainda ativo, usa data atual.
          // Importante: Se dateStarted for nulo, usamos dateCreated como fallback para evitar zerar o tempo visual
          durationSeconds: calculateSeconds(dateStarted || dateCreated, status === 'finished' ? dateEnded : undefined),
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
      console.error("[OpaService] Erro fatal:", e);
      return { tickets: [], attendants: [] };
    }
  }
};
