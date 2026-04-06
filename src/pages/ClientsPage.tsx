import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Building2, Mail, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useClients, useCreateClient, getStatusLabel, type ClientStatus } from '@/hooks/useClientData';
import { useOffers } from '@/hooks/useOfferData';

const statusColors: Record<ClientStatus, string> = {
  nouveau: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  signe: 'bg-green-500/20 text-green-400 border-green-500/30',
  onboarding_envoye: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  onboarding_complete: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  en_preparation: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  en_cours: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  actif: 'bg-primary/20 text-primary border-primary/30',
};

export default function ClientsPage() {
  const navigate = useNavigate();
  const { data: clients, isLoading } = useClients();
  const { data: offers } = useOffers();
  const createClient = useCreateClient();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', company_name: '', email: '', phone: '', whatsapp: '', offer_id: '' });

  const filtered = clients?.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.company_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    await createClient.mutateAsync({
      name: form.name,
      company_name: form.company_name,
      email: form.email,
      phone: form.phone,
      whatsapp: form.whatsapp,
      offer_id: form.offer_id || null,
    } as any);
    setForm({ name: '', company_name: '', email: '', phone: '', whatsapp: '', offer_id: '' });
    setOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Clients</h1>
          <p className="text-sm text-muted-foreground">{clients?.length || 0} client(s)</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Nouveau client</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nouveau client</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Nom *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Nom du contact" /></div>
              <div><Label>Entreprise</Label><Input value={form.company_name} onChange={e => setForm(p => ({ ...p, company_name: e.target.value }))} placeholder="Nom de l'entreprise" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
                <div><Label>Téléphone</Label><Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
              </div>
              <div><Label>WhatsApp</Label><Input value={form.whatsapp} onChange={e => setForm(p => ({ ...p, whatsapp: e.target.value }))} /></div>
              <div>
                <Label>Offre signée</Label>
                <Select value={form.offer_id} onValueChange={v => setForm(p => ({ ...p, offer_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner une offre" /></SelectTrigger>
                  <SelectContent>
                    {offers?.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={handleCreate} disabled={createClient.isPending || !form.name.trim()}>
                {createClient.isPending ? 'Création...' : 'Créer le client'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Rechercher un client..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-center py-12">Chargement...</div>
      ) : !filtered?.length ? (
        <div className="text-muted-foreground text-center py-12">Aucun client trouvé</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(client => (
            <Card
              key={client.id}
              className="p-4 cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => navigate(`/clients/${client.id}`)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{client.name}</p>
                  {client.company_name && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1 truncate">
                      <Building2 className="h-3 w-3 shrink-0" />{client.company_name}
                    </p>
                  )}
                </div>
                <Badge variant="outline" className={statusColors[client.status]}>
                  {getStatusLabel(client.status)}
                </Badge>
              </div>
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                {client.email && <p className="flex items-center gap-1.5"><Mail className="h-3 w-3" />{client.email}</p>}
                {client.phone && <p className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{client.phone}</p>}
                {client.offers?.name && <p className="text-primary text-[11px] mt-2">📦 {client.offers.name}</p>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
