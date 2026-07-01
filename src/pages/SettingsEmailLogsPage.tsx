import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Mail, RefreshCw, AlertCircle, CheckCircle2, Ban, Clock, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

type EmailRow = {
  id: string;
  message_id: string | null;
  template_name: string | null;
  recipient_email: string | null;
  status: string;
  error_message: string | null;
  metadata: any;
  created_at: string;
};

type RangeKey = '24h' | '7d' | '30d' | 'custom';

const PAGE_SIZE = 50;

function getRangeStart(range: RangeKey, customStart: string): Date {
  if (range === 'custom' && customStart) return new Date(customStart);
  const now = new Date();
  if (range === '24h') return new Date(now.getTime() - 24 * 3600_000);
  if (range === '7d') return new Date(now.getTime() - 7 * 24 * 3600_000);
  return new Date(now.getTime() - 30 * 24 * 3600_000);
}

function getRangeEnd(range: RangeKey, customEnd: string): Date {
  if (range === 'custom' && customEnd) return new Date(customEnd);
  return new Date();
}

function statusBadge(status: string) {
  const s = (status || '').toLowerCase();
  if (s === 'sent') return <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">Envoyé</Badge>;
  if (s === 'dlq' || s === 'failed') return <Badge className="bg-red-500/15 text-red-300 border-red-500/30">Échec</Badge>;
  if (s === 'bounced') return <Badge className="bg-red-500/15 text-red-300 border-red-500/30">Bounce</Badge>;
  if (s === 'complained') return <Badge className="bg-orange-500/15 text-orange-300 border-orange-500/30">Plainte</Badge>;
  if (s === 'suppressed') return <Badge className="bg-yellow-500/15 text-yellow-300 border-yellow-500/30">Supprimé</Badge>;
  if (s === 'pending') return <Badge className="bg-blue-500/15 text-blue-300 border-blue-500/30">En attente</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

export default function SettingsEmailLogsPage() {
  const [range, setRange] = useState<RangeKey>('7d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [template, setTemplate] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [preview, setPreview] = useState<EmailRow | null>(null);

  const startDate = useMemo(() => getRangeStart(range, customStart), [range, customStart]);
  const endDate = useMemo(() => getRangeEnd(range, customEnd), [range, customEnd]);

  // Fetch all rows for the range (limited), then dedupe client-side by message_id.
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['email-logs', startDate.toISOString(), endDate.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_send_log' as any)
        .select('*')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data || []) as unknown as EmailRow[];
    },
  });

  // Dedupe: latest row per message_id (rows already ordered DESC by created_at)
  const deduped = useMemo(() => {
    const seen = new Map<string, EmailRow>();
    const noId: EmailRow[] = [];
    for (const r of data || []) {
      if (!r.message_id) { noId.push(r); continue; }
      if (!seen.has(r.message_id)) seen.set(r.message_id, r);
    }
    return [...seen.values(), ...noId];
  }, [data]);

  const templates = useMemo(() => {
    const set = new Set<string>();
    (data || []).forEach((r) => r.template_name && set.add(r.template_name));
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(() => {
    return deduped.filter((r) => {
      if (template !== 'all' && r.template_name !== template) return false;
      if (status !== 'all') {
        const s = (r.status || '').toLowerCase();
        if (status === 'sent' && s !== 'sent') return false;
        if (status === 'failed' && !['dlq', 'failed', 'bounced'].includes(s)) return false;
        if (status === 'suppressed' && s !== 'suppressed') return false;
        if (status === 'pending' && s !== 'pending') return false;
      }
      if (search) {
        const q = search.toLowerCase();
        if (
          !(r.recipient_email?.toLowerCase().includes(q) ||
            r.template_name?.toLowerCase().includes(q) ||
            r.error_message?.toLowerCase().includes(q))
        ) return false;
      }
      return true;
    });
  }, [deduped, template, status, search]);

  const stats = useMemo(() => {
    const total = filtered.length;
    let sent = 0, failed = 0, suppressed = 0, pending = 0;
    for (const r of filtered) {
      const s = (r.status || '').toLowerCase();
      if (s === 'sent') sent++;
      else if (['dlq', 'failed', 'bounced'].includes(s)) failed++;
      else if (s === 'suppressed') suppressed++;
      else if (s === 'pending') pending++;
    }
    return { total, sent, failed, suppressed, pending };
  }, [filtered]);

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold flex items-center gap-2">
            <Mail className="h-5 w-5" /> Logs des emails
          </h2>
          <p className="text-xs text-muted-foreground">Suivi des envois (rappels RDV, confirmations, notifications…).</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} /> Actualiser
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-3">
        <StatCard label="Total" value={stats.total} icon={Mail} tone="default" />
        <StatCard label="Envoyés" value={stats.sent} icon={CheckCircle2} tone="success" />
        <StatCard label="Échecs" value={stats.failed} icon={AlertCircle} tone="danger" />
        <StatCard label="Supprimés" value={stats.suppressed} icon={Ban} tone="warning" />
        <StatCard label="En attente" value={stats.pending} icon={Clock} tone="info" />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {(['24h', '7d', '30d', 'custom'] as RangeKey[]).map((r) => (
              <Button key={r} size="sm" variant={range === r ? 'default' : 'outline'} onClick={() => { setRange(r); setPage(0); }}>
                {r === '24h' ? '24h' : r === '7d' ? '7 jours' : r === '30d' ? '30 jours' : 'Période…'}
              </Button>
            ))}
            {range === 'custom' && (
              <>
                <Input type="datetime-local" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-auto" />
                <Input type="datetime-local" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-auto" />
              </>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Select value={template} onValueChange={(v) => { setTemplate(v); setPage(0); }}>
              <SelectTrigger><SelectValue placeholder="Type d'email" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les types</SelectItem>
                {templates.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
              <SelectTrigger><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="sent">Envoyés</SelectItem>
                <SelectItem value="failed">Échecs</SelectItem>
                <SelectItem value="suppressed">Supprimés</SelectItem>
                <SelectItem value="pending">En attente</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Recherche (email, template, erreur)…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {filtered.length} email{filtered.length > 1 ? 's' : ''} unique{filtered.length > 1 ? 's' : ''}
            {data && data.length >= 5000 && (
              <span className="text-xs text-muted-foreground ml-2">(limite 5000 lignes brutes — affinez la période)</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Destinataire</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Erreur</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Chargement…</TableCell></TableRow>
                )}
                {!isLoading && paged.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Aucun email sur cette période</TableCell></TableRow>
                )}
                {paged.map((r) => {
                  const hasPreview = !!(r.metadata?.body_html || r.metadata?.subject);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.template_name || '—'}</TableCell>
                      <TableCell className="text-xs">{r.recipient_email || '—'}</TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {format(new Date(r.created_at), 'dd MMM HH:mm', { locale: fr })}
                      </TableCell>
                      <TableCell className="text-xs text-red-300/80 max-w-xs truncate" title={r.error_message || ''}>
                        {r.error_message || ''}
                      </TableCell>
                      <TableCell>
                        {hasPreview && (
                          <Button variant="ghost" size="sm" onClick={() => setPreview(r)} className="h-7 px-2">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-3 border-t border-white/5">
              <span className="text-xs text-muted-foreground">Page {page + 1} / {totalPages}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Précédent</Button>
                <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Suivant</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2 border-b border-white/5">
            <DialogTitle className="text-sm">
              {preview?.metadata?.subject || preview?.template_name || 'Aperçu email'}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              À : {preview?.recipient_email} • {preview && format(new Date(preview.created_at), 'dd MMM yyyy HH:mm', { locale: fr })}
            </p>
          </DialogHeader>
          <div className="bg-white h-[70vh] overflow-hidden">
            {preview?.metadata?.body_html ? (
              <iframe
                title="Aperçu email"
                srcDoc={preview.metadata.body_html}
                className="w-full h-full border-0"
                sandbox=""
              />
            ) : (
              <div className="p-6 text-sm text-muted-foreground">Aucun aperçu disponible pour cet email.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: any; tone: 'default' | 'success' | 'danger' | 'warning' | 'info' }) {
  const tones: Record<string, string> = {
    default: 'text-foreground',
    success: 'text-emerald-300',
    danger: 'text-red-300',
    warning: 'text-yellow-300',
    info: 'text-blue-300',
  };
  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div>
        <div className={`text-2xl font-mono font-semibold mt-1 ${tones[tone]}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
