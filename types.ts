
export interface Profile {
  id: string; // uuid
  full_name: string;
  mobile_number: string;
  is_approved: boolean;
  is_active: boolean;
  mobile_verified?: boolean; // New field
  otp_code?: string | null; // New field (internal use, usually hidden but needed for manual admin send)
  otp_expires_at?: string | null; // New field
  subscription_start_date: string | null; // ISO string
  subscription_end_date: string | null; // ISO string
  role: 'user' | 'admin';
  created_at?: string; // ISO string
  updated_at?: Date;
}


export interface Session {
  id: string;
  court: string;
  caseNumber: string;
  date: Date;
  clientName: string;
  opponentName: string;
  postponementReason?: string;
  nextPostponementReason?: string;
  isPostponed: boolean;
  nextSessionDate?: Date;
  assignee?: string;
  // For contextual rendering in flat lists
  stageId?: string;
  stageDecisionDate?: Date;
  updated_at?: Date;
  user_id?: string;
}

export interface Stage {
  id: string;
  court: string;
  caseNumber: string;
  firstSessionDate?: Date;
  sessions: Session[];
  decisionDate?: Date;
  decisionNumber?: string;
  decisionSummary?: string;
  decisionNotes?: string;
  updated_at?: Date;
  user_id?: string;
}

export interface Case {
  id: string;
  subject: string;
  clientName: string;
  opponentName: string;
  stages: Stage[];
  feeAgreement: string;
  status: 'active' | 'closed' | 'on_hold';
  updated_at?: Date;
  user_id?: string;
}

export interface Client {
  id: string;
  name: string;
  contactInfo: string;
  cases: Case[];
  updated_at?: Date;
  user_id?: string;
}

export interface AdminTask {
    id: string;
    task: string;
    dueDate: Date;
    completed: boolean;
    importance: 'normal' | 'important' | 'urgent';
    assignee?: string;
    location?: string;
    updated_at?: Date;
    orderIndex?: number;
}

export interface Appointment {
    id: string;
    title: string;
    time: string;
    date: Date;
    importance: 'normal' | 'important' | 'urgent';
    completed: boolean;
    notified?: boolean;
    reminderTimeInMinutes?: number;
    assignee?: string;
    updated_at?: Date;
}

export interface AccountingEntry {
    id: string;
    type: 'income' | 'expense';
    amount: number;
    date: Date;
    description: string;
    clientId: string;
    caseId: string;
    clientName: string;
    updated_at?: Date;
}

export interface InvoiceItem {
  id: string;
  description: string;
  amount: number;
  updated_at?: Date;
}

export interface Invoice {
  id: string; // e.g., INV-2024-001
  clientId: string;
  clientName: string;
  caseId?: string;
  caseSubject?: string;
  issueDate: Date;
  dueDate: Date;
  items: InvoiceItem[];
  taxRate: number; // Percentage, e.g., 14 for 14%
  discount: number; // Fixed amount
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  notes?: string;
  updated_at?: Date;
}

export interface SiteFinancialEntry {
  id: number;
  user_id: string | null;
  type: 'income' | 'expense';
  payment_date: string;
  amount: number;
  description: string | null;
  payment_method: string | null;
  category?: string | null;
  profile_full_name?: string;
  updated_at?: Date;
}

export interface CaseDocument {
  id: string;
  caseId: string;
  userId: string;
  name: string;
  type: string;
  size: number;
  addedAt: Date;
  storagePath: string; // e.g., 'user-uuid/case-id/doc-id-filename.pdf'
  localState: 'synced' | 'pending_upload' | 'pending_download' | 'error' | 'downloading';
  updated_at?: Date;
}

export interface AppData {
    clients: Client[];
    adminTasks: AdminTask[];
    appointments: Appointment[];
    accountingEntries: AccountingEntry[];
    invoices: Invoice[];
    assistants: string[];
    documents: CaseDocument[];
    profiles: Profile[];
    siteFinances: SiteFinancialEntry[];
}

export interface DeletedIds {
    clients: string[];
    cases: string[];
    stages: string[];
    sessions: string[];
    adminTasks: string[];
    appointments: string[];
    accountingEntries: string[];
    invoices: string[];
    invoiceItems: string[];
    assistants: string[];
    documents: string[];
    documentPaths: string[];
    profiles: string[];
    siteFinances: string[];
}

export const getInitialDeletedIds = (): DeletedIds => ({
    clients: [], cases: [], stages: [], sessions: [], adminTasks: [], appointments: [], accountingEntries: [], invoices: [], invoiceItems: [], assistants: [], documents: [], documentPaths: [], profiles: [], siteFinances: []
});
