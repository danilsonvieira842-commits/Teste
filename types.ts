
export enum Priority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

export type UserRole = 'admin' | 'editor' | 'viewer';

export interface NotificationSettings {
  slackEnabled: boolean;
  slackWebhookUrl?: string;
  whatsappEnabled: boolean;
  whatsappNumber?: string;
  notifyOnHighPriority: boolean;
  notifyOnMentions: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  photoURL?: string;
  role: UserRole;
  lang: 'pt' | 'en';
  points: number;
  googleCalendarSync?: boolean;
  outlookCalendarSync?: boolean;
  notifications: NotificationSettings;
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: string;
  url: string;
}

export interface Comment {
  id: string;
  text: string;
  author: string;
  timestamp: number;
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  tags: string[];
  createdAt: number;
  dueDate?: number;
  subtasks: Subtask[];
  complexity?: number; 
  comments: Comment[];
  icon?: string;
  attachments: Attachment[];
  assigneeId?: string;
}

export interface Column {
  id: string;
  title: string;
  taskIds: string[];
}

export interface BoardData {
  tasks: Record<string, Task>;
  columns: Record<string, Column>;
  columnOrder: string[];
  userStats: {
    points: number;
    level: number;
    badges: string[];
  };
  team?: User[];
}

export interface AISuggestion {
  title: string;
  description: string;
  priority: Priority;
  tags: string[];
  dueDate?: string;
}

export interface PrioritizationResult {
  columnOrders: Record<string, string[]>;
  priorityChanges: Record<string, Priority>;
  insight: string;
}

export interface DeadlinePredictionResult {
  suggestedDate: string; // ISO format
  reasoning: string;
}
