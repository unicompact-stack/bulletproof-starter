import { supabase, isSupabaseAvailable } from './supabase';
import type { ChatMessage } from '../types';

// ============ TASKS ============

export interface SupabaseTask {
  id: string;
  title: string;
  description: string | null;
  address: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  status: string;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function loadTasks(): Promise<SupabaseTask[]> {
  if (!isSupabaseAvailable()) return [];
  const { data, error } = await supabase!
    .from('fsm_tasks')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.warn('loadTasks error:', error.message); return []; }
  return data || [];
}

export async function createTask(task: Omit<SupabaseTask, 'id' | 'created_at' | 'updated_at'>): Promise<SupabaseTask | null> {
  if (!isSupabaseAvailable()) return null;
  const { data, error } = await supabase!
    .from('fsm_tasks')
    .insert(task)
    .select()
    .single();
  if (error) { console.warn('createTask error:', error.message); return null; }
  return data;
}

export async function updateTask(id: string, updates: Partial<SupabaseTask>): Promise<void> {
  if (!isSupabaseAvailable()) return;
  await supabase!.from('fsm_tasks').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
}

// ============ CHAT ============

export async function loadChatMessages(): Promise<ChatMessage[]> {
  if (!isSupabaseAvailable()) return [];
  const { data, error } = await supabase!
    .from('chat_messages')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) { console.warn('loadChat error:', error.message); return []; }
  return (data || []).map((m: any) => ({
    id: m.id,
    taskId: m.task_id || undefined,
    senderId: m.sender_id,
    senderName: m.sender_name,
    senderRole: m.sender_role,
    text: m.text,
    timestamp: m.created_at,
  }));
}

export async function sendChatMessageToSupabase(msg: {
  sender_id: string;
  sender_name: string;
  sender_role: string;
  task_id?: string;
  text: string;
}): Promise<ChatMessage | null> {
  if (!isSupabaseAvailable()) return null;
  const { data, error } = await supabase!
    .from('chat_messages')
    .insert({
      sender_id: msg.sender_id,
      sender_name: msg.sender_name,
      sender_role: msg.sender_role,
      task_id: msg.task_id || null,
      text: msg.text,
    })
    .select()
    .single();
  if (error) { console.warn('sendChat error:', error.message); return null; }
  return {
    id: data.id,
    taskId: data.task_id || undefined,
    senderId: data.sender_id,
    senderName: data.sender_name,
    senderRole: data.sender_role,
    text: data.text,
    timestamp: data.created_at,
  };
}

// ============ PRESENCE ============

export async function loadPresence(): Promise<Record<string, 'online' | 'offline'>> {
  if (!isSupabaseAvailable()) return {};
  const { data, error } = await supabase!.from('user_presence').select('*');
  if (error) { console.warn('loadPresence error:', error.message); return {}; }
  const result: Record<string, 'online' | 'offline'> = {};
  (data || []).forEach((p: any) => { result[p.user_id] = p.status; });
  return result;
}

export async function setPresenceOnSupabase(userId: string, status: 'online' | 'offline'): Promise<void> {
  if (!isSupabaseAvailable()) return;
  await supabase!.from('user_presence').upsert({
    user_id: userId,
    status,
    updated_at: new Date().toISOString(),
  });
}

// ============ REALTIME SUBSCRIPTIONS ============

type RealtimeCallback = (table: string, payload: any) => void;

export function subscribeToChanges(onChange: RealtimeCallback): () => void {
  if (!isSupabaseAvailable()) return () => {};

  const channel = supabase!
    .channel('fsm-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fsm_tasks' }, (p) => onChange('fsm_tasks', p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, (p) => onChange('chat_messages', p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'user_presence' }, (p) => onChange('user_presence', p))
    .subscribe();

  return () => { supabase!.removeChannel(channel); };
}
