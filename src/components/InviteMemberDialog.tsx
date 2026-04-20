import { useState } from 'react';
import { Loader2, Copy, UserPlus, Mail } from 'lucide-react';
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
  const [resending, setResending] = useState(false);

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
      toast.success('Invitation créée — email envoyé & lien copié');
    }
  };

  const resendEmail = async () => {
    if (!email.trim()) return;
    setResending(true);
    const { error } = await supabase.functions.invoke('send-invitation', {
      body: { email: email.trim(), workspace_id: workspaceId, workspace_role: role },
    });
    setResending(false);
    if (error) {
      toast.error(error.message || "Échec de l'envoi");
      return;
    }
    toast.success(`Email renvoyé à ${email.trim()}`);
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
              Un email de bienvenue sera envoyé automatiquement à cette adresse, avec un lien valide 14 jours pour créer le compte.
            </p>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
              <Mail className="h-4 w-4 text-primary" />
              <span>Email de bienvenue envoyé à <strong>{email}</strong></span>
            </div>
            <p className="text-xs text-muted-foreground">Ou partage ce lien manuellement&nbsp;:</p>
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
            <Button
              variant="outline"
              size="sm"
              className="gap-2 w-full"
              onClick={resendEmail}
              disabled={resending}
            >
              {resending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Renvoyer l'email
            </Button>
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
              <Button onClick={submit} disabled={submitting || !email.trim()} className="gap-2">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Créer & envoyer l'email
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
