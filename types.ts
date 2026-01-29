export type TicketStatus = 'waiting' | 'in_service' | 'finished' | 'bot';

export interface Ticket {
  id: string;
  protocol: string;
  clientName: string;
  contact: string;
  waitTimeSeconds: number; // Time waiting in queue
  durationSeconds?: number; // Time in service
  status: TicketStatus;
  attendantName?: string;
  department?: string;
}

export interface Attendant {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'busy';
  activeChats: number;
}

export interface DashboardStats {
  waitingCount: number;
  botCount: number;
  inServiceCount: number;
  attendantCount: number;
  avgWaitTimeSeconds: number;
}

export interface AppConfig {
  apiUrl: string;
  apiToken: string;
}