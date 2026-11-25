import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useIsAdmin } from '@/hooks/useWorkspaceFeatures';
import { useSopConfig, useSaveSopConfig } from '@/hooks/useSopConfig';
import { DEFAULT_SOP, SOP_FIELDS, type SopConfig } from '@/lib/sop';

export default function SettingsSopPage() {
  const { user } = useAuth();
  const { currentWorkspace, currentWorkspaceId } = useWorkspaces();
  const { data: isAdmin = false } = useIsAdmin();
  const canEdit = currentWorkspace?.role === 'owner' || isAdmin;
  const { data } = useSopConfig();
  const save = useSaveSopConfig();
  const [cfg, setCfg] = useState<SopConfig | null>(null);
  const meta = (user?.user_metadata || {}) as any;
  const [myName, setMyName] = useState(meta.sop_name || '');
  const [myPhone, setMyPhone] = useState(meta.sop_phone || '');

  useEffect(() => { if (data) setCfg(data); }, [data]);
  if (!cfg) return null;

  const set = (patch: Partial<SopConfig>) => setCfg({ ...cfg, ...patch });
  const setMsg = (i: number, patch: any) => set({ messages: cfg.messages.map((m, j) => (j === i ? { ...m, ...patch } : m)) });

  const saveMine = async () => {
    const { error } = await supabase.auth.updateUser({ data: { sop_name: myName.trim(), sop_phone: myPhone.trim() } });
    error ? toast.error(error.message) : toast.success('Tes infos sont enregistrées');
  };
  const saveWs = async () => {
    try { await save.mutateAsync({ workspaceId: currentWorkspaceId!, config: cfg }); toast.success('Process enregistré pour cet espace'); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-6">
      <section className="glass-card space-y-3 p-4">
        <h3 className="font-heading text-base">Mes infos (dans tous mes espaces)</h3>
        <p className="text-xs text-muted-foreground">Remplissent {'{Assistante}'} et {'{Numéro}'} dans les messages.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Mon prénom</Label><Input value={myName} onChange={(e) => setMyName(e.target.value)} placeholder="Sara" /></div>
          <div><Label>Mon numéro WhatsApp</Label><Input value={myPhone} onChange={(e) => setMyPhone(e.target.value)} placeholder="+213 5…" /></div>
        </div>
        <Button onClick={saveMine}>Enregistrer mes infos</Button>
      </section>

      <section className="glass-card space-y-4 p-4">
        <div>
          <h3 className="font-heading text-base">Process de l'espace « {currentWorkspace?.company_name} »</h3>
          <p className="text-xs text-muted-foreground">{canEdit ? 'Chaque espace a ses propres messages et réglages.' : 'Seul le propriétaire peut modifier ces réglages.'}</p>
        </div>
        <fieldset disabled={!canEdit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Nom de l'entreprise ({'{Entreprise}'})</Label><Input value={cfg.company_label} onChange={(e) => set({ company_label: e.target.value })} placeholder={currentWorkspace?.company_name} /></div>
            <div><Label>Consultant ({'{Consultant}'})</Label><Input value={cfg.consultant_name} onChange={(e) => set({ consultant_name: e.target.value })} placeholder="Massi" /></div>
            <div><Label>Lien visio par défaut ({'{Lien visio}'})</Label><Input value={cfg.visio_link} onChange={(e) => set({ visio_link: e.target.value })} placeholder="Utilisé si le RDV n'a pas de lien" /></div>
            <div><Label>Lien vidéo par défaut ({'{Lien VSL}'})</Label><Input value={cfg.vsl_link} onChange={(e) => set({ vsl_link: e.target.value })} placeholder="Utilisé si l'offre n'a pas de lien" /></div>
            <div><Label>Rappel vert jusqu'à (min)</Label><Input type="number" value={cfg.speed_green_min} onChange={(e) => set({ speed_green_min: Number(e.target.value) || 0 })} /></div>
            <div><Label>Rouge à partir de (min)</Label><Input type="number" value={cfg.speed_red_min} onChange={(e) => set({ speed_red_min: Number(e.target.value) || 0 })} /></div>
          </div>
          <p className="text-xs text-muted-foreground">Champs disponibles : {SOP_FIELDS.join(' ')}</p>
          {cfg.messages.map((m, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-border/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Input className="w-full sm:w-56" value={m.label} onChange={(e) => setMsg(i, { label: e.target.value })} />
                <Input className="flex-1" value={m.when} onChange={(e) => setMsg(i, { when: e.target.value })} placeholder="Quand l'envoyer" />
                <Switch checked={m.enabled} onCheckedChange={(v) => setMsg(i, { enabled: v })} />
                <Button size="icon" variant="ghost" onClick={() => set({ messages: cfg.messages.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
              </div>
              <Textarea rows={5} value={m.body} onChange={(e) => setMsg(i, { body: e.target.value })} />
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => set({ messages: [...cfg.messages, { key: String(Date.now()), label: 'Nouveau message', when: '', body: 'Salam {Prénom}, ', enabled: true }] })}><Plus className="mr-1 h-4 w-4" />Ajouter un message</Button>
            <Button variant="ghost" onClick={() => set({ messages: DEFAULT_SOP.messages })}><RotateCcw className="mr-1 h-4 w-4" />Messages par défaut</Button>
            <Button onClick={saveWs} disabled={save.isPending}>Enregistrer le process</Button>
          </div>
        </fieldset>
      </section>
    </div>
  );
}
