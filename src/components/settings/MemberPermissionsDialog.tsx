import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { PERMISSIONS, type PermissionKey, useMemberPermissions, useSetMemberPermissions } from '@/hooks/useMemberPermissions';

export function MemberPermissionsDialog({ workspaceId, userId, email }: { workspaceId: string; userId: string; email: string }) {
  const [open, setOpen] = useState(false);
  const { data } = useMemberPermissions(workspaceId, userId);
  const save = useSetMemberPermissions();
  const [draft, setDraft] = useState<Record<PermissionKey, boolean> | null>(null);
  useEffect(() => { if (open && data) setDraft(data); }, [open, data]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-7 w-7" title="Accès">
          <ShieldCheck className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Accès de {email}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">La Pipeline est toujours visible, avec uniquement les leads assignés à ce membre.</p>
        <div className="space-y-1">
          {draft && PERMISSIONS.map((p) => (
            <label key={p.key} className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2.5 text-sm">
              {p.label}
              <Switch checked={draft[p.key]} onCheckedChange={(v) => setDraft({ ...draft, [p.key]: v })} />
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button
            disabled={!draft || save.isPending}
            onClick={() => save.mutate({ workspaceId, userId, permissions: draft! }, {
              onSuccess: () => { toast.success('Accès mis à jour'); setOpen(false); },
              onError: (e: any) => toast.error(e.message),
            })}
          >Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
