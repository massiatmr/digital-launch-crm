import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, ExternalLink, Plus, Trash2, Upload, Link as LinkIcon, FileText, Clock, Receipt, FileSignature } from 'lucide-react';
import InvoiceGenerator from '@/components/InvoiceGenerator';
import ContractGenerator from '@/components/ContractGenerator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import {
  useClient, useUpdateClient, useDeleteClient,
  useClientOnboarding, useCreateOnboarding,
  useClientResources, useAddClientResource, useDeleteClientResource,
  useClientActivities, useAddClientActivity,
  getStatusLabel, type ClientStatus,
} from '@/hooks/useClientData';
import { useOffers } from '@/hooks/useOfferData';

const ALL_STATUSES: ClientStatus[] = ['nouveau', 'signe', 'onboarding_envoye', 'onboarding_complete', 'en_preparation', 'en_cours', 'actif'];

type FormLabel = { title: string; fields: { id: string; label: string }[] };

const WEBSITE_FORM_LABELS: FormLabel[] = [
  { title: 'Informations générales', fields: [{ id: 'company_name', label: "Nom de l'entreprise" }, { id: 'company_email', label: "Email de l'entreprise" }, { id: 'company_phone', label: "Téléphone de l'entreprise" }, { id: 'company_whatsapp', label: "WhatsApp de l'entreprise" }, { id: 'current_website', label: 'Site web actuel' }] },
  { title: 'Objectif du site', fields: [{ id: 'site_type', label: 'Type de site' }, { id: 'main_goal', label: 'Objectif principal' }, { id: 'main_service', label: 'Service principal' }, { id: 'main_offer', label: 'Offre principale' }, { id: 'expected_result', label: 'Résultat attendu' }] },
  { title: 'Offre et contenu', fields: [{ id: 'services', label: 'Services proposés' }, { id: 'avg_price', label: 'Prix moyen' }, { id: 'main_advantage', label: 'Avantage principal' }, { id: 'why_choose', label: 'Pourquoi vous choisir' }, { id: 'testimonials', label: 'Témoignages' }] },
  { title: 'Design', fields: [{ id: 'logo', label: 'Logo' }, { id: 'brand_colors', label: 'Couleurs de la marque' }, { id: 'reference_sites', label: 'Sites de référence' }, { id: 'style', label: 'Style souhaité' }] },
  { title: 'Fonctionnalités', fields: [{ id: 'features', label: 'Fonctionnalités' }] },
  { title: 'Accès techniques', fields: [{ id: 'hosting_access', label: 'Accès hébergement' }, { id: 'wordpress_access', label: 'Accès CMS / WordPress' }, { id: 'email_access', label: 'Accès email professionnel' }] },
  { title: 'Ressources', fields: [{ id: 'photos', label: 'Photos' }, { id: 'videos', label: 'Vidéos' }, { id: 'commercial_docs', label: 'Documents commerciaux' }] },
];

const ADS_FORM_LABELS: FormLabel[] = [
  { title: 'Informations générales', fields: [{ id: 'company_name', label: "Nom de l'entreprise" }, { id: 'company_email', label: "Email" }, { id: 'company_phone', label: "Téléphone" }, { id: 'company_whatsapp', label: "WhatsApp" }, { id: 'website', label: 'Site web' }, { id: 'landing_page', label: 'Landing page' }] },
  { title: 'Activité', fields: [{ id: 'activity_type', label: "Type d'activité" }, { id: 'services', label: 'Services proposés' }, { id: 'main_offer', label: 'Offre principale' }, { id: 'main_advantage', label: 'Avantage principal' }, { id: 'client_guarantee', label: 'Garantie client' }] },
  { title: 'Offre à promouvoir', fields: [{ id: 'promoted_offer', label: 'Offre à promouvoir' }, { id: 'main_message', label: 'Message principal' }, { id: 'current_promo', label: 'Promotion actuelle' }, { id: 'special_offer', label: 'Offre spéciale' }, { id: 'why_choose', label: 'Pourquoi vous choisir' }] },
  { title: 'Zone géographique', fields: [{ id: 'main_city', label: 'Ville principale' }, { id: 'served_areas', label: 'Zones desservies' }, { id: 'max_distance', label: 'Distance maximale' }, { id: 'most_profitable_area', label: 'Zone la plus rentable' }] },
  { title: 'Client cible', fields: [{ id: 'client_type', label: 'Type de clients' }, { id: 'ideal_client', label: 'Client idéal' }, { id: 'min_budget', label: 'Budget minimum client' }, { id: 'request_type', label: 'Type de demande' }, { id: 'avoid_clients', label: 'Clients à éviter' }] },
  { title: 'Objectifs', fields: [{ id: 'main_objective', label: 'Objectif principal' }, { id: 'monthly_leads', label: 'Leads/mois' }, { id: 'monthly_clients', label: 'Clients/mois' }, { id: 'monthly_budget', label: 'Budget pub/mois' }] },
  { title: 'Gestion des leads', fields: [{ id: 'who_responds', label: 'Qui répond' }, { id: 'response_time', label: 'Temps de réponse' }, { id: 'main_contact_method', label: 'Contact préféré' }, { id: 'availability', label: 'Disponibilité' }] },
  { title: 'Contenu marketing', fields: [{ id: 'photos', label: 'Photos' }, { id: 'videos', label: 'Vidéos' }, { id: 'testimonials', label: 'Témoignages' }, { id: 'logo', label: 'Logo' }, { id: 'commercial_docs', label: 'Documents commerciaux' }] },
  { title: 'Accès techniques', fields: [{ id: 'fb_business_manager', label: 'Business Manager' }, { id: 'fb_page', label: 'Page Facebook' }, { id: 'ad_account', label: 'Compte publicitaire' }, { id: 'pixel', label: 'Pixel Facebook' }, { id: 'site_access', label: 'Accès site web' }, { id: 'google_analytics', label: 'Google Analytics' }, { id: 'google_tag_manager', label: 'Google Tag Manager' }] },
];

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: client, isLoading } = useClient(id);
  const { data: offers } = useOffers();
  const { data: onboardings } = useClientOnboarding(id);
  const { data: resources } = useClientResources(id);
  const { data: activities } = useClientActivities(id);
  const updateClient = useUpdateClient();
  const deleteClient = useDeleteClient();
  const createOnboarding = useCreateOnboarding();
  const addResource = useAddClientResource();
  const deleteResource = useDeleteClientResource();
  const addActivity = useAddClientActivity();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [newAccess, setNewAccess] = useState({ service: '', login: '', password: '', url: '' });
  const [newObjective, setNewObjective] = useState('');
  const [resourceUrl, setResourceUrl] = useState('');
  const [resourceName, setResourceName] = useState('');

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Chargement...</div>;
  if (!client) return <div className="text-center py-12 text-muted-foreground">Client introuvable</div>;

  const startEdit = () => {
    setForm({
      name: client.name,
      company_name: client.company_name || '',
      email: client.email || '',
      phone: client.phone || '',
      whatsapp: client.whatsapp || '',
      website: client.website || '',
      status: client.status,
      offer_id: client.offer_id || '',
      notes: client.notes || '',
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    const oldStatus = client.status;
    await updateClient.mutateAsync({ id: client.id, ...form });
    if (form.status !== oldStatus) {
      addActivity.mutate({ client_id: client.id, action: 'status_change', description: `Statut changé de "${getStatusLabel(oldStatus)}" à "${getStatusLabel(form.status)}"` });
    }
    setEditing(false);
  };

  const handleSendOnboarding = async (formType: 'website' | 'ads') => {
    const existing = onboardings?.find(o => o.form_type === formType);
    if (existing) {
      const url = `${window.location.origin}/onboarding/${formType}?token=${existing.token}`;
      navigator.clipboard.writeText(url);
      toast.success('Lien copié !');
      return;
    }
    const result = await createOnboarding.mutateAsync({ client_id: client.id, form_type: formType });
    const url = `${window.location.origin}/onboarding/${formType}?token=${result.token}`;
    navigator.clipboard.writeText(url);
    toast.success('Formulaire créé et lien copié !');
    if (client.status === 'signe' || client.status === 'nouveau') {
      updateClient.mutate({ id: client.id, status: 'onboarding_envoye' as any });
    }
    addActivity.mutate({ client_id: client.id, action: 'onboarding_sent', description: `Formulaire ${formType === 'website' ? 'Site Web' : 'Campagnes Pub'} envoyé` });
  };

  const handleAddAccess = () => {
    if (!newAccess.service) return;
    const accesses = [...(client.technical_accesses || []), newAccess];
    updateClient.mutate({ id: client.id, technical_accesses: accesses } as any);
    setNewAccess({ service: '', login: '', password: '', url: '' });
  };

  const handleRemoveAccess = (idx: number) => {
    const accesses = [...(client.technical_accesses || [])];
    accesses.splice(idx, 1);
    updateClient.mutate({ id: client.id, technical_accesses: accesses } as any);
  };

  const handleAddObjective = () => {
    if (!newObjective) return;
    const objectives = [...(client.objectives || []), { text: newObjective, done: false }];
    updateClient.mutate({ id: client.id, objectives } as any);
    setNewObjective('');
  };

  const handleToggleObjective = (idx: number) => {
    const objectives = [...(client.objectives || [])];
    objectives[idx] = { ...objectives[idx], done: !objectives[idx].done };
    updateClient.mutate({ id: client.id, objectives } as any);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const path = `${client.id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('client-resources').upload(path, file);
    if (error) { toast.error('Erreur upload'); return; }
    const { data: urlData } = supabase.storage.from('client-resources').getPublicUrl(path);
    addResource.mutate({ client_id: client.id, name: file.name, resource_type: 'file', url: urlData.publicUrl, storage_path: path, category: 'document' });
  };

  const handleAddLink = () => {
    if (!resourceUrl || !resourceName) return;
    addResource.mutate({ client_id: client.id, name: resourceName, resource_type: 'link', url: resourceUrl, category: 'link' });
    setResourceUrl('');
    setResourceName('');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/clients')}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{client.name}</h1>
          {client.company_name && <p className="text-sm text-muted-foreground">{client.company_name}</p>}
        </div>
        <Badge variant="outline" className="text-xs">{getStatusLabel(client.status)}</Badge>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="general">Général</TabsTrigger>
          <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
          <TabsTrigger value="invoicing">Facturation</TabsTrigger>
          <TabsTrigger value="contract">Contrat</TabsTrigger>
          <TabsTrigger value="history">Historique</TabsTrigger>
        </TabsList>

        {/* GENERAL */}
        <TabsContent value="general">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Informations générales</CardTitle>
              {!editing ? (
                <Button variant="outline" size="sm" onClick={startEdit}>Modifier</Button>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveEdit} disabled={updateClient.isPending}>Sauvegarder</Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Annuler</Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {editing ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><Label>Nom</Label><Input value={form.name} onChange={e => setForm((p: any) => ({ ...p, name: e.target.value }))} /></div>
                    <div><Label>Entreprise</Label><Input value={form.company_name} onChange={e => setForm((p: any) => ({ ...p, company_name: e.target.value }))} /></div>
                    <div><Label>Email</Label><Input value={form.email} onChange={e => setForm((p: any) => ({ ...p, email: e.target.value }))} /></div>
                    <div><Label>Téléphone</Label><Input value={form.phone} onChange={e => setForm((p: any) => ({ ...p, phone: e.target.value }))} /></div>
                    <div><Label>WhatsApp</Label><Input value={form.whatsapp} onChange={e => setForm((p: any) => ({ ...p, whatsapp: e.target.value }))} /></div>
                    <div><Label>Site web</Label><Input value={form.website} onChange={e => setForm((p: any) => ({ ...p, website: e.target.value }))} /></div>
                  </div>
                  <div>
                    <Label>Statut</Label>
                    <Select value={form.status} onValueChange={v => setForm((p: any) => ({ ...p, status: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{ALL_STATUSES.map(s => <SelectItem key={s} value={s}>{getStatusLabel(s)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Offre signée</Label>
                    <Select value={form.offer_id} onValueChange={v => setForm((p: any) => ({ ...p, offer_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                      <SelectContent>{offers?.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm((p: any) => ({ ...p, notes: e.target.value }))} /></div>
                </>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Email:</span> {client.email || '—'}</div>
                  <div><span className="text-muted-foreground">Téléphone:</span> {client.phone || '—'}</div>
                  <div><span className="text-muted-foreground">WhatsApp:</span> {client.whatsapp || '—'}</div>
                  <div><span className="text-muted-foreground">Site web:</span> {client.website || '—'}</div>
                  <div><span className="text-muted-foreground">Offre:</span> {client.offers?.name || '—'}</div>
                  <div><span className="text-muted-foreground">Créé le:</span> {format(new Date(client.created_at), 'dd MMM yyyy', { locale: fr })}</div>
                  {client.notes && <div className="col-span-2"><span className="text-muted-foreground">Notes:</span> {client.notes}</div>}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ONBOARDING */}
        <TabsContent value="onboarding">
          <Card>
            <CardHeader><CardTitle className="text-base">Formulaires d'onboarding</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {(['website', 'ads'] as const).map(ft => {
                const ob = onboardings?.find(o => o.form_type === ft);
                const label = ft === 'website' ? 'Onboarding Site Web' : 'Onboarding Campagnes Pub';
                return (
                  <div key={ft} className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div>
                      <p className="font-medium text-sm">{label}</p>
                      {ob && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {ob.completed ? '✅ Complété' : '⏳ En attente'} — {format(new Date(ob.updated_at), 'dd/MM/yyyy HH:mm')}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {ob && (
                        <Button variant="outline" size="sm" onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/onboarding/${ft}?token=${ob.token}`);
                          toast.success('Lien copié !');
                        }}>
                          <Copy className="h-3 w-3 mr-1" />Copier le lien
                        </Button>
                      )}
                      <Button size="sm" onClick={() => handleSendOnboarding(ft)}>
                        {ob ? 'Renvoyer' : 'Créer et copier'}
                      </Button>
                    </div>
                  </div>
                );
              })}
              {onboardings?.some(o => o.completed) && (
                <div className="mt-4 space-y-4">
                  <p className="text-sm font-medium text-primary">Réponses reçues</p>
                  {onboardings.filter(o => o.completed).map(ob => {
                    const formType = ob.form_type;
                    const steps = formType === 'website' ? WEBSITE_FORM_LABELS : ADS_FORM_LABELS;
                    const responses = ob.responses as Record<string, any>;
                    return (
                      <div key={ob.id} className="space-y-3">
                        <h4 className="text-sm font-semibold border-b border-border pb-1">
                          {formType === 'website' ? 'Site Web' : 'Campagnes Publicitaires'}
                        </h4>
                        {steps.map((step, stepIdx) => {
                          const stepFields = step.fields.filter(f => {
                            const key = `step${stepIdx}_${f.id}`;
                            const val = responses[key];
                            return val && val !== '' && !(typeof val === 'object' && !val.url);
                          });
                          if (stepFields.length === 0) return null;
                          return (
                            <Card key={stepIdx} className="p-4">
                              <h5 className="text-sm font-medium mb-3">{step.title}</h5>
                              <div className="space-y-2.5">
                                {stepFields.map(f => {
                                  const val = responses[`step${stepIdx}_${f.id}`];
                                  return (
                                    <div key={f.id} className="text-sm">
                                      <span className="text-muted-foreground">{f.label} :</span>
                                      <div className="mt-0.5">
                                        {typeof val === 'string' ? (
                                          <p className="whitespace-pre-wrap">{val}</p>
                                        ) : Array.isArray(val) ? (
                                          <div className="flex flex-wrap gap-1">
                                            {val.map((v: string, i: number) => (
                                              <Badge key={i} variant="secondary" className="text-xs">{v}</Badge>
                                            ))}
                                          </div>
                                        ) : val?.url ? (
                                          <a href={val.url} target="_blank" rel="noreferrer" className="text-primary underline text-xs">
                                            {val.name || val.url}
                                          </a>
                                        ) : (
                                          <p>{JSON.stringify(val)}</p>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </Card>
                          );
                        })}
                        {responses._skippedSteps && Object.entries(responses._skippedSteps).some(([, v]) => v) && (
                          <p className="text-xs text-muted-foreground italic">
                            ℹ️ Certains accès techniques ont été marqués comme déjà partagés.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* FACTURATION */}
        <TabsContent value="invoicing">
          <InvoiceGenerator
            clientName={client.name}
            clientCompany={client.company_name || ''}
            clientEmail={client.email || ''}
            clientPhone={client.phone || ''}
            offerName={(client as any).offers?.name}
          />
        </TabsContent>

        {/* CONTRAT */}
        <TabsContent value="contract">
          <ContractGenerator
            clientName={client.name}
            clientCompany={client.company_name || ''}
            clientEmail={client.email || ''}
            clientPhone={client.phone || ''}
            offerName={(client as any).offers?.name}
          />
        </TabsContent>


        {/* HISTORY */}
        <TabsContent value="history">
          <Card>
            <CardHeader><CardTitle className="text-base">Historique</CardTitle></CardHeader>
            <CardContent>
              {activities?.length ? (
                <div className="space-y-3">
                  {activities.map(a => (
                    <div key={a.id} className="flex gap-3 text-sm">
                      <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p>{a.description || a.action}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(a.created_at), 'dd/MM/yyyy HH:mm', { locale: fr })}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">Aucune activité</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <Button variant="destructive" size="sm" onClick={async () => {
          if (confirm('Supprimer ce client ?')) {
            await deleteClient.mutateAsync(client.id);
            navigate('/clients');
          }
        }}>
          <Trash2 className="h-3 w-3 mr-1" />Supprimer le client
        </Button>
      </div>
    </div>
  );
}
