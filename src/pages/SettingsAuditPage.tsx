import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { History, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

const ACTION_COLORS: Record<string, string> = {
  DELETE: 'destructive',
  SOFT_DELETE: 'secondary',
  RESTORE: 'default',
  UPDATE: 'outline',
  INSERT: 'outline',
};

export default function SettingsAuditPage() {
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data = [], isLoading } = useQuery({
    queryKey: ['audit_log', actionFilter, entityFilter],
    queryFn: async () => {
      let q: any = (supabase.from('audit_log' as any) as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (actionFilter !== 'all') q = q.eq('action', actionFilter);
      if (entityFilter !== 'all') q = q.eq('entity_type', entityFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const restore = useMutation({
    mutationFn: async (auditId: string) => {
      const { data, error } = await (supabase.rpc as any)('restore_from_snapshot', { p_audit_id: auditId });
      if (error) throw error;
      return data;
    },
    onSuccess: (res: any) => {
      toast.success(`Restauré (${res?.mode || 'ok'})`);
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground flex items-start gap-2">
        <History className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          Journal des 200 derniers événements (90 jours max). Chaque suppression/restauration garde un instantané
          complet permettant une restauration manuelle même après purge.
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes actions</SelectItem>
            <SelectItem value="DELETE">Suppression définitive</SelectItem>
            <SelectItem value="SOFT_DELETE">Mise en corbeille</SelectItem>
            <SelectItem value="RESTORE">Restauration</SelectItem>
          </SelectContent>
        </Select>
        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes entités</SelectItem>
            <SelectItem value="workspaces">Espaces</SelectItem>
            <SelectItem value="leads">Prospects</SelectItem>
            <SelectItem value="clients">Clients</SelectItem>
            <SelectItem value="offers">Offres</SelectItem>
            <SelectItem value="invoices">Factures</SelectItem>
            <SelectItem value="contract_signatures">Contrats</SelectItem>
            <SelectItem value="bookings">Rendez-vous</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Chargement…</div>}

      <div className="space-y-1.5">
        {data.map((row) => {
          const isOpen = expanded === row.id;
          const snap = row.snapshot || {};
          const name = snap.name || snap.company_name || snap.invoice_number || row.entity_id?.slice(0, 8);
          return (
            <Card key={row.id}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <button
                    className="flex items-center gap-2 min-w-0 flex-1 text-left"
                    onClick={() => setExpanded(isOpen ? null : row.id)}
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    <Badge variant={ACTION_COLORS[row.action] as any || 'outline'} className="text-[10px] shrink-0">
                      {row.action}
                    </Badge>
                    <span className="text-xs text-muted-foreground shrink-0">{row.entity_type}</span>
                    <span className="font-medium truncate">{name}</span>
                    <span className="text-xs text-muted-foreground ml-auto shrink-0">
                      {formatDistanceToNow(new Date(row.created_at), { locale: fr, addSuffix: true })}
                    </span>
                  </button>
                  {(row.action === 'DELETE' || row.action === 'SOFT_DELETE') && (
                    <Button size="sm" variant="outline" className="gap-1.5 shrink-0"
                      onClick={() => restore.mutate(row.id)} disabled={restore.isPending}>
                      <RotateCcw className="h-3.5 w-3.5" /> Restaurer
                    </Button>
                  )}
                </div>
                {isOpen && (
                  <pre className="text-[10px] bg-muted/50 rounded p-2 overflow-x-auto max-h-64">
                    {JSON.stringify(snap, null, 2)}
                  </pre>
                )}
              </CardContent>
            </Card>
          );
        })}
        {!isLoading && data.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-6">Aucun événement.</div>
        )}
      </div>
    </div>
  );
}
