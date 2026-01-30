
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
  // Added optional date fields to store creation and completion times for dashboard analytics
  createdAt?: string;
  closedAt?: string;
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
  avgServiceTimeSeconds: number;
}

export interface AppConfig {
  apiUrl: string;
  apiToken: string;
}
