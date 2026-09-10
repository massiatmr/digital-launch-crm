import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspaceId, useWorkspaces } from "@/hooks/useWorkspaces";

interface SmtpState {
  configured: boolean;
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  from_email: string;
  from_name: string;
  has_password: boolean;
}

const EMPTY: SmtpState = {
  configured: false,
  enabled: true,
  host: "",
  port: 587,
  username: "",
  from_email: "",
  from_name: "",
  has_password: false,
};

export function WorkspaceSmtpSection() {
  const workspaceId = useCurrentWorkspaceId();
  const { currentWorkspace } = useWorkspaces();
  const [state, setState] = useState<SmtpState>(EMPTY);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo] = useState("");

  useEffect(() => {
    if (!workspaceId) return;
    setLoading(true);
    setPassword("");
    (supabase.rpc as any)("get_workspace_smtp", { _workspace_id: workspaceId })
      .then(({ data, error }: any) => {
        if (error) {
          toast.error("Impossible de charger les réglages email");
          setState(EMPTY);
        } else if (data?.configured) {
          setState({
            configured: true,
            enabled: !!data.enabled,
            host: data.host || "",
            port: Number(data.port || 587),
            username: data.username || "",
            from_email: data.from_email || "",
            from_name: data.from_name || "",
            has_password: !!data.has_password,
          });
        } else {
          setState(EMPTY);
        }
      })
      .finally(() => setLoading(false));
  }, [workspaceId]);

  const save = async () => {
    if (!workspaceId) return;
    if (!state.host || !state.username) {
      toast.error("Renseigne au moins le serveur et l'identifiant");
      return;
    }
    if (!state.has_password && !password) {
      toast.error("Renseigne le mot de passe de la boîte email");
      return;
    }
    setSaving(true);
    const { data, error } = await (supabase.rpc as any)("save_workspace_smtp", {
      _workspace_id: workspaceId,
      _enabled: state.enabled,
      _host: state.host.trim(),
      _port: Number(state.port) || 587,
      _username: state.username.trim(),
      _from_email: state.from_email.trim() || state.username.trim(),
      _from_name: state.from_name.trim() || null,
      _password: password || null,
    });
    setSaving(false);
    if (error) {
      toast.error("Enregistrement impossible : " + error.message);
      return;
    }
    setPassword("");
    setState((s) => ({ ...s, configured: true, has_password: !!(data as any)?.has_password }));
    toast.success("Réglages email enregistrés");
  };

  const reset = async () => {
    if (!workspaceId) return;
    const { error } = await (supabase.rpc as any)("delete_workspace_smtp", { _workspace_id: workspaceId });
    if (error) {
      toast.error("Suppression impossible");
      return;
    }
    setState(EMPTY);
    setPassword("");
    toast.success("Retour à l'expéditeur par défaut");
  };

  const sendTest = async () => {
    if (!workspaceId || !testTo) {
      toast.error("Indique une adresse pour le test");
      return;
    }
    setTesting(true);
    const { data, error } = await supabase.functions.invoke("workspace-smtp-test", {
      body: { workspaceId, to: testTo },
    });
    setTesting(false);
    const err = (error as any)?.message || (data as any)?.error;
    if (err) toast.error("Échec de l'envoi : " + err);
    else toast.success("Email de test envoyé ✅");
  };

  return (
    <Card className="border-white/5 bg-card/50 backdrop-blur">
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" /> Expéditeur email (SMTP)
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Chaque espace peut envoyer ses emails depuis sa propre adresse. Sans réglage ici, l'expéditeur par
              défaut est utilisé.
            </CardDescription>
          </div>
          {state.configured ? (
            <Badge variant={state.enabled ? "default" : "secondary"}>
              {state.enabled ? "Adresse propre active" : "Désactivé"}
            </Badge>
          ) : (
            <Badge variant="secondary">Expéditeur par défaut</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!workspaceId && (
          <p className="text-xs text-muted-foreground">Sélectionne un espace de travail.</p>
        )}
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {workspaceId && !loading && (
          <>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-white/5 p-3">
              <div>
                <p className="text-sm font-medium">Utiliser cette adresse pour {currentWorkspace?.name || "cet espace"}</p>
                <p className="text-xs text-muted-foreground">Désactive pour repasser à l'expéditeur par défaut.</p>
              </div>
              <Switch
                checked={state.enabled}
                onCheckedChange={(v) => setState((s) => ({ ...s, enabled: v }))}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Serveur d'envoi</Label>
                <Input
                  className="h-11"
                  placeholder="ex: mail.mondomaine.com"
                  value={state.host}
                  onChange={(e) => setState((s) => ({ ...s, host: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Port</Label>
                <Input
                  className="h-11"
                  type="number"
                  placeholder="587"
                  value={state.port}
                  onChange={(e) => setState((s) => ({ ...s, port: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Identifiant (email complet)</Label>
                <Input
                  className="h-11"
                  placeholder="contact@mondomaine.com"
                  value={state.username}
                  onChange={(e) => setState((s) => ({ ...s, username: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Mot de passe {state.has_password && <span className="text-muted-foreground">(déjà enregistré)</span>}
                </Label>
                <Input
                  className="h-11"
                  type="password"
                  autoComplete="new-password"
                  placeholder={state.has_password ? "••••••••  (laisser vide pour garder)" : "Mot de passe de la boîte"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Adresse affichée</Label>
                <Input
                  className="h-11"
                  placeholder="contact@mondomaine.com"
                  value={state.from_email}
                  onChange={(e) => setState((s) => ({ ...s, from_email: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Nom affiché</Label>
                <Input
                  className="h-11"
                  placeholder="ex: HKSN Services"
                  value={state.from_name}
                  onChange={(e) => setState((s) => ({ ...s, from_name: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Enregistrer
              </Button>
              {state.configured && (
                <Button variant="outline" onClick={reset}>
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Revenir au défaut
                </Button>
              )}
            </div>

            <div className="rounded-lg border border-white/5 p-3 space-y-2">
              <p className="text-sm font-medium">Tester l'envoi</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  className="h-11"
                  type="email"
                  placeholder="ton@email.com"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                />
                <Button variant="outline" onClick={sendTest} disabled={testing} className="shrink-0">
                  {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                  Envoyer un test
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
