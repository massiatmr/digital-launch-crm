import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Send, RotateCcw, Plus, User, MessageSquare, Bot, Trash2, Zap, Loader2, ArrowDown, ArrowUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

type SandboxLead = { id: string; name: string; status: string | null; created_at: string };
type WaMessage = { id: string; direction: 'inbound' | 'outbound'; content: string; sent_at: string; task_id: string | null };
type FollowupTask = { id: string; task_type: string; scheduled_for: string; status: string; message: string | null };

const SANDBOX_TAG = '[SANDBOX]';

const TASK_TYPES = [
  'initial_message', 'followup_1', 'followup_2', 'last_followup',
  'qualification', 'propose_meeting', 'reactivation', 'template_24h',
];

export default function SettingsSandboxPage() {
  const { user } = useAuth();
  const { currentWorkspace, currentWorkspaceId } = useWorkspaces();
  const [leads, setLeads] = useState<SandboxLead[]>([]);
  const [leadId, setLeadId] = useState<string>('');
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [tasks, setTasks] = useState<FollowupTask[]>([]);
  const [input, setInput] = useState('');
  const [direction, setDirection] = useState<'inbound' | 'outbound'>('inbound');
  const [taskType, setTaskType] = useState('followup_1');
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiPreview, setAiPreview] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadLeads = async () => {
    if (!currentWorkspaceId) { setLeads([]); setLeadId(''); return; }
    const { data } = await supabase
      .from('leads')
      .select('id, name, status, created_at, notes')
      .eq('workspace_id', currentWorkspaceId)
      .ilike('notes', `%${SANDBOX_TAG}%`)
      .order('created_at', { ascending: false })
      .limit(20);
    setLeads((data ?? []) as any);
    if (data && data.length > 0 && !data.find((l: any) => l.id === leadId)) {
      setLeadId(data[0].id);
    } else if (!data || data.length === 0) {
      setLeadId('');
    }
  };

  // Reload when workspace changes
  useEffect(() => { loadLeads(); /* eslint-disable-next-line */ }, [currentWorkspaceId]);

  const loadConversation = async () => {
    if (!leadId) { setMessages([]); setTasks([]); return; }
    const [{ data: msgs }, { data: tks }] = await Promise.all([
      supabase.from('whatsapp_messages').select('id, direction, content, sent_at, task_id').eq('lead_id', leadId).order('sent_at', { ascending: true }),
      supabase.from('lead_followup_tasks').select('id, task_type, scheduled_for, status, message').eq('lead_id', leadId).order('scheduled_for', { ascending: true }),
    ]);
    setMessages((msgs ?? []) as any);
    setTasks((tks ?? []) as any);
  };

  useEffect(() => { loadConversation(); }, [leadId]);

  // Realtime
  useEffect(() => {
    if (!leadId) return;
    const ch = supabase
      .channel(`sandbox-${leadId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_messages', filter: `lead_id=eq.${leadId}` }, loadConversation)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_followup_tasks', filter: `lead_id=eq.${leadId}` }, loadConversation)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [leadId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const currentLead = useMemo(() => leads.find((l) => l.id === leadId), [leads, leadId]);

  const createSandboxLead = async () => {
    if (!user) return;
    if (!currentWorkspaceId) { toast.error('Aucun workspace actif'); return; }
    setBusy(true);
    try {
      const stamp = new Date().toLocaleString('fr-FR');
      const { data, error } = await supabase
        .from('leads')
        .insert({
          name: `Sandbox ${stamp}`,
          source: 'manual',
          status: 'new',
          notes: `${SANDBOX_TAG} Lead de test — créé le ${stamp} (workspace: ${currentWorkspace?.company_name ?? ''})`,
          message: 'Bonjour, je suis intéressé(e), pouvez-vous me donner plus d\'infos ?',
          owner_id: user.id,
          workspace_id: currentWorkspaceId,
        } as any)
        .select('id, name, status, created_at')
        .single();
      if (error) throw error;
      toast.success('Lead sandbox créé');
      await loadLeads();
      setLeadId(data.id);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const deleteSandboxLead = async () => {
    if (!leadId) return;
    if (!confirm('Supprimer ce lead sandbox et toute sa conversation ?')) return;
    setBusy(true);
    try {
      await supabase.from('whatsapp_messages').delete().eq('lead_id', leadId);
      await supabase.from('lead_followup_tasks').delete().eq('lead_id', leadId);
      await supabase.from('leads').delete().eq('id', leadId);
      toast.success('Lead sandbox supprimé');
      setLeadId('');
      await loadLeads();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const sendMessage = async () => {
    if (!leadId || !input.trim() || !user) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('whatsapp_messages').insert({
        lead_id: leadId,
        direction,
        content: input.trim(),
        status: 'sandbox',
        owner_id: user.id,
        workspace_id: currentWorkspaceId,
        message_type: 'text',
        channel: 'whatsapp',
      } as any);
      if (error) throw error;
      setInput('');
      setAiPreview(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const generateAiReply = async () => {
    if (!leadId) return;
    setAiBusy(true);
    setAiPreview(null);
    try {
      const { data, error } = await supabase.functions.invoke('generate-followup-message', {
        body: { lead_id: leadId, task_type: taskType, workspace_id: currentWorkspaceId },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      const msg = data?.message || data?.content || JSON.stringify(data);
      setAiPreview(msg);
    } catch (e: any) {
      toast.error('IA: ' + e.message);
    } finally {
      setAiBusy(false);
    }
  };

  const sendAiAsOutbound = async () => {
    if (!aiPreview || !leadId || !user) return;
    setBusy(true);
    try {
      await supabase.from('whatsapp_messages').insert({
        lead_id: leadId, direction: 'outbound', content: aiPreview, status: 'sandbox',
        owner_id: user.id, workspace_id: currentWorkspaceId, message_type: 'text', channel: 'whatsapp', intent: `ai_${taskType}`,
      } as any);
      setAiPreview(null);
      toast.success('Réponse IA envoyée dans la conversation');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const runSequenceTest = async () => {
    if (!leadId) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('test-followup-sequence', { body: { lead_id: leadId, workspace_id: currentWorkspaceId } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast.success(`Séquence lancée — ${data.steps_created} étapes (${data.total_duration_seconds}s total)`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const runCronNow = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-followup-tasks', { body: {} });
      if (error) throw new Error(error.message);
      toast.success(`Cron exécuté — ${data?.processed ?? 0} tâches traitées`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const resetConversation = async () => {
    if (!leadId) return;
    if (!confirm('Effacer messages + tâches de ce lead sandbox ?')) return;
    setBusy(true);
    try {
      await supabase.from('whatsapp_messages').delete().eq('lead_id', leadId);
      await supabase.from('lead_followup_tasks').delete().eq('lead_id', leadId);
      toast.success('Conversation réinitialisée');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 max-w-5xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4 text-primary" /> Sandbox — chat de test IA & automatisation
          </CardTitle>
          <CardDescription>
            Simule un lead WhatsApp sans envoyer de vrais messages. Les messages inbound déclenchent les triggers SQL
            (annulation relances, qualification). Les réponses IA utilisent ta config et tes templates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[220px]">
              <label className="text-xs text-muted-foreground mb-1 block">Lead sandbox</label>
              <Select value={leadId} onValueChange={setLeadId}>
                <SelectTrigger><SelectValue placeholder="Choisir un lead sandbox…" /></SelectTrigger>
                <SelectContent>
                  {leads.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">Aucun. Crée-en un →</div>}
                  {leads.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name} {l.status && <span className="text-muted-foreground ml-1">· {l.status}</span>}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={createSandboxLead} disabled={busy} size="sm" className="gap-1">
              <Plus className="h-3 w-3" /> Nouveau
            </Button>
            {leadId && (
              <Button onClick={deleteSandboxLead} disabled={busy} size="sm" variant="outline" className="gap-1 text-destructive">
                <Trash2 className="h-3 w-3" /> Supprimer
              </Button>
            )}
          </div>

          {leadId && (
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              <Button onClick={runSequenceTest} disabled={busy} size="sm" variant="outline" className="gap-1">
                <Zap className="h-3 w-3" /> Lancer séquence ×60
              </Button>
              <Button onClick={runCronNow} disabled={busy} size="sm" variant="outline" className="gap-1">
                <Bot className="h-3 w-3" /> Exécuter cron now
              </Button>
              <Button onClick={resetConversation} disabled={busy} size="sm" variant="outline" className="gap-1">
                <RotateCcw className="h-3 w-3" /> Reset conv
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {leadId && (
        <div className="grid lg:grid-cols-[1fr,300px] gap-4">
          {/* Chat */}
          <Card className="flex flex-col h-[600px]">
            <CardHeader className="py-3 border-b">
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="h-4 w-4" /> {currentLead?.name} <Badge variant="outline" className="text-[10px]">SANDBOX</Badge>
              </CardTitle>
            </CardHeader>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 bg-muted/20">
              {messages.length === 0 && (
                <div className="text-center text-xs text-muted-foreground py-8">Aucun message. Commence par simuler un message du lead.</div>
              )}
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-lg px-3 py-1.5 text-sm whitespace-pre-wrap ${m.direction === 'outbound' ? 'bg-primary text-primary-foreground' : 'bg-card border border-border'}`}>
                    {m.content}
                    <div className={`text-[10px] mt-0.5 opacity-60 flex items-center gap-1 ${m.direction === 'outbound' ? 'justify-end' : ''}`}>
                      {m.direction === 'inbound' ? <ArrowDown className="h-2.5 w-2.5" /> : <ArrowUp className="h-2.5 w-2.5" />}
                      {formatDistanceToNow(new Date(m.sent_at), { locale: fr, addSuffix: true })}
                    </div>
                  </div>
                </div>
              ))}
              {aiPreview && (
                <div className="flex justify-end">
                  <div className="max-w-[75%] rounded-lg px-3 py-2 text-sm bg-primary/10 border border-primary/40 border-dashed">
                    <div className="text-[10px] uppercase tracking-wide text-primary mb-1 flex items-center gap-1"><Sparkles className="h-3 w-3" /> Aperçu IA — {taskType}</div>
                    <div className="whitespace-pre-wrap">{aiPreview}</div>
                    <div className="flex gap-1 mt-2">
                      <Button size="sm" className="h-6 text-xs" onClick={sendAiAsOutbound} disabled={busy}>Envoyer</Button>
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setAiPreview(null)}>Annuler</Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="border-t p-2 space-y-2">
              <div className="flex gap-1 items-center">
                <Button size="sm" variant={direction === 'inbound' ? 'default' : 'outline'} className="h-7 text-xs gap-1" onClick={() => setDirection('inbound')}>
                  <ArrowDown className="h-3 w-3" /> Lead
                </Button>
                <Button size="sm" variant={direction === 'outbound' ? 'default' : 'outline'} className="h-7 text-xs gap-1" onClick={() => setDirection('outbound')}>
                  <ArrowUp className="h-3 w-3" /> Moi
                </Button>
                <div className="flex-1" />
                <Select value={taskType} onValueChange={setTaskType}>
                  <SelectTrigger className="h-7 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TASK_TYPES.map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={generateAiReply} disabled={aiBusy}>
                  {aiBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} IA
                </Button>
              </div>
              <div className="flex gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={direction === 'inbound' ? 'Message du lead…' : 'Ta réponse…'}
                  className="min-h-[40px] max-h-[120px] text-sm resize-none"
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendMessage(); }}
                />
                <Button onClick={sendMessage} disabled={busy || !input.trim()} size="sm" className="self-end gap-1">
                  <Send className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </Card>

          {/* Tasks panel */}
          <Card className="h-[600px] overflow-hidden flex flex-col">
            <CardHeader className="py-3 border-b">
              <CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /> Tâches automation</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-3 space-y-1.5 text-xs">
              {tasks.length === 0 && <div className="text-muted-foreground">Aucune tâche planifiée.</div>}
              {tasks.map((t) => (
                <div key={t.id} className="rounded border border-border p-2 space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono">{t.task_type}</span>
                    <Badge variant={t.status === 'pending' ? 'default' : t.status === 'sent' ? 'outline' : 'secondary'} className="text-[10px]">{t.status}</Badge>
                  </div>
                  <div className="text-muted-foreground text-[11px]">
                    {formatDistanceToNow(new Date(t.scheduled_for), { locale: fr, addSuffix: true })}
                  </div>
                  {t.message && <div className="text-[11px] line-clamp-2 opacity-80">{t.message}</div>}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
