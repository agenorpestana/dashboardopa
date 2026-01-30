
import { Ticket, Attendant, AppConfig, TicketStatus } from '../types';

/**
 * Converte qualquer formato de data do Opa Suite para timestamp numérico.
 * Garante que o formato "YYYY-MM-DD HH:mm:ss" seja tratado corretamente.
 */
function toTimestamp(dateVal: any): number {
  if (!dateVal) return 0;
  if (typeof dateVal === 'number') return dateVal;
  
  try {
    const s = String(dateVal).trim();
    if (!s || s === '0000-00-00 00:00:00') return 0;
    
    // Substitui espaço por T para compatibilidade ISO (YYYY-MM-DDTHH:mm:ss)
    const isoStr = s.replace(' ', 'T');
    const ts = new Date(isoStr).getTime();
    
    return isNaN(ts) ? 0 : ts;
  } catch {
    return 0;
  }
}

function calculateDuration(start: any, end?: any): number {
  const startTime = toTimestamp(start);
  if (startTime === 0) return 0;
  
  const endTime = end ? toTimestamp(end) : Date.now();
  if (endTime === 0) return 0;
  
  const diff = Math.floor((endTime - startTime) / 1000);
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
        const protocol = (t.protocolo || '').trim();
        
        // 1. Resolver Setor
        const rawDept = t.setor || t.id_departamento || t.departamento;
        let deptName = '';
        if (typeof rawDept === 'object' && rawDept?.nome) deptName = rawDept.nome;
        else if (deptMap.has(String(rawDept))) deptName = deptMap.get(String(rawDept));

        const status = determineTicketStatus(t, deptName);
        
        // 2. Resolver Datas (Variações do Opa)
        const dateCreated = t.data_criacao || t.data_abertura || t.createdAt || t.dt_criacao;
        const dateStarted = t.data_inicio || t.data_atendimento || t.dt_inicio || t.data_hora_inicio; 
        const dateEnded = t.data_fechamento || t.data_fim || t.updatedAt || t.dt_fechamento;

        // 3. Resolver Nome do Cliente (Lógica Anti-Protocolo)
        let clientName = '';
        const nameCandidates = [
          t.id_cliente?.nome,
          t.id_cliente?.razao_social,
          t.cliente_nome,
          t.id_contato?.nome,
          t.contato_nome,
          t.nome
        ];

        for (const candidate of nameCandidates) {
          if (candidate) {
            const val = String(candidate).trim();
            // Só aceita se for diferente do protocolo e não for "Cliente"
            if (val && val !== protocol && val.toLowerCase() !== 'cliente' && val.length > 2) {
              clientName = val;
              break;
            }
          }
        }

        // Fallback: Se ainda estiver vazio, tenta fone ou por último o protocolo
        if (!clientName) {
          const fone = t.id_contato?.fone || t.id_cliente?.fone || t.contato_fone;
          clientName = fone ? String(fone) : (protocol || 'Cliente');
        }

        // 4. Resolver Atendente
        let attName = undefined;
        if (t.id_atendente?.nome) attName = t.id_atendente.nome;
        else if (attMap.has(String(t.id_atendente))) attName = attMap.get(String(t.id_atendente));

        return {
          id: String(t._id || t.id),
          protocol: protocol || 'N/A',
          clientName: clientName,
          contact: '',
          // Espera: Da criação até o Início (ou Agora se ainda espera)
          waitTimeSeconds: calculateDuration(dateCreated, dateStarted),
          // Atendimento: Do início até o Fim (ou Agora se em curso)
          durationSeconds: dateStarted ? calculateDuration(dateStarted, status === 'finished' ? dateEnded : undefined) : 0,
          status,
          attendantName: attName,
          department: deptName || 'Suporte',
          createdAt: dateCreated,
          closedAt: dateEnded
        };
      });

      // Atualizar contagem de chats ativos
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
