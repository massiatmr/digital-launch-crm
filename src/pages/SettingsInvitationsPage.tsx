import { useEffect, useState } from 'react';
import { Loader2, Plus, Copy, Trash2, Mail, Clock, CheckCircle2, Link2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';

interface Invitation {
  id: string;
  email: string;
  token: string;
  used_at: string | null;
  expires_at: string;
  created_at: string;
}

export default function SettingsInvitationsPage() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [creating, setCreating] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();
      setIsAdmin(!!data);
      if (data) await load();
      setLoading(false);
    })();
  }, [user]);

  const load = async () => {
    const { data, error } = await supabase
      .from('invitations')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) toast.error(error.message);
    setInvites(data || []);
  };

  const create = async () => {
    if (!email.trim() || !name.trim()) return;
    setCreating(true);
    const { data, error } = await supabase.functions.invoke('send-invitation', {
      body: {
        email: email.trim(),
        name: name.trim(),
        send_email: sendEmail,
      },
    });
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if ((data as any)?.url) {
      await navigator.clipboard.writeText((data as any).url).catch(() => {});
      toast.success(sendEmail ? 'Invitation créée — email envoyé & lien copié' : 'Invitation créée — lien copié');
    }
    setName('');
    setEmail('');
    await load();
  };

  const revoke = async (id: string) => {
    if (!confirm('Révoquer cette invitation ?')) return;
    const { error } = await supabase.from('invitations').delete().eq('id', id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Invitation révoquée');
    await load();
  };

  const copyLink = async (token: string) => {
    const url = `${window.location.origin}/auth?invite=${token}`;
    await navigator.clipboard.writeText(url);
    toast.success('Lien copié');
  };

  const resendInviteEmail = async (inv: Invitation) => {
    setResendingId(inv.id);
    const { error } = await supabase.functions.invoke('send-invitation', {
      body: {
        email: inv.email,
        name: inv.email.split('@')[0],
        send_email: true,
      },
    });
    setResendingId(null);
    if (error) {
      toast.error(error.message || "Échec de l'envoi");
      return;
    }
    toast.success(`Email renvoyé à ${inv.email}`);
    await load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        Accès réservé aux administrateurs.
      </Card>
    );
  }

  const pending = invites.filter((i) => !i.used_at && new Date(i.expires_at) >= new Date());
  const accepted = invites.filter((i) => !!i.used_at);
  const expired = invites.filter((i) => !i.used_at && new Date(i.expires_at) < new Date());

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Invitations</h2>
        <p className="text-sm text-muted-foreground">
          Crée des liens d'invitation pour donner accès à de nouveaux owners. Chaque owner aura son propre CRM isolé.
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Nom du destinataire</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jean Dupont"
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              placeholder="email@client.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
            />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2.5">
          <div className="flex-1 pr-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Mail className="h-4 w-4 text-primary" />
              Envoyer l'email de bienvenue
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {sendEmail ? "Email automatique avec lien d'invitation (14 jours)." : 'Aucun email — tu copieras le lien manuellement.'}
            </p>
          </div>
          <Switch checked={sendEmail} onCheckedChange={setSendEmail} />
        </div>
        <Button onClick={create} disabled={creating || !email.trim() || !name.trim()} className="w-full sm:w-auto gap-2">
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : sendEmail ? <Mail className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
          {sendEmail ? "Créer & envoyer l'email" : 'Créer le lien'}
        </Button>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">En attente</p>
          <p className="text-2xl font-mono font-semibold text-yellow-400">{pending.length}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Acceptées</p>
          <p className="text-2xl font-mono font-semibold text-green-400">{accepted.length}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Expirées</p>
          <p className="text-2xl font-mono font-semibold text-red-400">{expired.length}</p>
        </Card>
      </div>

      <div className="space-y-2">
        {invites.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">Aucune invitation pour le moment.</Card>
        ) : (
          invites.map((inv) => {
            const used = !!inv.used_at;
            const isExpired = !used && new Date(inv.expires_at) < new Date();
            return (
              <Card key={inv.id} className="p-3 flex items-center gap-3 flex-wrap">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{inv.email}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Créé le {new Date(inv.created_at).toLocaleDateString()} • {used ? `Acceptée le ${new Date(inv.used_at!).toLocaleDateString()}` : `Expire le ${new Date(inv.expires_at).toLocaleDateString()}`}
                  </p>
                </div>
                {used ? (
                  <Badge variant="outline" className="bg-green-500/15 text-green-400 border-green-500/30">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Acceptée
                  </Badge>
                ) : isExpired ? (
                  <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30">
                    Expirée
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30">
                    <Clock className="h-3 w-3 mr-1" /> En attente
                  </Badge>
                )}
                {!used && !isExpired && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resendInviteEmail(inv)}
                      disabled={resendingId === inv.id}
                      className="gap-1"
                    >
                      {resendingId === inv.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      Renvoyer email
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => copyLink(inv.token)}>
                      <Copy className="h-3.5 w-3.5 mr-1" /> Copier
                    </Button>
                  </>
                )}
                {!used && (
                  <Button size="sm" variant="ghost" onClick={() => revoke(inv.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
