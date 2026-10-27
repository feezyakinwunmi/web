import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { useFeedback } from './Toast';
import { Button, Spinner, Textarea, cx } from './ui';
import { supabase } from '../lib/supabase';
import { dateTime } from '../lib/format';

export interface Complaint {
  id: string;
  user_id: string;
  user_name: string | null;
  user_role: string | null;
  order_id: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  title: string;
  description: string;
  status: 'pending' | 'resolved' | 'rejected';
  response: string | null;
  created_at: string;
  resolved_at: string | null;
  updated_at: string | null;
  last_message_at: string | null;
}

interface Message {
  id: string;
  complaint_id: string;
  sender_id: string;
  sender_role: string;
  body: string;
  created_at: string;
}

// The conversation on one complaint between the person who raised it and Vesphe support.
export function ComplaintThread({ complaint }: { complaint: Complaint }) {
  const { profile } = useAuth();
  const { toast } = useFeedback();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const isAdmin = profile?.role === 'admin';
  const canReply = isAdmin || complaint.status === 'pending';

  useEffect(() => {
    let active = true;
    setLoading(true);
    supabase
      .from('complaint_messages')
      .select('*')
      .eq('complaint_id', complaint.id)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) toast(error.message, 'error');
        setMessages((data as Message[]) || []);
        setLoading(false);
      });

    const channel = supabase
      .channel(`complaint-${complaint.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'complaint_messages', filter: `complaint_id=eq.${complaint.id}` }, payload => {
        const m = payload.new as Message;
        setMessages(prev => (prev.some(p => p.id === m.id) ? prev : [...prev, m]));
      })
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [complaint.id, toast]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, loading]);

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body || !profile) return;
    setSending(true);
    const { data, error } = await supabase
      .from('complaint_messages')
      .insert({ complaint_id: complaint.id, sender_id: profile.id, body })
      .select()
      .single();
    setSending(false);
    if (error) return toast(error.message, 'error');
    setText('');
    setMessages(prev => (prev.some(p => p.id === data.id) ? prev : [...prev, data as Message]));
  };

  // The original complaint is shown as the first message from its author.
  const opening: Message = {
    id: 'opening',
    complaint_id: complaint.id,
    sender_id: complaint.user_id,
    sender_role: complaint.user_role || 'customer',
    body: complaint.description,
    created_at: complaint.created_at,
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {loading ? (
          <Spinner label="Loading conversation…" />
        ) : (
          [opening, ...messages].map(m => {
            const fromSupport = m.sender_role === 'admin';
            const mine = m.sender_id === profile?.id;
            return (
              <div key={m.id} className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
                <div
                  className={cx(
                    'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm',
                    mine ? 'rounded-br-sm bg-brand text-white' : 'rounded-bl-sm border border-line bg-surface-2'
                  )}
                >
                  <div className={cx('mb-0.5 text-[11px] font-medium', mine ? 'text-white/80' : 'text-ink-3')}>
                    {fromSupport ? 'Vesphe support' : m.sender_id === complaint.user_id ? complaint.user_name || 'User' : m.sender_role}
                  </div>
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                  <div className={cx('mt-1 text-[10px]', mine ? 'text-white/70' : 'text-ink-3')}>{dateTime(m.created_at)}</div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottom} />
      </div>

      {canReply ? (
        <form onSubmit={send} className="flex items-end gap-2 border-t border-line p-3">
          <Textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={isAdmin ? 'Reply to the user…' : 'Write a message to Vesphe support…'}
            className="min-h-10 flex-1 resize-none"
            rows={2}
            maxLength={4000}
          />
          <Button type="submit" loading={sending} disabled={!text.trim()} icon={<Send className="size-4" />}>Send</Button>
        </form>
      ) : (
        <div className="border-t border-line p-3 text-center text-xs text-ink-3">
          This complaint is {complaint.status}. Open a new complaint if you still need help.
        </div>
      )}
    </div>
  );
}
