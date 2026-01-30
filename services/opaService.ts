
import { Ticket, Attendant, AppConfig, TicketStatus } from '../types';

function calculateSeconds(dateStr?: string): number {
  if (!dateStr) return 0;
  const start = new Date(dateStr).getTime();
  const now = new Date().getTime();
  return Math.max(0, Math.floor((now - start) / 1000));
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
  
  let result = p;
  if (p.startsWith('55') && p.length >= 12) {
    const sub = p.substring(2);
    if (sub.length === 11) result = `(${sub.substring(0,2)}) ${sub.substring(2,7)}-${sub.substring(7)}`;
    else if (sub.length === 10) result = `(${sub.substring(0,2)}) ${sub.substring(2,6)}-${sub.substring(6)}`;
  } else if (p.length === 11) {
    result = `(${p.substring(0,2)}) ${p.substring(2,7)}-${p.substring(7)}`;
  } else if (p.length === 10) {
    result = `(${p.substring(0,2)}) ${p.substring(2,6)}-${p.substring(6)}`;
  }
  return result;
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
        const dateStart = t.data_inicio || t.data_criacao || t.date;
        const dateEnd = t.data_fechamento || t.updated_at;

        // RESOLUÇÃO AGRESSIVA DE NOME / TELEFONE
        let nameFound = null;

        // 1. Verificar em todas as propriedades de NOME possíveis
        const possibleNames = [
          t.id_cliente?.nome,
          t.id_cliente?.name,
          t.id_cliente?.razao_social,
          t.nome_cliente,
          t.cliente?.nome,
          t.contato_nome,
          t.id_contato?.nome,
          t.id_contato?.name,
          t.nome
        ];

        for (const n of possibleNames) {
          if (n && String(n).trim() !== '' && String(n).toLowerCase() !== 'cliente') {
            nameFound = String(n).trim();
            break;
          }
        }

        // 2. Se não achou nome, buscar Telefone em todas as fontes
        if (!nameFound) {
          const possiblePhones = [
            t.contato_fone,
            t.fone,
            t.telefone,
            t.id_contato?.fone,
            t.id_contato?.telefone,
            t.id_cliente?.fone,
            t.id_cliente?.telefone
          ];
          for (const p of possiblePhones) {
            const formatted = formatPhone(p);
            if (formatted && formatted.length > 5) {
              nameFound = formatted;
              break;
            }
          }
        }

        // 3. Fallback se nada foi encontrado
        if (!nameFound) nameFound = 'Cliente';

        let attName = undefined;
        if (t.id_atendente?.nome) attName = t.id_atendente.nome;
        else if (attMap.has(String(t.id_atendente))) attName = attMap.get(String(t.id_atendente));

        return {
          id: String(t._id || t.id),
          protocol: t.protocolo || 'N/A',
          clientName: nameFound,
          contact: '',
          waitTimeSeconds: calculateSeconds(dateStart),
          durationSeconds: calculateSeconds(dateStart),
          status,
          attendantName: attName,
          department: deptName || 'Sem Setor',
          createdAt: dateStart,
          closedAt: dateEnd
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
