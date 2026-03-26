import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MailX, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

type Status = "loading" | "valid" | "already" | "invalid" | "success" | "error";

export default function UnsubscribePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<Status>("loading");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) { setStatus("invalid"); return; }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    fetch(`${supabaseUrl}/functions/v1/handle-email-unsubscribe?token=${token}`, {
      headers: { apikey: anonKey },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.valid === false && data.reason === "already_unsubscribed") setStatus("already");
        else if (data.valid) setStatus("valid");
        else setStatus("invalid");
      })
      .catch(() => setStatus("error"));
  }, [token]);

  const handleConfirm = async () => {
    if (!token) return;
    setSubmitting(true);
    try {
      const { data } = await supabase.functions.invoke("handle-email-unsubscribe", {
        body: { token },
      });
      if (data?.success) setStatus("success");
      else if (data?.reason === "already_unsubscribed") setStatus("already");
      else setStatus("error");
    } catch {
      setStatus("error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          {status === "loading" && <Loader2 className="h-10 w-10 animate-spin mx-auto text-muted-foreground" />}

          {status === "valid" && (
            <>
              <MailX className="h-12 w-12 mx-auto text-destructive" />
              <h1 className="text-xl font-bold text-foreground">Se désabonner</h1>
              <p className="text-muted-foreground text-sm">
                Confirmez que vous ne souhaitez plus recevoir d'emails de notre part.
              </p>
              <Button onClick={handleConfirm} disabled={submitting} variant="destructive" className="w-full">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Confirmer le désabonnement
              </Button>
            </>
          )}

          {status === "success" && (
            <>
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-500" />
              <h1 className="text-xl font-bold text-foreground">Désabonné !</h1>
              <p className="text-muted-foreground text-sm">Vous ne recevrez plus d'emails de notre part.</p>
            </>
          )}

          {status === "already" && (
            <>
              <CheckCircle2 className="h-12 w-12 mx-auto text-muted-foreground" />
              <h1 className="text-xl font-bold text-foreground">Déjà désabonné</h1>
              <p className="text-muted-foreground text-sm">Vous êtes déjà désabonné de nos emails.</p>
            </>
          )}

          {status === "invalid" && (
            <>
              <AlertTriangle className="h-12 w-12 mx-auto text-destructive" />
              <h1 className="text-xl font-bold text-foreground">Lien invalide</h1>
              <p className="text-muted-foreground text-sm">Ce lien de désabonnement n'est pas valide ou a expiré.</p>
            </>
          )}

          {status === "error" && (
            <>
              <AlertTriangle className="h-12 w-12 mx-auto text-destructive" />
              <h1 className="text-xl font-bold text-foreground">Erreur</h1>
              <p className="text-muted-foreground text-sm">Une erreur est survenue. Veuillez réessayer plus tard.</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
