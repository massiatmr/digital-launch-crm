import { useState } from 'react';
import { Loader2, Copy, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  workspaceId: string;
  workspaceName: string;
  trigger?: React.ReactNode;
}

export function InviteMemberDialog({ workspaceId, workspaceName, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'owner'>('member');
  const [submitting, setSubmitting] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim()) return;
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke('send-invitation', {
      body: { email: email.trim(), workspace_id: workspaceId, workspace_role: role },
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message || 'Erreur');
      return;
    }
    const url = (data as any)?.url;
    if (url) {
      setGeneratedUrl(url);
      await navigator.clipboard.writeText(url).catch(() => {});
      toast.success('Invitation créée — lien copié');
    }
  };

  const reset = () => {
    setEmail('');
    setRole('member');
    setGeneratedUrl(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" className="gap-2">
            <UserPlus className="h-4 w-4" /> Inviter
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inviter dans « {workspaceName} »</DialogTitle>
        </DialogHeader>

        {!generatedUrl ? (
          <div className="space-y-4 py-2">
            <div>
              <Label>Email du destinataire</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@exemple.com"
                autoFocus
              />
            </div>
            <div>
              <Label>Rôle</Label>
              <Select value={role} onValueChange={(v) => setRole(v as 'member' | 'owner')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Membre — accès complet sans gestion d'équipe</SelectItem>
                  <SelectItem value="owner">Propriétaire — peut tout gérer (y compris inviter)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Un lien d'invitation valide 14 jours sera généré et copié.
            </p>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <p className="text-sm">Partage ce lien avec ton invité&nbsp;:</p>
            <div className="flex gap-2">
              <Input value={generatedUrl} readOnly className="font-mono text-xs" />
              <Button
                size="icon"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(generatedUrl);
                  toast.success('Copié');
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Il pourra créer son compte avec cet email et accédera automatiquement à l'espace.
            </p>
          </div>
        )}

        <DialogFooter>
          {generatedUrl ? (
            <Button onClick={() => setOpen(false)}>Fermer</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
              <Button onClick={submit} disabled={submitting || !email.trim()}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Créer l'invitation
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
