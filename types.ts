
export enum TaskCategory {
  PRIVATE = 'Private',
  EDUCATION = 'Education',
  ENTERTAINMENT = 'Entertainment',
  OTHERS = 'Others'
}

export enum TaskPriority {
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low'
}

export interface Task {
  id: string;
  title: string;
  notes?: string;
  category: TaskCategory;
  priority: TaskPriority;
  estimatedDuration: number; // in minutes
  reminderTime?: string; // ISO string or simple HH:mm
  alarmEnabled?: boolean;
  completed: boolean;
  createdAt: number;
}

export interface UserProfile {
  name: string;
  mantra: string;
  avatarUrl?: string;
  joinedDate: number;
}

export interface GeneralNote {
  id: string;
  content: string;
  createdAt: number;
  color?: string;
}

export interface AIAdvice {
  summary: string;
  recommendations: string[];
  focusScore: number;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}
