import { useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { DbLead, useUpdateLead } from '@/hooks/useLeadData';
import { useOffers } from '@/hooks/useOfferData';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { CalendarIcon, Loader2, Save, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { LostReasonDialog } from '@/components/LostReasonDialog';

const sources = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'website', label: 'Site web' },
  { value: 'google_sheets', label: 'Google Sheets' },
  { value: 'organic_social', label: 'Réseaux organic' },
  { value: 'recommendation', label: 'Recommendation' },
  { value: 'google_my_business', label: 'Google My Business' },
  { value: 'manual', label: 'Manuel' },
  { value: 'other', label: 'Autre' },
];

const scores = [
  { value: 'hot', label: '🔥 Chaud' },
  { value: 'warm', label: '🟠 Tiède' },
  { value: 'cold', label: '🔵 Froid' },
];

const statuses = [
  { value: 'new', label: 'Nouveau' },
  { value: 'contacted', label: 'Contacté' },
  { value: 'qualified', label: 'Qualifié' },
  { value: 'proposal', label: 'Proposition' },
  { value: 'won', label: 'Gagné' },
  { value: 'lost', label: 'Perdu' },
  { value: 'ghost', label: 'Ghost' },
];

const showStatuses = [
  { value: 'pending', label: '⏳ En attente' },
  { value: 'show', label: '✅ Présent' },
  { value: 'noshow', label: '❌ Absent' },
];

interface LeadEditFormProps {
  lead: DbLead;
  onClose?: () => void;
  inline?: boolean;
}

export function LeadEditForm({ lead, onClose, inline = false }: LeadEditFormProps) {
  const updateLead = useUpdateLead();
  const { data: offers = [] } = useOffers();
  const [showLostDialog, setShowLostDialog] = useState(false);
  const [form, setForm] = useState({
    name: lead.name,
    email: lead.email || '',
    phone: lead.phone || '',
    company_name: lead.company_name || '',
    source: lead.source,
    score: lead.score,
    status: lead.status,
    show_status: lead.show_status || 'pending',
    notes: lead.notes || '',
    next_action: lead.next_action || '',
    created_at: lead.created_at,
    lost_reason: lead.lost_reason || '',
    offer_id: lead.offer_id || 'none',
  });

  const update = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const handleStatusChange = (v: string) => {
    if (v === 'lost') {
      setShowLostDialog(true);
    } else {
      update('status', v);
      if (form.lost_reason) update('lost_reason', '');
    }
  };

  const handleLostConfirm = (reason: string) => {
    setForm(prev => ({ ...prev, status: 'lost', lost_reason: reason }));
    setShowLostDialog(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Le nom est obligatoire');
      return;
    }
    try {
      const payload: any = { id: lead.id, ...form, offer_id: form.offer_id === 'none' ? null : form.offer_id };
      await updateLead.mutateAsync(payload);
      toast.success('Lead mis à jour !');
      onClose?.();
    } catch {
      toast.error('Erreur lors de la mise à jour');
    }
  };

  return (
    <motion.form
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      onSubmit={handleSubmit}
      className="w-full min-w-0 max-w-full rounded-xl border border-border/60 bg-card p-3 sm:p-5 space-y-4"
    >

      <div className="flex items-center justify-between">
        <h3 className="font-heading text-base">Modifier le lead</h3>
        {onClose && !inline && (
          <Button type="button" variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="edit-name">Nom *</Label>
          <Input id="edit-name" value={form.name} onChange={e => update('name', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-company">Entreprise</Label>
          <Input id="edit-company" value={form.company_name} onChange={e => update('company_name', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-email">Email</Label>
          <Input id="edit-email" type="email" value={form.email} onChange={e => update('email', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-phone">Téléphone</Label>
          <Input id="edit-phone" type="tel" value={form.phone} onChange={e => update('phone', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Source</Label>
          <Select value={form.source} onValueChange={v => update('source', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {sources.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Score</Label>
          <Select value={form.score} onValueChange={v => update('score', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {scores.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Statut</Label>
          <Select value={form.status} onValueChange={handleStatusChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {statuses.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {form.status === 'lost' && form.lost_reason && (
            <p className="text-xs text-muted-foreground mt-1">Raison : {form.lost_reason}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-action">Prochaine action</Label>
          <Input id="edit-action" value={form.next_action} onChange={e => update('next_action', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Date de création</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(new Date(form.created_at), 'dd MMM yyyy', { locale: fr })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={new Date(form.created_at)}
                onSelect={(date) => date && setForm(prev => ({ ...prev, created_at: date.toISOString() }))}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-1.5">
          <Label>Offre</Label>
          <Select value={form.offer_id} onValueChange={v => update('offer_id', v)}>
            <SelectTrigger><SelectValue placeholder="Aucune offre" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Aucune offre</SelectItem>
              {offers.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Présence au RDV</Label>
          <Select value={form.show_status} onValueChange={v => update('show_status', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {showStatuses.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-notes">Notes</Label>
        <Textarea id="edit-notes" value={form.notes} onChange={e => update('notes', e.target.value)} rows={3} />
      </div>

      <div className="flex justify-end gap-2">
        {onClose && !inline && (
          <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
        )}
        <Button type="submit" disabled={updateLead.isPending}>
          {updateLead.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Enregistrer
        </Button>
      </div>
      <LostReasonDialog
        open={showLostDialog}
        onConfirm={handleLostConfirm}
        onCancel={() => setShowLostDialog(false)}
      />
    </motion.form>
  );
}
