
import { Ticket, Attendant, AppConfig, TicketStatus } from '../types';

function parseOpaDate(dateStr?: string): number {
  if (!dateStr) return 0;
  // Converte "2025-02-26 14:00:00" para "2025-02-26T14:00:00" para compatibilidade ISO
  const isoStr = dateStr.includes(' ') && !dateStr.includes('T') 
    ? dateStr.replace(' ', 'T') 
    : dateStr;
  const timestamp = Date.parse(isoStr);
  return isNaN(timestamp) ? 0 : timestamp;
}

function calculateSeconds(startStr?: string, endStr?: string): number {
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
        
        // Datas brutas da API
        const dateCreated = t.data_criacao || t.data_abertura || t.createdAt;
        const dateStarted = t.data_inicio || t.data_atendimento; 
        const dateEnded = t.data_fechamento || t.data_fim || t.updatedAt;

        // RESOLUÇÃO DE NOME AVANÇADA
        const protocol = t.protocolo || '';
        let clientName = '';

        // Campos onde o nome real costuma estar
        const nameSources = [
          t.id_cliente?.nome,
          t.id_cliente?.razao_social,
          t.id_contato?.nome,
          t.cliente_nome,
          t.contato_nome,
          t.nome
        ];

        // Regex para identificar se o valor é um protocolo (Inicia com letras e tem muitos números)
        const isProtocolRegex = /^[A-Z]{2,4}\d{6,}/i;

        for (const source of nameSources) {
          if (source) {
            const val = String(source).trim();
            // Só aceita se não for vazio, não for a palavra "cliente" e NÃO for o protocolo
            if (val !== '' && 
                val.toLowerCase() !== 'cliente' && 
                val !== protocol && 
                !isProtocolRegex.test(val)) {
              clientName = val;
              break;
            }
          }
        }

        // Se não achou nome real, tenta telefone como alternativa ao protocolo
        if (!clientName) {
          const phone = t.id_contato?.fone || t.id_cliente?.fone || t.contato_fone || t.fone;
          if (phone && String(phone).length > 5) {
            clientName = String(phone);
          }
        }

        // Se ABSOLUTAMENTE tudo falhar, usa o protocolo
        if (!clientName) clientName = protocol || 'Cliente';

        let attName = undefined;
        if (t.id_atendente?.nome) attName = t.id_atendente.nome;
        else if (attMap.has(String(t.id_atendente))) attName = attMap.get(String(t.id_atendente));

        return {
          id: String(t._id || t.id),
          protocol: protocol || 'N/A',
          clientName: clientName,
          contact: '',
          // Espera: Da criação até o Início (ou Agora se na fila)
          waitTimeSeconds: calculateSeconds(dateCreated, dateStarted || undefined),
          // Atendimento: Do início até o Fim (ou Agora se em aberto)
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
      console.error("[OpaService] Erro ao processar dados:", e);
      return { tickets: [], attendants: [] };
    }
  }
};
