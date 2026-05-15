import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useOwnerProfile, useUpdateOwnerProfile } from '@/hooks/useOwnerProfile';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { User, Building, Mail, Lock, AlertTriangle, LogOut, Download, ShieldCheck } from 'lucide-react';
import { useWorkspaces } from '@/hooks/useWorkspaces';

export default function SettingsAccountPage() {
  const { user, signOut } = useAuth();
  const { data: profile } = useOwnerProfile();
  const updateProfile = useUpdateOwnerProfile();

  const [form, setForm] = useState({
    legal_name: '', phone: '', logo_url: '',
    company_name: '', siret: '', vat_number: '', address: '',
    email_sender_name: '', email_signature: '', brand_color: '#7C3AED',
  });
  const [pwd, setPwd] = useState({ next: '', confirm: '' });
  const [newEmail, setNewEmail] = useState('');

  useEffect(() => {
    if (profile) {
      setForm({
        legal_name: profile.legal_name || '',
        phone: profile.phone || '',
        logo_url: profile.logo_url || '',
        company_name: profile.company_name || '',
        siret: profile.siret || '',
        vat_number: profile.vat_number || '',
        address: profile.address || '',
        email_sender_name: profile.email_sender_name || '',
        email_signature: profile.email_signature || '',
        brand_color: profile.brand_color || '#7C3AED',
      });
    }
  }, [profile]);

  const save = (patch: Partial<typeof form>) => {
    updateProfile.mutate(patch as any, {
      onSuccess: () => toast.success('Enregistré'),
      onError: (e: any) => toast.error(e.message),
    });
  };

  const handleChangePassword = async () => {
    if (pwd.next.length < 8) return toast.error('Min 8 caractères');
    if (pwd.next !== pwd.confirm) return toast.error('Les mots de passe ne correspondent pas');
    const { error } = await supabase.auth.updateUser({ password: pwd.next });
    if (error) return toast.error(error.message);
    toast.success('Mot de passe modifié');
    setPwd({ next: '', confirm: '' });
  };

  const handleChangeEmail = async () => {
    if (!newEmail.includes('@')) return toast.error('Email invalide');
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    if (error) return toast.error(error.message);
    toast.success('Email de confirmation envoyé à la nouvelle adresse');
    setNewEmail('');
  };

  const handleSignOutAll = async () => {
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    if (error) return toast.error(error.message);
    toast.success('Toutes les sessions ont été fermées');
  };

  const handleDeleteAccount = async () => {
    toast.error('Demande de suppression — contacte le support à contact@digitallaunch-llc.com');
  };

  return (
    <div className="space-y-6">
      {/* Profil */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><User className="h-4 w-4 text-primary" />Profil</CardTitle>
          <CardDescription>Tes informations personnelles</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Email</Label>
              <Input value={user?.email || ''} disabled />
            </div>
            <div>
              <Label>Nom complet</Label>
              <Input value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} placeholder="Jean Dupont" />
            </div>
            <div>
              <Label>Téléphone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+33 6 12 34 56 78" />
            </div>
            <div>
              <Label>Logo / Avatar (URL)</Label>
              <Input value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} placeholder="https://..." />
            </div>
          </div>
          <Button onClick={() => save({ legal_name: form.legal_name, phone: form.phone, logo_url: form.logo_url })} disabled={updateProfile.isPending}>
            Enregistrer
          </Button>
        </CardContent>
      </Card>

      {/* Identité légale */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Building className="h-4 w-4 text-primary" />Identité légale</CardTitle>
          <CardDescription>Utilisée pour les factures et contrats</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Raison sociale</Label>
              <Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
            </div>
            <div>
              <Label>SIRET</Label>
              <Input value={form.siret} onChange={(e) => setForm({ ...form, siret: e.target.value })} />
            </div>
            <div>
              <Label>N° TVA</Label>
              <Input value={form.vat_number} onChange={(e) => setForm({ ...form, vat_number: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Adresse</Label>
              <Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
          </div>
          <Button onClick={() => save({ company_name: form.company_name, siret: form.siret, vat_number: form.vat_number, address: form.address })} disabled={updateProfile.isPending}>
            Enregistrer
          </Button>
        </CardContent>
      </Card>

      {/* Branding email */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mail className="h-4 w-4 text-primary" />Branding email</CardTitle>
          <CardDescription>Identité utilisée dans les emails envoyés à tes leads et clients</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Nom d'expéditeur</Label>
              <Input value={form.email_sender_name} onChange={(e) => setForm({ ...form, email_sender_name: e.target.value })} placeholder="Jean — Digital Launch" />
            </div>
            <div>
              <Label>Couleur de marque</Label>
              <div className="flex gap-2">
                <Input type="color" className="h-10 w-16 p-1" value={form.brand_color} onChange={(e) => setForm({ ...form, brand_color: e.target.value })} />
                <Input value={form.brand_color} onChange={(e) => setForm({ ...form, brand_color: e.target.value })} />
              </div>
            </div>
            <div className="sm:col-span-2">
              <Label>Signature email</Label>
              <Textarea rows={3} value={form.email_signature} onChange={(e) => setForm({ ...form, email_signature: e.target.value })} placeholder="Cordialement,&#10;Jean Dupont" />
            </div>
          </div>
          <Button onClick={() => save({ email_sender_name: form.email_sender_name, email_signature: form.email_signature, brand_color: form.brand_color })} disabled={updateProfile.isPending}>
            Enregistrer
          </Button>
        </CardContent>
      </Card>

      {/* Sécurité */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Lock className="h-4 w-4 text-primary" />Sécurité</CardTitle>
          <CardDescription>Mot de passe, email et sessions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Changer le mot de passe</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input type="password" placeholder="Nouveau mot de passe" value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} />
              <Input type="password" placeholder="Confirmer" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} />
            </div>
            <Button size="sm" onClick={handleChangePassword} disabled={!pwd.next}>Modifier</Button>
          </div>

          <Separator />

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Changer l'email</h3>
            <p className="text-xs text-muted-foreground">Un email de confirmation sera envoyé à la nouvelle adresse.</p>
            <div className="flex gap-2">
              <Input type="email" placeholder="nouveau@email.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
              <Button size="sm" onClick={handleChangeEmail} disabled={!newEmail}>Envoyer</Button>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Sessions</h3>
            <Button variant="outline" size="sm" onClick={handleSignOutAll} className="gap-2">
              <LogOut className="h-3.5 w-3.5" />Déconnecter toutes les sessions
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sauvegarde / Export */}
      <ExportBackupCard />

      {/* Danger zone */}
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-4 w-4" />Zone dangereuse</CardTitle>
          <CardDescription>Actions irréversibles</CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">Supprimer mon compte</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer ton compte ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Cette action est irréversible. Toutes tes données (leads, clients, factures) seront supprimées.
                  La suppression doit être validée manuellement par le support.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteAccount} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Demander la suppression
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}

function ExportBackupCard() {
  const { currentWorkspace } = useWorkspaces();
  const [loading, setLoading] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);

  const handleExportLeadsCsv = async () => {
    if (!currentWorkspace) return toast.error('Aucun espace sélectionné');
    setCsvLoading(true);
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (!data || data.length === 0) {
        toast.info('Aucun lead à exporter');
        return;
      }
      const headers = Array.from(
        data.reduce((set: Set<string>, row: any) => {
          Object.keys(row).forEach((k) => set.add(k));
          return set;
        }, new Set<string>())
      );
      const escape = (v: any) => {
        if (v === null || v === undefined) return '';
        let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
        if (/[",\n;]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      const csv = [
        headers.join(','),
        ...data.map((row: any) => headers.map((h) => escape(row[h])).join(',')),
      ].join('\n');
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = `leads-${currentWorkspace.company_name || 'workspace'}-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(dlUrl);
      toast.success(`${data.length} leads exportés`);
    } catch (e: any) {
      toast.error(e.message || 'Erreur lors de l\'export CSV');
    } finally {
      setCsvLoading(false);
    }
  };

  const handleExport = async () => {
    if (!currentWorkspace) return toast.error('Aucun espace sélectionné');
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Non authentifié');

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-workspace`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ workspace_id: currentWorkspace.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erreur ${res.status}`);
      }
      const blob = await res.blob();
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = `backup-${currentWorkspace.company_name || 'workspace'}-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(dlUrl);
      toast.success('Sauvegarde téléchargée');
    } catch (e: any) {
      toast.error(e.message || 'Erreur lors de l\'export');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" />Sauvegarde de mes données</CardTitle>
        <CardDescription>
          Télécharge un instantané JSON complet de ton espace (leads, clients, offres, factures, contrats, automations).
          Garde-le précieusement : c'est ta meilleure assurance contre toute perte de données.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={handleExport} disabled={loading || !currentWorkspace} className="gap-2">
          <Download className="h-4 w-4" />
          {loading ? 'Préparation…' : `Exporter "${currentWorkspace?.company_name || ''}"`}
        </Button>
      </CardContent>
    </Card>
  );
}
