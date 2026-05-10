import { useState, useMemo } from 'react';
import {
  useWhatsAppTemplates, useSyncTemplates, useCreateLocalTemplate,
  useUpdateTemplate, useDeleteTemplate, useActiveWhatsAppBusinessAccountId, useWhatsAppConfigs, WhatsAppTemplate,
} from '@/hooks/useWhatsAppTemplates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Loader2, RefreshCw, Plus, Trash2, Pencil, Search, FileText } from 'lucide-react';

function TemplateDialog({ template, onClose }: { template?: WhatsAppTemplate; onClose: () => void }) {
  const create = useCreateLocalTemplate();
  const update = useUpdateTemplate();
  const [form, setForm] = useState({
    name: template?.name || '',
    language: template?.language || 'fr',
    category: template?.category || 'MARKETING',
    body_text: template?.body_text || '',
  });
  const isEdit = !!template;

  const submit = async () => {
    if (isEdit) await update.mutateAsync({ id: template!.id, ...form });
    else await create.mutateAsync(form);
    onClose();
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{isEdit ? 'Modifier' : 'Nouveau'} template</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Nom (exact comme dans Meta)</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="bienvenue_fr" disabled={isEdit && template?.is_synced} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Langue</Label>
            <Input value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} placeholder="fr" />
          </div>
          <div>
            <Label>Catégorie</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MARKETING">MARKETING</SelectItem>
                <SelectItem value="UTILITY">UTILITY</SelectItem>
                <SelectItem value="AUTHENTICATION">AUTHENTICATION</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>Texte du template</Label>
          <Textarea rows={5} value={form.body_text} onChange={(e) => setForm({ ...form, body_text: e.target.value })}
            placeholder="Salut {{1}} 👋 J'ai vu ta demande pour {{2}}. Quel est ton délai ?" />
          <p className="text-xs text-muted-foreground mt-1">Utilise {`{{1}}, {{2}}…`} — l'IA remplira selon le lead.</p>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Annuler</Button>
        <Button onClick={submit} disabled={create.isPending || update.isPending}>
          {(create.isPending || update.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
          Enregistrer
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function TemplatesManager() {
  const { data: templates = [], isLoading } = useWhatsAppTemplates();
  const activeWaba = useActiveWhatsAppBusinessAccountId();
  const { data: configs = [] } = useWhatsAppConfigs();
  const sync = useSyncTemplates();
  const del = useDeleteTemplate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [wabaFilter, setWabaFilter] = useState<string>('active');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WhatsAppTemplate | undefined>();

  const wabaLabel = useMemo(() => {
    const map = new Map<string, string>();
    configs.forEach((c) => {
      if (c.business_account_id) map.set(c.business_account_id, c.display_phone_number || c.business_account_id);
    });
    return map;
  }, [configs]);

  const filtered = templates.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (wabaFilter === 'active') {
      if (activeWaba && t.business_account_id && t.business_account_id !== activeWaba) return false;
    } else if (wabaFilter !== 'all') {
      if (t.business_account_id !== wabaFilter) return false;
    }
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-lg">Catalogue de templates</h2>
          <p className="text-xs text-muted-foreground">Synchronise depuis Meta ou crée des templates pour ta séquence.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
            {sync.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Synchroniser Meta
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => setEditing(undefined)}><Plus className="h-4 w-4 mr-1" /> Nouveau</Button>
            </DialogTrigger>
            <TemplateDialog template={editing} onClose={() => setDialogOpen(false)} />
          </Dialog>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Chercher un template…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={wabaFilter} onValueChange={setWabaFilter}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Numéro actif uniquement</SelectItem>
            <SelectItem value="all">Tous les numéros</SelectItem>
            {configs.map((c) => (
              <SelectItem key={c.business_account_id} value={c.business_account_id}>
                {c.display_phone_number || c.business_account_id}{c.is_active ? ' (actif)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="APPROVED">Approuvés</SelectItem>
            <SelectItem value="PENDING">En attente</SelectItem>
            <SelectItem value="MANUAL">Manuels</SelectItem>
            <SelectItem value="REJECTED">Rejetés</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
          <FileText className="h-6 w-6 mx-auto mb-2 opacity-50" />
          {templates.length === 0 ? 'Aucun template — synchronise depuis Meta ou crée-en un' : 'Aucun résultat'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => {
            const otherWaba = !!activeWaba && !!t.business_account_id && t.business_account_id !== activeWaba;
            return (
              <div
                key={t.id}
                className={`flex items-start justify-between gap-3 p-3 rounded-lg border border-border bg-background/50 transition-colors ${
                  otherWaba ? 'opacity-50 grayscale' : 'hover:border-primary/30'
                }`}
                title={otherWaba ? "Template d'un autre numéro WhatsApp — non utilisable avec le numéro actif" : undefined}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm font-mono">{t.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase">{t.language}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{t.category}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      t.status === 'APPROVED' ? 'bg-green-500/20 text-green-400' :
                      t.status === 'REJECTED' ? 'bg-red-500/20 text-red-400' :
                      'bg-yellow-500/20 text-yellow-400'
                    }`}>{t.status}</span>
                    {t.variables_count > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">{t.variables_count} var.</span>}
                    {t.business_account_id && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                        otherWaba ? 'border-amber-500/40 text-amber-400' : 'border-primary/30 text-primary'
                      }`}>
                        📱 {wabaLabel.get(t.business_account_id) || t.business_account_id}
                        {otherWaba ? ' · autre' : (activeWaba === t.business_account_id ? ' · actif' : '')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{t.body_text}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(t); setDialogOpen(true); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => confirm('Supprimer ce template ?') && del.mutate(t.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
