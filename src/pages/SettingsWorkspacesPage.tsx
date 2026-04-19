import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useWorkspaceFeatures, useIsAdmin, type FeatureKey } from '@/hooks/useWorkspaceFeatures';
import { useWorkspaceMembers, useRemoveMember, useUpdateMemberRole } from '@/hooks/useWorkspaceMembers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Building2, Plus, Check, Users, UserPlus, Trash2, ShieldCheck, MessageCircle, CalendarCheck, Package, Facebook, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { InviteMemberDialog } from '@/components/InviteMemberDialog';

const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);

const FEATURE_DEFS: { key: FeatureKey; label: string; icon: any }[] = [
  { key: 'conversations', label: 'Conversations', icon: MessageCircle },
  { key: 'whatsapp', label: 'Intégration WhatsApp', icon: MessageCircle },
  { key: 'facebook', label: 'Intégration Facebook', icon: Facebook },
  { key: 'bookings', label: 'Rendez-vous', icon: CalendarCheck },
  { key: 'offers', label: 'Offres & Landing Pages', icon: Package },
  { key: 'clients', label: 'Clients', icon: UserCheck },
];

function FeatureToggles({ workspaceId, isAdmin }: { workspaceId: string; isAdmin: boolean }) {
  const { features } = useWorkspaceFeatures(workspaceId);
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: async ({ key, enabled }: { key: FeatureKey; enabled: boolean }) => {
      const { error } = await (supabase.from('workspace_features' as any) as any)
        .upsert({ workspace_id: workspaceId, feature_key: key, enabled }, { onConflict: 'workspace_id,feature_key' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace-features', workspaceId] });
      toast.success('Mis à jour');
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!isAdmin) return null;

  return (
    <div className="space-y-2 pt-3 border-t border-border/40">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <ShieldCheck className="h-3 w-3" /> Modules (admin)
      </div>
      <div className="space-y-1.5">
        {FEATURE_DEFS.map(({ key, label, icon: Icon }) => (
          <div key={key} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              {label}
            </span>
            <Switch
              checked={features[key]}
              onCheckedChange={(v) => toggle.mutate({ key, enabled: v })}
              disabled={toggle.isPending}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function MembersList({ workspaceId, currentUserId, canManage }: { workspaceId: string; currentUserId: string; canManage: boolean }) {
  const { data: members, isLoading } = useWorkspaceMembers(workspaceId);
  const remove = useRemoveMember();
  const updateRole = useUpdateMemberRole();

  return (
    <div className="space-y-2 pt-3 border-t border-border/40">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Users className="h-3 w-3" /> Membres ({members?.length || 0})
      </div>
      {isLoading && <div className="text-xs text-muted-foreground">Chargement…</div>}
      <div className="space-y-1.5">
        {members?.map((m) => {
          const isSelf = m.user_id === currentUserId;
          return (
            <div key={m.user_id} className="flex items-center justify-between gap-2 rounded-md bg-muted/30 px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate">{m.email}{isSelf && <span className="text-xs text-muted-foreground"> (vous)</span>}</div>
              </div>
              {canManage && !isSelf ? (
                <>
                  <Select
                    value={m.role}
                    onValueChange={(v) => updateRole.mutate({ workspaceId, userId: m.user_id, role: v as any }, {
                      onSuccess: () => toast.success('Rôle mis à jour'),
                      onError: (e: any) => toast.error(e.message),
                    })}
                  >
                    <SelectTrigger className="h-7 w-[100px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="owner">Owner</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                    onClick={() => {
                      if (confirm(`Retirer ${m.email} ?`)) {
                        remove.mutate({ workspaceId, userId: m.user_id }, {
                          onSuccess: () => toast.success('Membre retiré'),
                          onError: (e: any) => toast.error(e.message),
                        });
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <Badge variant="outline" className="text-xs capitalize">{m.role}</Badge>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SettingsWorkspacesPage() {
  const { user } = useAuth();
  const { workspaces, currentWorkspaceId, switchWorkspace, refetch } = useWorkspaces();
  const { data: isAdmin = false } = useIsAdmin();
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
          company_name: companyName.trim(), slug: finalSlug, email: user.email,
          created_by: user.id, onboarding_completed: true,
        })
        .select().single();
      if (error) throw error;
      const { error: mErr } = await (supabase.from('workspace_members' as any) as any)
        .insert({ workspace_id: ws.id, user_id: user.id, role: 'owner' });
      if (mErr) throw mErr;
      return ws;
    },
    onSuccess: (ws: any) => {
      toast.success(`Espace "${ws.company_name}" créé`);
      setCompanyName(''); setSlug(''); setOpen(false);
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
            <DialogHeader><DialogTitle>Nouvel espace de travail</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label>Nom de l'entreprise *</Label>
                <Input value={companyName} onChange={(e) => { setCompanyName(e.target.value); if (!slug) setSlug(slugify(e.target.value)); }} placeholder="HKSN Services" />
              </div>
              <div>
                <Label>Slug public</Label>
                <Input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} placeholder="hksn-services" />
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

      <div className="grid gap-3 lg:grid-cols-2">
        {workspaces.map((w) => {
          const isCurrent = w.id === currentWorkspaceId;
          const canManage = w.role === 'owner' || isAdmin;
          return (
            <Card key={w.id} className={isCurrent ? 'border-primary/50 bg-primary/5' : ''}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2 min-w-0">
                    {w.logo_url ? (
                      <img src={w.logo_url} alt="" className="h-6 w-6 rounded object-cover shrink-0" />
                    ) : (
                      <Building2 className="h-5 w-5 text-primary shrink-0" />
                    )}
                    <span className="truncate">{w.company_name || 'Sans nom'}</span>
                  </span>
                  {isCurrent && <Badge variant="default" className="gap-1 shrink-0"><Check className="h-3 w-3" />Actif</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {w.slug && <div className="text-muted-foreground text-xs">Slug : <code>{w.slug}</code></div>}
                <div className="flex flex-wrap gap-2">
                  {!isCurrent && (
                    <Button size="sm" variant="outline" onClick={() => switchWorkspace(w.id)}>Basculer</Button>
                  )}
                  {canManage && (
                    <InviteMemberDialog
                      workspaceId={w.id}
                      workspaceName={w.company_name || 'Espace'}
                      trigger={<Button size="sm" variant="outline" className="gap-1.5"><UserPlus className="h-3.5 w-3.5" />Inviter</Button>}
                    />
                  )}
                </div>
                {user && <MembersList workspaceId={w.id} currentUserId={user.id} canManage={canManage} />}
                <FeatureToggles workspaceId={w.id} isAdmin={isAdmin} />
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
