import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentWorkspaceId } from '@/hooks/useWorkspaces';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Trash2, RotateCcw, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

type EntityKey = 'leads' | 'clients' | 'offers' | 'bookings' | 'invoices' | 'contract_signatures';

const ENTITIES: { key: EntityKey; label: string; nameField: string }[] = [
  { key: 'leads', label: 'Prospects', nameField: 'name' },
  { key: 'clients', label: 'Clients', nameField: 'name' },
  { key: 'offers', label: 'Offres', nameField: 'name' },
  { key: 'bookings', label: 'Rendez-vous', nameField: 'name' },
  { key: 'invoices', label: 'Factures', nameField: 'invoice_number' },
  { key: 'contract_signatures', label: 'Contrats', nameField: 'id' },
];

function TrashList({ entity, nameField }: { entity: EntityKey; nameField: string }) {
  const wsId = useCurrentWorkspaceId();
  const qc = useQueryClient();

  const { data = [], isLoading } = useQuery({
    queryKey: ['trash', entity, wsId],
    enabled: !!wsId,
    queryFn: async () => {
      // Bypass RLS deleted_at filter via admin policy OR via owner_id direct (admin/owner peut voir)
      // On utilise la policy admin "view deleted" si admin ; sinon les owners peuvent toujours filtrer leurs deleted via owner_id
      let q: any = (supabase.from(entity as any) as any)
        .select('*')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });
      if (wsId && entity !== 'contract_signatures' && entity !== 'invoices') {
        q = q.eq('workspace_id', wsId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from(entity as any) as any)
        .update({ deleted_at: null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trash', entity, wsId] });
      qc.invalidateQueries({ queryKey: [entity] });
      toast.success('Restauré');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const purge = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from(entity as any) as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trash', entity, wsId] });
      toast.success('Supprimé définitivement');
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground py-6">Chargement…</div>;
  if (data.length === 0) return <div className="text-sm text-muted-foreground py-6 text-center">Aucun élément dans la corbeille.</div>;

  return (
    <div className="space-y-2">
      {data.map((row) => {
        const deletedAt = row.deleted_at ? new Date(row.deleted_at) : null;
        const expiresIn = deletedAt
          ? Math.max(0, 30 - Math.floor((Date.now() - deletedAt.getTime()) / (1000 * 60 * 60 * 24)))
          : 0;
        return (
          <Card key={row.id}>
            <CardContent className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{row[nameField] || row.id.slice(0, 8)}</div>
                <div className="text-xs text-muted-foreground">
                  Supprimé {deletedAt && formatDistanceToNow(deletedAt, { locale: fr, addSuffix: true })} ·{' '}
                  <Badge variant={expiresIn <= 3 ? 'destructive' : 'outline'} className="text-[10px]">
                    purge dans {expiresIn}j
                  </Badge>
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => restore.mutate(row.id)}>
                  <RotateCcw className="h-3.5 w-3.5" /> Restaurer
                </Button>
                <PurgeButton onConfirm={() => purge.mutate(row.id)} name={row[nameField] || row.id.slice(0, 8)} />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function PurgeButton({ onConfirm, name }: { onConfirm: () => void; name: string }) {
  const [typed, setTyped] = useState('');
  const ok = typed.trim() === 'SUPPRIMER';
  return (
    <AlertDialog onOpenChange={() => setTyped('')}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-destructive gap-1.5">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" /> Suppression définitive
          </AlertDialogTitle>
          <AlertDialogDescription>
            Cette action est <strong>irréversible</strong>. L'élément <strong>{name}</strong> sera supprimé pour toujours
            (un instantané est conservé 90 jours dans le journal d'audit pour permettre une restauration manuelle par un admin).
            <br /><br />
            Tape <code className="px-1 py-0.5 bg-muted rounded">SUPPRIMER</code> pour confirmer :
            <Input className="mt-2" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="SUPPRIMER" />
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            disabled={!ok}
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Supprimer définitivement
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function SettingsTrashPage() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground">
        Les éléments supprimés restent ici <strong>30 jours</strong> avant purge automatique. Ils sont invisibles dans
        l'application pendant ce délai mais peuvent être restaurés à tout moment.
      </div>
      <Tabs defaultValue="leads">
        <TabsList className="flex-wrap h-auto">
          {ENTITIES.map((e) => (
            <TabsTrigger key={e.key} value={e.key}>{e.label}</TabsTrigger>
          ))}
        </TabsList>
        {ENTITIES.map((e) => (
          <TabsContent key={e.key} value={e.key} className="mt-4">
            <TrashList entity={e.key} nameField={e.nameField} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
