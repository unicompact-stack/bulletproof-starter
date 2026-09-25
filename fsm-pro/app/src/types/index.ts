export type UserRole = 'dispatcher' | 'technician' | 'admin';

export type TaskStatus = 
  | 'new'                   // Новая (зелёный)
  | 'assigned'              // Назначена (фиолетовый)
  | 'in_progress'           // В работе (синий)
  | 'under_review'          // На проверке (пурпурный)
  | 'completed';            // Завершена (принята руководителем)

export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export interface User {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  role: UserRole;
  avatar: string;
  specializations: string[];
  isActive: boolean;
  status: 'available' | 'busy' | 'offline';
  // Заблокирован руководителем: по коду не пустит («уволен» / «заморожен»)
  isBlocked?: boolean;
  // Профиль мастера — заполняет сам мастер (админ только смотрит)
  about?: string;
  age?: string;
  currentLocation?: {
    lat: number;
    lng: number;
    updatedAt: string;
  };
}

export interface ChecklistItem {
  id: string;
  title: string;
  isRequired: boolean;
  isCompleted: boolean;
  completedAt?: string;
  completedBy?: string;
}

export type PhotoCategory = 
  | 'before'       // До начала работ
  | 'process'      // Процесс выполнения
  | 'result'       // Результат
  | 'defects'      // Обнаруженные дефекты
  | 'materials'    // Использованные материалы
  | 'documents';   // Документы или показания

export interface TaskPhoto {
  id: string;
  taskId: string;
  url: string;
  thumbnailUrl?: string;
  category: PhotoCategory;
  comment?: string;
  createdAt: string;
  createdBy: string;
  lat?: number;
  lng?: number;
  syncStatus: 'synced' | 'pending' | 'failed';
  fileSizeKb: number;
}

export interface TaskMaterial {
  id: string;
  taskId: string;
  name: string;
  plannedQty: number;
  actualQty: number;
  unit: string;
  warehouseStatus: 'issued' | 'pending' | 'ordered';
}

export interface StatusHistoryEntry {
  id: string;
  taskId: string;
  oldStatus: TaskStatus | null;
  newStatus: TaskStatus;
  comment?: string;
  changedBy: string;
  changedByName: string;
  changedAt: string;
  lat?: number;
  lng?: number;
}

export interface Task {
  id: string;
  number: string;
  title: string;
  description: string;
  workType: string;
  status: TaskStatus;
  priority: Priority;
  address: {
    full: string;
    city: string;
    street: string;
    building: string;
    entrance?: string;
    floor?: string;
    apartment?: string;
    lat: number;
    lng: number;
  };
  customer: {
    name: string;
    phone: string;
    comment?: string;
  };
  plannedStart: string;
  plannedEnd: string;
  actualStart?: string;
  actualEnd?: string;
  durationMinutes?: number;
  assignedUserId: string;
  assignedUser?: User;
  dispatcherComment?: string;
  technicianComment?: string;
  customerSignature?: string; // base64 data url
  customerSignatureDate?: string;
  checklist: ChecklistItem[];
  photos: TaskPhoto[];
  materials: TaskMaterial[];
  statusHistory: StatusHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  // Offline metadata
  isLocalOnly?: boolean;
  syncPending?: boolean;
  // Визуальная пометка просрочки (статус остаётся из 5 базовых)
  isOverdue?: boolean;
  // Возврат на доработку: статус остаётся «В работе», но мастер видит пометку и комментарий
  needsRework?: boolean;
  reworkComment?: string;
  // Фиксация прибытия на объект (кнопка «Я на объекте»)
  arrivalAt?: string;
  arrivalLocation?: { lat: number; lng: number };
}

export interface OfflineAction {
  id: string;
  timestamp: string;
  type: 'STATUS_CHANGE' | 'CHECKLIST_TOGGLE' | 'PHOTO_ADD' | 'PHOTO_DELETE' | 'MATERIAL_UPDATE' | 'TASK_COMPLETE' | 'TASK_CREATE' | 'COMMENT_ADD';
  taskId: string;
  payload: any;
  status: 'pending' | 'synced' | 'failed';
  retryCount: number;
}

// Сообщение в чате между диспетчером и рабочими.
// recipientId отсутствует — сообщение в общий чат;
// recipientId задан — личное сообщение между двумя пользователями.
export interface ChatMessage {
  id: string;
  taskId?: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  recipientId?: string;
  text: string;
  timestamp: string;
}
