import { useAllMessages, useLeads } from '@/hooks/useLeadData';
import { Copy, Smartphone, Mail, MessageSquare, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function MessagesPage() {
  const { data: messages = [], isLoading } = useAllMessages();

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copié !');
  };

  const iconMap: Record<string, any> = {
    whatsapp: Smartphone,
    email: Mail,
    sms: MessageSquare,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl">Messages préparés</h1>
        <p className="mt-1 text-sm text-muted-foreground">Messages générés par l'IA, prêts à copier-coller</p>
      </div>

      {messages.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-5 py-12 text-center text-sm text-muted-foreground">
          Aucun message généré. Ajoutez des leads pour que l'IA génère des messages.
        </div>
      ) : (
        <div className="space-y-4">
          {messages.map((msg: any) => {
            const Icon = iconMap[msg.type] || MessageSquare;
            return (
              <div key={msg.id} className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">{msg.leads?.name || 'Lead'}</span>
                    <span className="text-xs text-muted-foreground uppercase">{msg.type}</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(msg.content)}
                    className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                  >
                    <Copy className="h-3 w-3" /> Copier
                  </button>
                </div>
                <div className="rounded-lg bg-muted/30 p-4">
                  <p className="text-sm whitespace-pre-line">{msg.content}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
