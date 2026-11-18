import { useState } from 'react';
import { useLeadActivities, useAddActivity, type DbActivity } from '@/hooks/useLeadData';
import { Phone, MessageCircle, Mail, StickyNote, RefreshCw, Users, Plus, Loader2, Send } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { CallRecorderButton, CallRecordingDialog, useCallRecordings } from '@/components/CallRecorder';
import { PlayCircle } from 'lucide-react';

const ACTIVITY_CONFIG: Record<DbActivity['activity_type'], { icon: typeof Phone; label: string; color: string }> = {
  call: { icon: Phone, label: 'Appel', color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
  whatsapp: { icon: MessageCircle, label: 'WhatsApp', color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' },
  email: { icon: Mail, label: 'Email', color: 'text-purple-400 bg-purple-400/10 border-purple-400/20' },
  note: { icon: StickyNote, label: 'Note', color: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
  relance: { icon: RefreshCw, label: 'Relance', color: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20' },
  meeting: { icon: Users, label: 'RDV', color: 'text-pink-400 bg-pink-400/10 border-pink-400/20' },
};

function AddActivityForm({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const [type, setType] = useState<DbActivity['activity_type']>('note');
  const [description, setDescription] = useState('');
  const [leadResponse, setLeadResponse] = useState('');
  const addActivity = useAddActivity();

  const handleSubmit = () => {
    if (!description.trim()) return;
    addActivity.mutate(
      { leadId, activityType: type, description: description.trim(), leadResponse: leadResponse.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('Activité ajoutée');
          onClose();
        },
        onError: () => toast.error('Erreur lors de l\'ajout'),
      }
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm p-4 space-y-3">
        <Select value={type} onValueChange={(v) => setType(v as DbActivity['activity_type'])}>
          <SelectTrigger className="w-full bg-background/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(ACTIVITY_CONFIG).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>
                <span className="flex items-center gap-2">
                  <cfg.icon className="h-3.5 w-3.5" />
                  {cfg.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {type === 'call' && (
          <div className="rounded-lg border border-border/50 bg-background/40 p-3 space-y-2">
            <p className="text-xs text-muted-foreground">Option : enregistre l'appel, la transcription s'ajoute toute seule à l'historique.</p>
            <CallRecorderButton leadId={leadId} />
          </div>
        )}

        <Textarea
          placeholder={type === 'call' ? "Notes sur l'appel..." : "Ce que j'ai fait..."}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="min-h-[60px] bg-background/50 resize-none"
        />

        <Textarea
          placeholder="Réponse du lead (optionnel)"
          value={leadResponse}
          onChange={(e) => setLeadResponse(e.target.value)}
          className="min-h-[50px] bg-background/50 resize-none"
        />

        <div className="flex items-center gap-2 justify-end">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={!description.trim() || addActivity.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {addActivity.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            Ajouter
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export function LeadActivityTimeline({ leadId }: { leadId: string }) {
  const { data: activities = [], isLoading } = useLeadActivities(leadId);
  const [showForm, setShowForm] = useState(false);
  const { data: recordings = [] } = useCallRecordings(leadId);
  const [openRec, setOpenRec] = useState<any | null>(null);
  const recByActivity = new Map(recordings.filter((r) => r.activity_id).map((r) => [r.activity_id, r]));

  return (
    <div className="rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-base flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-accent animate-pulse" />
          Historique d'interactions
        </h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-background/50 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
        >
          <Plus className="h-3.5 w-3.5" />
          Ajouter
        </button>
      </div>

      <CallRecordingDialog rec={openRec ? recordings.find((r) => r.id === openRec.id) ?? openRec : null} leadId={leadId} onClose={() => setOpenRec(null)} />

      <AnimatePresence>
        {showForm && <AddActivityForm leadId={leadId} onClose={() => setShowForm(false)} />}
      </AnimatePresence>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : activities.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Aucune interaction enregistrée.</p>
      ) : (
        <div className="relative space-y-0">
          {/* Timeline line */}
          <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border/50" />

          {activities.map((activity, i) => {
            const config = ACTIVITY_CONFIG[activity.activity_type];
            const Icon = config.icon;

            return (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="relative flex gap-3 pb-4 last:pb-0"
              >
                {/* Icon dot */}
                <div className={cn('relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border', config.color)}>
                  <Icon className="h-3.5 w-3.5" />
                </div>

                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-foreground">{config.label}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true, locale: fr })}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{activity.description}</p>
                  {recByActivity.has(activity.id) && (
                    <button onClick={() => setOpenRec(recByActivity.get(activity.id))}
                      className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20">
                      <PlayCircle className="h-4 w-4" /> Écouter & transcription
                    </button>
                  )}
                  {activity.lead_response && (
                    <div className="mt-1.5 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2">
                      <span className="text-[10px] font-medium text-accent uppercase tracking-wider">Réponse du lead</span>
                      <p className="mt-0.5 text-sm text-foreground">{activity.lead_response}</p>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
