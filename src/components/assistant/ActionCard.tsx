import { useState } from 'react';
import { Check, X, Loader2, UserPlus, Edit3, Calendar, Bell, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

const STATUS_LABELS: Record<string, string> = {
  new: 'Nouveau', contacted: 'Contacté', qualified: 'Qualifié',
  proposal: 'Proposition', won: 'Gagné', lost: 'Perdu', ghost: 'Ghost',
};
const SCORE_LABELS: Record<string, string> = {
  hot: '🔥 Chaud', warm: '🟡 Tiède', cold: '❄️ Froid',
};
const SHOW_LABELS: Record<string, string> = {
  pending: 'En attente', show: 'Présent', noshow: 'Absent',
};

export type ActionPayload =
  | { type: 'update_lead'; lead_id: string; lead_name: string; changes: Record<string, any>; summary: string[] }
  | { type: 'create_lead'; fields: Record<string, any> }
  | {
      type: 'booking';
      date: string;
      time_slot?: string;
      lead_id?: string;
      contact_name?: string;
      contact_email?: string;
      contact_phone?: string;
      notes?: string;
      slots?: string[];
    }
  | { type: 'reminder'; lead_id: string; lead_name?: string; action: string; due_date: string };

export type ActionStatus = 'pending' | 'confirmed' | 'cancelled' | 'loading';

type Props = {
  payload: ActionPayload;
  status: ActionStatus;
  onConfirm: (payload: ActionPayload) => Promise<void> | void;
  onCancel: () => void;
  onPickSlot?: (slot: string) => Promise<void> | void;
};

export function ActionCard({ payload, status, onConfirm, onCancel, onPickSlot }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<any>(payload);

  const isLoading = status === 'loading';
  const isDone = status === 'confirmed';
  const isCancelled = status === 'cancelled';

  const icon =
    payload.type === 'update_lead' ? <Edit3 className="h-3.5 w-3.5" /> :
    payload.type === 'create_lead' ? <UserPlus className="h-3.5 w-3.5" /> :
    payload.type === 'booking' ? <Calendar className="h-3.5 w-3.5" /> :
    <Bell className="h-3.5 w-3.5" />;

  const title =
    payload.type === 'update_lead' ? `Modifier ${payload.lead_name}` :
    payload.type === 'create_lead' ? 'Créer un nouveau lead' :
    payload.type === 'booking' ? 'Proposer un rendez-vous' :
    'Créer un rappel';

  if (isCancelled) {
    return (
      <div className="mt-2 rounded-xl border border-border/40 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <X className="inline h-3 w-3 mr-1" /> Annulé
      </div>
    );
  }

  if (isDone) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-500 flex items-center gap-1.5"
      >
        <Check className="h-3.5 w-3.5" /> Action appliquée
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-2 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 to-transparent overflow-hidden"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-primary/15 bg-primary/5">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/15 text-primary">{icon}</span>
        <span className="text-xs font-medium text-foreground">{title}</span>
        <Sparkles className="h-3 w-3 text-primary/60 ml-auto" />
      </div>

      <div className="p-3 space-y-2">
        {payload.type === 'update_lead' && (
          <ul className="space-y-1 text-xs">
            {payload.summary.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1 h-1 w-1 rounded-full bg-primary shrink-0" />
                <span className="text-foreground">{s}</span>
              </li>
            ))}
          </ul>
        )}

        {payload.type === 'create_lead' && (
          editing ? (
            <div className="grid gap-2 text-xs">
              {(['name','email','phone','company_name','message','notes'] as const).map((k) => (
                <div key={k} className="grid grid-cols-3 gap-2 items-center">
                  <label className="text-muted-foreground capitalize">{k.replace('_',' ')}</label>
                  <input
                    className="col-span-2 rounded-md border border-border/40 bg-background px-2 py-1 text-xs"
                    value={draft.fields?.[k] ?? ''}
                    onChange={(e) => setDraft((d: any) => ({ ...d, fields: { ...d.fields, [k]: e.target.value } }))}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              {Object.entries(payload.fields).filter(([_, v]) => v).map(([k, v]) => (
                <div key={k} className="flex gap-1">
                  <span className="text-muted-foreground capitalize">{k.replace('_',' ')}:</span>
                  <span className="text-foreground truncate">{String(v)}</span>
                </div>
              ))}
            </div>
          )
        )}

        {payload.type === 'booking' && (
          <div className="space-y-2 text-xs">
            <div>
              <span className="text-muted-foreground">Date : </span>
              <span className="text-foreground font-medium">{payload.date}</span>
              {payload.time_slot && <span className="text-foreground font-medium"> à {payload.time_slot}</span>}
            </div>
            {payload.contact_name && (
              <div className="text-muted-foreground">
                Contact : <span className="text-foreground">{payload.contact_name}</span>
                {payload.contact_phone && ` · ${payload.contact_phone}`}
              </div>
            )}
            {payload.slots && payload.slots.length > 0 && (
              <div>
                <p className="text-muted-foreground mb-1.5">Créneaux disponibles :</p>
                <div className="flex flex-wrap gap-1.5">
                  {payload.slots.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={isLoading}
                      onClick={() => onPickSlot?.(s)}
                      className={cn(
                        "rounded-md border px-2 py-1 text-[11px] transition-all",
                        payload.time_slot === s
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border/40 hover:border-primary/40 hover:bg-primary/5"
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {payload.slots && payload.slots.length === 0 && (
              <p className="text-destructive">Aucun créneau disponible ce jour.</p>
            )}
          </div>
        )}

        {payload.type === 'reminder' && (
          <div className="space-y-1 text-xs">
            {payload.lead_name && <div><span className="text-muted-foreground">Lead : </span><span className="text-foreground">{payload.lead_name}</span></div>}
            <div><span className="text-muted-foreground">Action : </span><span className="text-foreground">{payload.action}</span></div>
            <div><span className="text-muted-foreground">Échéance : </span><span className="text-foreground">{new Date(payload.due_date).toLocaleString('fr-FR')}</span></div>
          </div>
        )}
      </div>

      {/* Booking pick-slot mode hides confirm buttons (slot picking IS the confirmation) */}
      {!(payload.type === 'booking' && payload.slots && payload.slots.length > 0 && !payload.time_slot) && (
        <div className="flex items-center justify-end gap-1.5 px-3 py-2 border-t border-primary/15 bg-background/40">
          {payload.type === 'create_lead' && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing((v) => !v)} disabled={isLoading}>
              <Edit3 className="h-3 w-3 mr-1" /> {editing ? 'Fermer' : 'Modifier'}
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel} disabled={isLoading}>
            <X className="h-3 w-3 mr-1" /> Annuler
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={() => onConfirm(editing ? draft : payload)}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
            Confirmer
          </Button>
        </div>
      )}
    </motion.div>
  );
}
