import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateLead } from '@/hooks/useLeadData';

const sources = [
  { value: 'facebook', label: 'Facebook Lead Ads' },
  { value: 'website', label: 'Site web' },
  { value: 'google_sheets', label: 'Google Sheets' },
  { value: 'manual', label: 'Manuel' },
  { value: 'other', label: 'Autre' },
];

export default function AddLeadPage() {
  const navigate = useNavigate();
  const createLead = useCreateLead();
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    message: '',
    source: 'manual',
  });

  const update = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Le nom est requis');
      return;
    }

    try {
      await createLead.mutateAsync(form);
      toast.success(`Lead "${form.name}" ajouté ! L'IA analyse le lead...`);
      navigate('/leads');
    } catch (err) {
      toast.error("Erreur lors de l'ajout du lead");
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <Link to="/leads" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour aux leads
      </Link>

      <div>
        <h1 className="font-heading text-3xl">Ajouter un lead</h1>
        <p className="mt-1 text-sm text-muted-foreground">L'IA analysera automatiquement le lead et générera messages et scripts</p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-6 space-y-5">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Nom complet *</label>
          <input
            type="text"
            value={form.name}
            onChange={e => update('name', e.target.value)}
            placeholder="Ex : Karim Benali"
            className="w-full rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => update('email', e.target.value)}
              placeholder="email@exemple.com"
              className="w-full rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Téléphone</label>
            <input
              type="tel"
              value={form.phone}
              onChange={e => update('phone', e.target.value)}
              placeholder="+33 6 12 34 56 78"
              className="w-full rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Source</label>
          <select
            value={form.source}
            onChange={e => update('source', e.target.value)}
            className="w-full rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {sources.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Message / Besoin</label>
          <textarea
            value={form.message}
            onChange={e => update('message', e.target.value)}
            placeholder="Décrivez le besoin du lead..."
            rows={4}
            className="w-full rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Link
            to="/leads"
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Annuler
          </Link>
          <button
            type="submit"
            disabled={createLead.isPending}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {createLead.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {createLead.isPending ? 'Analyse IA en cours...' : 'Ajouter le lead'}
          </button>
        </div>
      </form>
    </div>
  );
}
