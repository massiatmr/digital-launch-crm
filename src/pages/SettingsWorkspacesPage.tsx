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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Building2, Plus, Check, Users, UserPlus, Trash2, ShieldCheck, MessageCircle, CalendarCheck, Package, Facebook, UserCheck, AlertTriangle, Upload, Loader2, X, Copy } from 'lucide-react';
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

type LogoField = 'logo_url' | 'logo_url_light' | 'logo_url_dark';

function LogoUploader({
  workspaceId,
  currentLogoUrl,
  onChange,
  field = 'logo_url',
  variant = 'default',
}: {
  workspaceId: string;
  currentLogoUrl: string;
  onChange: (url: string) => void;
  field?: LogoField;
  variant?: 'default' | 'light' | 'dark';
}) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Format invalide (image requise)');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image trop lourde (max 2 Mo)');
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const path = `${workspaceId}/logo-${field}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('workspace-logos').upload(path, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('workspace-logos').getPublicUrl(path);
      const url = pub.publicUrl;
      const { error: updErr } = await (supabase.from('workspaces' as any) as any)
        .update({ [field]: url })
        .eq('id', workspaceId);
      if (updErr) throw updErr;
      onChange(url);
      qc.invalidateQueries({ queryKey: ['workspaces'] });
      toast.success('Logo mis à jour');
    } catch (e: any) {
      toast.error(e.message || 'Erreur upload');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    setUploading(true);
    try {
      const { error } = await (supabase.from('workspaces' as any) as any)
        .update({ [field]: null })
        .eq('id', workspaceId);
      if (error) throw error;
      onChange('');
      qc.invalidateQueries({ queryKey: ['workspaces'] });
      toast.success('Logo retiré');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  const previewBg =
    variant === 'light' ? 'bg-neutral-900' : variant === 'dark' ? 'bg-neutral-100' : 'bg-muted/40';
  const previewIconColor =
    variant === 'light' ? 'text-neutral-400' : variant === 'dark' ? 'text-neutral-500' : 'text-muted-foreground';

  return (
    <div className="flex items-center gap-3 mt-1">
      <div className={`h-12 w-12 rounded-md ${previewBg} border border-border/50 flex items-center justify-center overflow-hidden shrink-0`}>
        {currentLogoUrl ? (
          <img src={currentLogoUrl} alt="" className="h-full w-full object-contain" />
        ) : (
          <Building2 className={`h-5 w-5 ${previewIconColor}`} />
        )}
      </div>
      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
        <label className="inline-flex">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = '';
            }}
          />
          <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary cursor-pointer transition-colors w-fit">
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            {currentLogoUrl ? 'Changer' : 'Téléverser'}
          </span>
        </label>
        {currentLogoUrl && (
          <button
            type="button"
            disabled={uploading}
            onClick={handleRemove}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive w-fit"
          >
            <X className="h-3 w-3" /> Retirer
          </button>
        )}
        <p className="text-[10px] text-muted-foreground">PNG/JPG/SVG · max 2 Mo</p>
      </div>
    </div>
  );
}

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

function WorkspaceEditor({ workspace, canManage }: { workspace: any; canManage: boolean }) {
  const qc = useQueryClient();
  const { refetch, switchWorkspace, workspaces } = useWorkspaces();
  const [form, setForm] = useState({
    company_name: workspace.company_name || '',
    slug: workspace.slug || '',
    logo_url: workspace.logo_url || '',
    logo_url_light: workspace.logo_url_light || '',
    logo_url_dark: workspace.logo_url_dark || '',
    notification_email: workspace.notification_email || '',
    brand_color: workspace.brand_color || '#7C3AED',
  });
  const [confirmName, setConfirmName] = useState('');
  const [impact, setImpact] = useState<{ leads: number; clients: number; offers: number; invoices: number } | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.from('workspaces' as any) as any)
        .update(form)
        .eq('id', workspace.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspaces'] });
      toast.success('Espace mis à jour');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const loadImpact = async () => {
    const tables = ['leads', 'clients', 'offers', 'invoices'] as const;
    const counts: any = {};
    for (const t of tables) {
      const { count } = await (supabase.from(t as any) as any)
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspace.id);
      counts[t] = count || 0;
    }
    setImpact(counts);
  };

  const softDelete = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.from('workspaces' as any) as any)
        .delete()
        .eq('id', workspace.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Espace supprimé définitivement');
      const other = workspaces.find((w) => w.id !== workspace.id);
      if (other) switchWorkspace(other.id);
      refetch();
      qc.invalidateQueries({ queryKey: ['workspaces'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!canManage) return null;

  const nameOk = confirmName.trim() === (workspace.company_name || '').trim();

  return (
    <div className="space-y-2 pt-3 border-t border-border/40">
      <div className="text-xs font-semibold text-muted-foreground">Édition</div>
      <div className="grid gap-2">
        <div>
          <Label className="text-xs">Nom</Label>
          <Input className="h-8 text-sm" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Slug</Label>
          <Input className="h-8 text-sm" value={form.slug} onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })} />
        </div>
        <div>
          <Label className="text-xs">Logo principal</Label>
          <LogoUploader
            workspaceId={workspace.id}
            currentLogoUrl={form.logo_url}
            field="logo_url"
            onChange={(url) => setForm({ ...form, logo_url: url })}
          />
          <p className="text-[10px] text-muted-foreground mt-1">Utilisé dans l'app et en repli sur les pages publiques.</p>
        </div>
        <div>
          <Label className="text-xs">Logo clair (pour fonds sombres)</Label>
          <LogoUploader
            workspaceId={workspace.id}
            currentLogoUrl={form.logo_url_light}
            field="logo_url_light"
            variant="light"
            onChange={(url) => setForm({ ...form, logo_url_light: url })}
          />
          <p className="text-[10px] text-muted-foreground mt-1">Affiché sur les landing pages d'offres (fond noir).</p>
        </div>
        <div>
          <Label className="text-xs">Logo sombre (pour fonds clairs)</Label>
          <LogoUploader
            workspaceId={workspace.id}
            currentLogoUrl={form.logo_url_dark}
            field="logo_url_dark"
            variant="dark"
            onChange={(url) => setForm({ ...form, logo_url_dark: url })}
          />
          <p className="text-[10px] text-muted-foreground mt-1">Utilisé pour les PDF (factures, contrats) et impressions.</p>
        </div>
        <div>
          <Label className="text-xs">Email de notification du workspace</Label>
          <Input className="h-8 text-sm" type="email" value={form.notification_email} onChange={(e) => setForm({ ...form, notification_email: e.target.value })} placeholder="contact@workspace.com" />
        </div>
        <div>
          <Label className="text-xs">Couleur de marque</Label>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="color"
              value={form.brand_color}
              onChange={(e) => setForm({ ...form, brand_color: e.target.value })}
              className="h-9 w-12 rounded-md border border-border/50 bg-transparent cursor-pointer"
              aria-label="Couleur de marque"
            />
            <Input
              className="h-8 text-sm font-mono uppercase flex-1"
              value={form.brand_color}
              onChange={(e) => {
                const v = e.target.value;
                if (/^#?[0-9a-fA-F]{0,6}$/.test(v)) {
                  setForm({ ...form, brand_color: v.startsWith('#') ? v : `#${v}` });
                }
              }}
              placeholder="#7C3AED"
            />
            <div
              className="h-9 w-9 rounded-md border border-border/50 shrink-0"
              style={{ backgroundColor: form.brand_color }}
              aria-hidden
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Utilisée comme couleur d'accent sur les landing pages publiques.</p>
        </div>
      </div>
      <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending} className="w-full">
        {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
      </Button>

      {/* Suppression sécurisée */}
      <AlertDialog onOpenChange={(o) => { if (o) loadImpact(); else { setConfirmName(''); setImpact(null); } }}>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="ghost" className="w-full text-destructive gap-1.5 mt-2">
            <Trash2 className="h-3.5 w-3.5" /> Supprimer cet espace
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" /> Supprimer "{workspace.company_name}" ?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p className="text-destructive font-medium">
                  ⚠️ Suppression définitive et immédiate. Toutes les données ci-dessous seront effacées et ne pourront pas être récupérées.
                </p>
                {impact && (
                  <div className="rounded-md bg-muted/50 p-2 text-xs">
                    <div className="font-semibold mb-1">Sera supprimé :</div>
                    <ul className="space-y-0.5">
                      <li>• {impact.leads} prospect(s)</li>
                      <li>• {impact.clients} client(s)</li>
                      <li>• {impact.offers} offre(s)</li>
                      <li>• {impact.invoices} facture(s)</li>
                    </ul>
                    <div className="mt-2 text-muted-foreground">+ rendez-vous, contrats, conversations WhatsApp, tâches, relances et toutes les configurations.</div>
                  </div>
                )}
                <div>
                  Pour confirmer, tape exactement le nom : <strong className="text-foreground">{workspace.company_name}</strong>
                  <Input className="mt-2" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={workspace.company_name} />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={!nameOk || softDelete.isPending}
              onClick={() => softDelete.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

  const duplicateWs = useMutation({
    mutationFn: async (sourceId: string) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase.functions.invoke('duplicate-workspace', {
        body: { source_workspace_id: sourceId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return (data as any).workspace;
    },
    onSuccess: (ws: any) => {
      toast.success(`Espace dupliqué intégralement : "${ws.company_name}"`);
      refetch();
      qc.invalidateQueries({ queryKey: ['workspaces'] });
      switchWorkspace(ws.id);
    },
    onError: (e: any) => toast.error(e.message || 'Erreur duplication'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Mes espaces de travail</h2>
          <p className="text-sm text-muted-foreground">Crée un espace par client/projet pour cloisonner leads, configs et branding.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          {isAdmin && (
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" />Créer un espace</Button>
            </DialogTrigger>
          )}
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

      <div className="grid gap-3 grid-cols-1 max-w-3xl">
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
                  {(isAdmin || w.role === 'owner') && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      disabled={duplicateWs.isPending}
                      onClick={() => duplicateWs.mutate(w.id)}
                    >
                      {duplicateWs.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                      Dupliquer
                    </Button>
                  )}
                </div>
                {user && <MembersList workspaceId={w.id} currentUserId={user.id} canManage={canManage} />}
                <WorkspaceEditor workspace={w} canManage={canManage} />
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
