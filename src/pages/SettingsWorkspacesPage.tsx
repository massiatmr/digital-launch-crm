import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Building2, Plus, Check, Users, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { InviteMemberDialog } from '@/components/InviteMemberDialog';

const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);

export default function SettingsWorkspacesPage() {
  const { user } = useAuth();
  const { workspaces, currentWorkspaceId, switchWorkspace, refetch } = useWorkspaces();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [slug, setSlug] = useState('');

  const createWs = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');
      if (!companyName.trim()) throw new Error('Nom requis');
      const finalSlug = slug.trim() || slugify(companyName);

      const { data: ws, error } = await (supabase.from('workspaces' as any) as any)
        .insert({
          company_name: companyName.trim(),
          slug: finalSlug,
          email: user.email,
          created_by: user.id,
          onboarding_completed: true,
        })
        .select()
        .single();
      if (error) throw error;

      const { error: mErr } = await (supabase.from('workspace_members' as any) as any)
        .insert({ workspace_id: ws.id, user_id: user.id, role: 'owner' });
      if (mErr) throw mErr;

      return ws;
    },
    onSuccess: (ws: any) => {
      toast.success(`Espace "${ws.company_name}" créé`);
      setCompanyName('');
      setSlug('');
      setOpen(false);
      refetch();
      qc.invalidateQueries({ queryKey: ['workspaces'] });
      switchWorkspace(ws.id);
    },
    onError: (e: any) => toast.error(e.message || 'Erreur'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Mes espaces de travail</h2>
          <p className="text-sm text-muted-foreground">Crée un espace par client/projet pour cloisonner leads, configs et branding.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" />Créer un espace</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouvel espace de travail</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label>Nom de l'entreprise *</Label>
                <Input
                  value={companyName}
                  onChange={(e) => {
                    setCompanyName(e.target.value);
                    if (!slug) setSlug(slugify(e.target.value));
                  }}
                  placeholder="HKSN Services"
                />
              </div>
              <div>
                <Label>Slug public</Label>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(slugify(e.target.value))}
                  placeholder="hksn-services"
                />
                <p className="text-xs text-muted-foreground mt-1">URL des offres : /o/{slug || 'slug'}/...</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
              <Button onClick={() => createWs.mutate()} disabled={createWs.isPending || !companyName.trim()}>
                {createWs.isPending ? 'Création…' : 'Créer'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {workspaces.map((w) => {
          const isCurrent = w.id === currentWorkspaceId;
          return (
            <Card key={w.id} className={isCurrent ? 'border-primary/50 bg-primary/5' : ''}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2">
                    {w.logo_url ? (
                      <img src={w.logo_url} alt="" className="h-6 w-6 rounded object-cover" />
                    ) : (
                      <Building2 className="h-5 w-5 text-primary" />
                    )}
                    {w.company_name || 'Sans nom'}
                  </span>
                  {isCurrent && <Badge variant="default" className="gap-1"><Check className="h-3 w-3" />Actif</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {w.slug && <div className="text-muted-foreground">Slug : <code className="text-xs">{w.slug}</code></div>}
                {w.role && <div className="text-muted-foreground capitalize">Rôle : {w.role}</div>}
                <div className="flex flex-wrap gap-2 pt-2">
                  {!isCurrent && (
                    <Button size="sm" variant="outline" onClick={() => switchWorkspace(w.id)}>
                      Basculer
                    </Button>
                  )}
                  {w.role === 'owner' && (
                    <InviteMemberDialog
                      workspaceId={w.id}
                      workspaceName={w.company_name || 'Espace'}
                      trigger={
                        <Button size="sm" variant="outline" className="gap-1.5">
                          <UserPlus className="h-3.5 w-3.5" /> Inviter
                        </Button>
                      }
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {workspaces.length === 0 && (
          <Card className="col-span-full">
            <CardContent className="py-8 text-center text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
              Aucun espace pour le moment.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
