
import { Ticket, Attendant, AppConfig, TicketStatus } from '../types';

/**
 * Converte strings de data do Opa Suite (YYYY-MM-DD HH:mm:ss ou ISO) para timestamp.
 * Tratamento manual para evitar falhas de parsing em diferentes browsers.
 */
function toTimestamp(dateVal: any): number {
  if (!dateVal) return 0;
  if (typeof dateVal === 'number') return dateVal;
  
  const s = String(dateVal).trim();
  if (!s || s.startsWith('0000')) return 0;

  try {
    // Tenta converter YYYY-MM-DD HH:mm:ss para YYYY-MM-DDTHH:mm:ss
    const iso = s.includes(' ') && !s.includes('T') ? s.replace(' ', 'T') : s;
    let ts = Date.parse(iso);
    
    // Se falhar (NaN), tenta um parse manual agressivo
    if (isNaN(ts)) {
      const parts = s.split(/[- :]/); // Divide por -, espaço ou :
      if (parts.length >= 3) {
        // Assume YYYY, MM, DD, HH, mm, ss
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
  if (endTime === 0) return 0;
  
  const diff = Math.floor((endTime - startTime) / 1000);
  return diff > 0 ? diff : 0;
}

function determineTicketStatus(t: any, departmentName?: string): TicketStatus {
  const statusRaw = t.status || t.situacao || t.estado;
  const s = statusRaw ? String(statusRaw).toUpperCase().trim() : '';

  if (['F', '3', '4', 'FINALIZADO', 'CONCLUIDO'].includes(s)) return 'finished';
  if (['EA', 'EM ATENDIMENTO', '2', 'A'].includes(s)) return 'in_service';
  if (s === 'PS' || s === 'BOT') return 'bot';

  // Se tem atendente, provavelmente está em atendimento
  if (t.id_atendente || t.atendente) return 'in_service';

  if (['AG', 'AGUARDANDO', 'E', 'EE', 'EM ESPERA', '1', 'T', ''].includes(s)) {
     const hasDept = departmentName && 
                    departmentName !== 'Geral' && 
                    departmentName !== 'Sem Setor' && 
                    departmentName !== 'Suporte' &&
                    departmentName.trim() !== '';
     return hasDept ? 'waiting' : 'bot';
  }

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
        const rawDept = t.id_departamento || t.setor || t.departamento;
        let deptName = '';
        if (typeof rawDept === 'object' && rawDept?.nome) deptName = rawDept.nome;
        else if (deptMap.has(String(rawDept))) deptName = deptMap.get(String(rawDept));

        const status = determineTicketStatus(t, deptName);
        
        // 2. Resolver Datas (Busca exaustiva por campos de data)
        const dateCreated = t.data_criacao || t.data_abertura || t.createdAt || t.dt_criacao;
        const dateStarted = t.data_inicio || t.data_atendimento || t.dt_inicio || t.data_hora_inicio; 
        const dateEnded = t.data_fechamento || t.data_fim || t.updatedAt || t.dt_fechamento;

        // 3. Resolver Nome do Cliente (Lógica Anti-Protocolo Agressiva)
        let clientName = '';
        
        // Lista de campos onde o nome REAL costuma estar no Opa Suite
        const nameSources = [
          t.id_cliente?.nome,
          t.id_cliente?.razao_social,
          t.id_contato?.nome,
          t.cliente_nome,
          t.contato_nome,
          t.cliente?.nome,
          t.nome_cliente,
          t.nome
        ];

        for (const candidate of nameSources) {
          if (candidate) {
            const val = String(candidate).trim();
            // Verificação: não pode ser o protocolo, não pode ser apenas números longos, não pode ser vazio
            if (val && 
                val !== protocol && 
                val.toLowerCase() !== 'cliente' && 
                !/^[A-Z]{2,4}\d{8,}/.test(val) && // Ignora padrões ITL2025...
                val.length > 2) {
              clientName = val;
              break;
            }
          }
        }

        // Se falhou, tenta achar o telefone
        if (!clientName) {
          const fone = t.id_contato?.fone || t.id_cliente?.fone || t.contato_fone || t.fone;
          if (fone && String(fone).length > 5) clientName = String(fone);
        }

        // Último recurso: Protocolo (o que está acontecendo no seu print)
        if (!clientName) clientName = protocol || 'Cliente Anonimo';

        // 4. Resolver Nome do Atendente
        let attName = undefined;
        if (t.id_atendente?.nome) attName = t.id_atendente.nome;
        else if (t.atendente_nome) attName = t.atendente_nome;
        else if (attMap.has(String(t.id_atendente))) attName = attMap.get(String(t.id_atendente));

        return {
          id: String(t._id || t.id),
          protocol: protocol || 'N/A',
          clientName: clientName,
          contact: '',
          // Espera: Criado até Início (se ainda não iniciou, usa Agora)
          waitTimeSeconds: calculateDuration(dateCreated, dateStarted || undefined),
          // Atendimento: Início até Fim (se em curso, usa Agora)
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
      console.error("[OpaService] Erro Fatal:", e);
      return { tickets: [], attendants: [] };
    }
  }
};
