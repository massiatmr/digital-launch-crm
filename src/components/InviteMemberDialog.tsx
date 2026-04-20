import { useState } from 'react';
import { Loader2, Copy, UserPlus, Mail, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  workspaceId: string;
  workspaceName: string;
  trigger?: React.ReactNode;
}

export function InviteMemberDialog({ workspaceId, workspaceName, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'owner'>('member');
  const [sendEmail, setSendEmail] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [emailWasSent, setEmailWasSent] = useState(false);
  const [resending, setResending] = useState(false);

  const submit = async () => {
    if (!email.trim() || !name.trim()) return;
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke('send-invitation', {
      body: {
        email: email.trim(),
        name: name.trim(),
        workspace_id: workspaceId,
        workspace_role: role,
        send_email: sendEmail,
      },
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message || 'Erreur');
      return;
    }
    const url = (data as any)?.url;
    if (url) {
      setGeneratedUrl(url);
      setEmailWasSent(sendEmail);
      await navigator.clipboard.writeText(url).catch(() => {});
      toast.success(sendEmail ? 'Invitation créée — email envoyé & lien copié' : 'Invitation créée — lien copié');
    }
  };

  const resendEmail = async () => {
    if (!email.trim()) return;
    setResending(true);
    const { error } = await supabase.functions.invoke('send-invitation', {
      body: {
        email: email.trim(),
        name: name.trim(),
        workspace_id: workspaceId,
        workspace_role: role,
        send_email: true,
      },
    });
    setResending(false);
    if (error) {
      toast.error(error.message || "Échec de l'envoi");
      return;
    }
    setEmailWasSent(true);
    toast.success(`Email envoyé à ${email.trim()}`);
  };

  const reset = () => {
    setName('');
    setEmail('');
    setRole('member');
    setSendEmail(true);
    setGeneratedUrl(null);
    setEmailWasSent(false);
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
              <Label>Nom du destinataire</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jean Dupont"
                autoFocus
              />
            </div>
            <div>
              <Label>Email du destinataire</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@exemple.com"
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
            <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2.5">
              <div className="flex-1 pr-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Mail className="h-4 w-4 text-primary" />
                  Envoyer l'email de bienvenue
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {sendEmail ? 'Email automatique avec lien d\'invitation (14 jours).' : 'Aucun email — tu copieras le lien manuellement.'}
                </p>
              </div>
              <Switch checked={sendEmail} onCheckedChange={setSendEmail} />
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            {emailWasSent ? (
              <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
                <Mail className="h-4 w-4 text-primary" />
                <span>Email de bienvenue envoyé à <strong>{email}</strong></span>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <span>Lien d'invitation prêt — partage-le manuellement</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground">Lien d'invitation&nbsp;:</p>
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
              {emailWasSent ? "Renvoyer l'email" : "Envoyer l'email maintenant"}
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
              <Button onClick={submit} disabled={submitting || !email.trim() || !name.trim()} className="gap-2">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : sendEmail ? <Mail className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                {sendEmail ? "Créer & envoyer l'email" : "Créer le lien"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
