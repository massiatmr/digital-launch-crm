import { useState } from 'react';
import { Loader2, KeyRound, UserPlus, Copy, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function generatePassword(len = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
}

async function callFn(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-manage-account', { body });
  if (error) {
    let msg = error.message;
    try { msg = (await (error as any).context?.json())?.error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data;
}

function PasswordField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>Mot de passe</Label>
      <div className="flex gap-2">
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="font-mono" placeholder="8 caractères minimum" />
        <Button type="button" variant="outline" size="icon" onClick={() => onChange(generatePassword())} title="Générer">
          <Wand2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function CredentialsBox({ email, password }: { email: string; password: string }) {
  const text = `Connexion : ${window.location.origin}/auth\nEmail : ${email}\nMot de passe : ${password}`;
  return (
    <div className="space-y-2">
      <pre className="rounded-md border border-border bg-muted/30 p-3 text-xs whitespace-pre-wrap font-mono">{text}</pre>
      <Button className="w-full gap-2" onClick={() => { navigator.clipboard.writeText(text); toast.success('Identifiants copiés'); }}>
        <Copy className="h-4 w-4" /> Copier les identifiants
      </Button>
    </div>
  );
}

export function CreateAccountDialog({ workspaceId, workspaceName }: { workspaceId: string; workspaceName: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'owner'>('member');
  const [password, setPassword] = useState(generatePassword());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [existing, setExisting] = useState(false);

  const reset = () => { setName(''); setEmail(''); setRole('member'); setPassword(generatePassword()); setDone(false); setExisting(false); };

  const submit = async () => {
    setBusy(true);
    try {
      const res: any = await callFn({ action: 'create', workspace_id: workspaceId, email: email.trim(), name: name.trim(), role, password });
      setExisting(!!res?.existing);
      setDone(true);
      qc.invalidateQueries({ queryKey: ['workspace-members'] });
      toast.success(res?.existing ? 'Compte existant rattaché' : 'Compte créé');
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
...
        {done && existing ? (
          <div className="space-y-2 py-2 text-sm text-muted-foreground">
            <p>Cet email a déjà un compte. Il aura accès à « {workspaceName} » automatiquement à sa prochaine connexion, avec son mot de passe actuel.</p>
            <p>S'il a oublié son mot de passe, change-le avec l'icône clé 🔑 dans la liste des membres une fois qu'il apparaît.</p>
          </div>
        ) : done ? (
          <div className="space-y-2 py-2">
            <p className="text-sm text-muted-foreground">Le compte est prêt. Envoie ces identifiants à la personne : elle peut se connecter tout de suite.</p>
            <CredentialsBox email={email.trim().toLowerCase()} password={password} />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div><Label>Nom</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jean Dupont" /></div>
            <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@exemple.com" /></div>
            <PasswordField value={password} onChange={setPassword} />
            <div>
              <Label>Rôle</Label>
              <Select value={role} onValueChange={(v) => setRole(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Membre</SelectItem>
                  <SelectItem value="owner">Propriétaire</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <DialogFooter>
          {done ? <Button onClick={() => setOpen(false)}>Fermer</Button> : (
            <Button onClick={submit} disabled={busy || !email.trim() || password.length < 8} className="gap-2">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Créer le compte
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ResetPasswordDialog({ workspaceId, userId, email }: { workspaceId: string; userId: string; email: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState(generatePassword());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await callFn({ action: 'set_password', workspace_id: workspaceId, user_id: userId, password });
      setDone(true);
      toast.success('Mot de passe changé');
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setDone(false); setPassword(generatePassword()); } }}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-7 w-7" title="Changer le mot de passe"><KeyRound className="h-3.5 w-3.5" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nouveau mot de passe pour {email}</DialogTitle></DialogHeader>
        {done ? (
          <div className="space-y-2 py-2">
            <p className="text-sm text-muted-foreground">Actif tout de suite. L'ancien mot de passe ne marche plus.</p>
            <CredentialsBox email={email} password={password} />
          </div>
        ) : (
          <div className="py-2"><PasswordField value={password} onChange={setPassword} /></div>
        )}
        <DialogFooter>
          {done ? <Button onClick={() => setOpen(false)}>Fermer</Button> : (
            <Button onClick={submit} disabled={busy || password.length < 8} className="gap-2">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Changer le mot de passe
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
