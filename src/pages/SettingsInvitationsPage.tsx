import { useEffect, useState } from 'react';
import { Loader2, Plus, Copy, Trash2, Mail, Clock, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  const [email, setEmail] = useState('');
  const [creating, setCreating] = useState(false);

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
    if (!email.trim()) return;
    setCreating(true);
    const { data, error } = await supabase.functions.invoke('send-invitation', {
      body: { email: email.trim() },
    });
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if ((data as any)?.url) {
      await navigator.clipboard.writeText((data as any).url).catch(() => {});
      toast.success('Invitation créée et lien copié');
    }
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Invitations</h2>
        <p className="text-sm text-muted-foreground">
          Crée des liens d'invitation pour donner accès à de nouveaux owners. Chaque owner aura son propre CRM isolé.
        </p>
      </div>

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            type="email"
            placeholder="email@client.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
          />
          <Button onClick={create} disabled={creating || !email.trim()}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            Créer une invitation
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Le lien sera copié automatiquement dans le presse-papier (valable 14 jours).
        </p>
      </Card>

      <div className="space-y-2">
        {invites.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">Aucune invitation pour le moment.</Card>
        ) : (
          invites.map((inv) => {
            const used = !!inv.used_at;
            const expired = !used && new Date(inv.expires_at) < new Date();
            return (
              <Card key={inv.id} className="p-3 flex items-center gap-3 flex-wrap">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{inv.email}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Créé le {new Date(inv.created_at).toLocaleDateString()} • Expire le {new Date(inv.expires_at).toLocaleDateString()}
                  </p>
                </div>
                {used ? (
                  <Badge variant="outline" className="bg-green-500/15 text-green-400 border-green-500/30">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Utilisé
                  </Badge>
                ) : expired ? (
                  <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30">
                    Expiré
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30">
                    <Clock className="h-3 w-3 mr-1" /> En attente
                  </Badge>
                )}
                {!used && !expired && (
                  <Button size="sm" variant="outline" onClick={() => copyLink(inv.token)}>
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copier
                  </Button>
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
