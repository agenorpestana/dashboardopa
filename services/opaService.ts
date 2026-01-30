
import { Ticket, Attendant, AppConfig, TicketStatus } from '../types';

/**
 * Converte strings de data do Opa Suite para timestamp.
 */
function toTimestamp(dateVal: any): number {
  if (!dateVal) return 0;
  if (typeof dateVal === 'number') return dateVal;
  
  const s = String(dateVal).trim();
  if (!s || s.startsWith('0000')) return 0;

  try {
    const iso = s.includes(' ') && !s.includes('T') ? s.replace(' ', 'T') : s;
    let ts = Date.parse(iso);
    
    if (isNaN(ts)) {
      const parts = s.split(/[- :]/);
      if (parts.length >= 3) {
        const d = new Date(
          parseInt(parts[0]), 
          parseInt(parts[1]) - 1, 
          parseInt(parts[2]), 
          parseInt(parts[3]) || 0, 
          parseInt(parts[4]) || 0, 
          parseInt(parts[5]) || 0
        );
        ts = d.getTime();
      }
    }
    return isNaN(ts) ? 0 : ts;
  } catch {
    return 0;
  }
}

function calculateDuration(start: any, end?: any): number {
  const startTime = toTimestamp(start);
  if (startTime === 0) return 0;
  const endTime = end ? toTimestamp(end) : Date.now();
  const diff = Math.floor((endTime - startTime) / 1000);
  return diff > 0 ? diff : 0;
}

function determineTicketStatus(t: any, departmentName?: string): TicketStatus {
  const statusRaw = t.status || t.situacao || t.estado;
  const s = statusRaw ? String(statusRaw).toUpperCase().trim() : '';
  
  // 1. Finalizados
  if (['F', '3', '4', 'FINALIZADO', 'CONCLUIDO'].includes(s)) return 'finished';
  
  // 2. Em Atendimento (Prioridade para status explícito da API)
  if (['EA', 'EM ATENDIMENTO', '2', 'A'].includes(s)) return 'in_service';
  
  // 3. Em Espera ou Bot
  if (['AG', 'AGUARDANDO', 'E', 'EE', 'EM ESPERA', '1', 'T', ''].includes(s)) {
     // Se tem um setor válido (incluindo Suporte), é Fila de Espera
     const hasRealDept = departmentName && 
                         departmentName.toLowerCase() !== 'geral' && 
                         departmentName.toLowerCase() !== 'sem setor' && 
                         departmentName.trim() !== '';
     return hasRealDept ? 'waiting' : 'bot';
  }

  // Fallback: Se tem atendente físico, assume em atendimento
  if (t.id_atendente && typeof t.id_atendente === 'object') return 'in_service';

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
        const protocol = (t.protocolo || '').trim();
        
        const rawDept = t.id_departamento || t.setor || t.departamento;
        let deptName = '';
        if (typeof rawDept === 'object' && rawDept?.nome) deptName = rawDept.nome;
        else if (deptMap.has(String(rawDept))) deptName = deptMap.get(String(rawDept));

        const status = determineTicketStatus(t, deptName);
        
        const dateCreated = t.data_criacao || t.data_abertura || t.createdAt || t.dt_criacao;
        const dateStarted = t.data_inicio || t.data_atendimento || t.dt_inicio || t.data_hora_inicio; 
        const dateEnded = t.data_fechamento || t.data_fim || t.updatedAt || t.dt_fechamento;

        // RESOLUÇÃO DE NOME (Filtro Anti-Protocolo Melhorado)
        let clientName = '';
        const nameSources = [
          t.id_contato?.nome,
          t.id_cliente?.nome,
          t.id_cliente?.razao_social,
          t.cliente_nome,
          t.contato_nome,
          t.nome
        ];

        // Regex para capturar ITL2025... ou apenas números longos
        const isProtocolPattern = (str: string) => /^[A-Z]{2,4}\d{6,}/i.test(str) || /^\d{10,}$/.test(str);

        for (const candidate of nameSources) {
          if (candidate) {
            const val = String(candidate).trim();
            if (val && 
                val !== protocol && 
                !isProtocolPattern(val) &&
                val.toLowerCase() !== 'cliente' && 
                val.length > 2) {
              clientName = val;
              break;
            }
          }
        }

        if (!clientName) {
          const fone = t.id_contato?.fone || t.id_cliente?.fone || t.fone;
          clientName = (fone && String(fone).length > 5) ? String(fone) : (protocol || 'Cliente');
        }

        let attName = undefined;
        if (t.id_atendente?.nome) attName = t.id_atendente.nome;
        else if (attMap.has(String(t.id_atendente))) attName = attMap.get(String(t.id_atendente));

        return {
          id: String(t._id || t.id),
          protocol: protocol || 'N/A',
          clientName: clientName,
          contact: '',
          // Se status é waiting, calcula desde a criação. Se já iniciou, calcula criação até o início.
          waitTimeSeconds: status === 'waiting' 
            ? calculateDuration(dateCreated) 
            : calculateDuration(dateCreated, dateStarted),
          // Se status é in_service, calcula desde o início.
          durationSeconds: status === 'in_service' 
            ? calculateDuration(dateStarted || dateCreated) 
            : 0,
          status,
          attendantName: attName,
          department: deptName || 'Suporte',
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
