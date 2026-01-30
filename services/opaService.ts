
import { Ticket, Attendant, AppConfig, TicketStatus } from '../types';

/**
 * Converte strings de data do Opa Suite (YYYY-MM-DD HH:mm:ss) para timestamp.
 * Resolve problemas de fuso horário forçando a data a ser tratada como local.
 */
function parseOpaDate(dateStr?: any): number {
  if (!dateStr) return 0;
  if (typeof dateStr === 'number') return dateStr;
  
  try {
    const s = String(dateStr).trim();
    if (!s) return 0;
    
    // Substitui espaço por T para formato ISO, mas garante que o browser não trate como UTC puro se não houver Z
    const iso = s.replace(' ', 'T');
    const ts = Date.parse(iso);
    
    return isNaN(ts) ? 0 : ts;
  } catch {
    return 0;
  }
}

function calculateSeconds(startStr?: any, endStr?: any): number {
  const start = parseOpaDate(startStr);
  if (start === 0) return 0;
  
  const end = endStr ? parseOpaDate(endStr) : Date.now();
  if (end === 0) return 0;
  
  const diff = Math.floor((end - start) / 1000);
  return diff > 0 ? diff : 0;
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
        
        // Mapeamento de Datas (Opa costuma variar os nomes entre versões)
        const dateCreated = t.data_criacao || t.data_abertura || t.createdAt;
        const dateStarted = t.data_inicio || t.data_atendimento || t.dt_inicio; 
        const dateEnded = t.data_fechamento || t.data_fim || t.updatedAt;

        // RESOLUÇÃO DE NOME (Filtro Anti-Protocolo)
        const protocol = (t.protocolo || '').trim();
        let clientName = '';

        const nameCandidates = [
          t.cliente_nome,
          t.contato_nome,
          t.id_cliente?.nome,
          t.id_cliente?.razao_social,
          t.id_contato?.nome,
          t.nome
        ];

        // Regex para detectar padrão de protocolo (ex: ITL20240101...)
        const protocolRegex = /^[A-Z]{2,4}\d{8,}/i;

        for (const candidate of nameCandidates) {
          if (candidate) {
            const val = String(candidate).trim();
            if (val && 
                val.toLowerCase() !== 'cliente' && 
                val !== protocol && 
                !protocolRegex.test(val) &&
                val.length > 2) {
              clientName = val;
              break;
            }
          }
        }

        // Se falhar, tenta telefone antes de aceitar o protocolo
        if (!clientName) {
          const phone = t.contato_fone || t.id_contato?.fone || t.id_cliente?.fone || t.fone;
          if (phone && String(phone).length > 5) clientName = String(phone);
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
          // Espera: Da criação até o Início (ou Agora)
          waitTimeSeconds: calculateSeconds(dateCreated, dateStarted || undefined),
          // Atendimento: Do início (ou criação se não houver início) até o Fim (ou Agora)
          durationSeconds: calculateSeconds(dateStarted || dateCreated, status === 'finished' ? dateEnded : undefined),
          status,
          attendantName: attName,
          department: deptName || 'Sem Setor',
          createdAt: dateCreated,
          closedAt: dateEnded
        };
      });

      // Contagem de chats ativos por atendente
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
