import { useEffect, useState } from 'react';
import { useFollowupSettings, useUpdateFollowupSettings } from '@/hooks/useFollowupTasks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Sparkles, Shield, Brain, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

const DEFAULT_PROMPTS: Record<string, string> = {
  prompt_qualification: "Tu qualifies un lead. Pose UNE seule question essentielle pour comprendre son contexte (problème, urgence ou décideur). Max 2 phrases. Direct, conversationnel.",
  prompt_objection: "Le lead a soulevé une objection. Reconnais-la brièvement, retourne-la en avantage, puis propose un mini-engagement (créneau court de 15 min ou démo). Max 2 phrases.",
  prompt_closing: "Le lead est qualifié et chaud. Propose IMMÉDIATEMENT 2 créneaux concrets cette semaine OU partage le lien de réservation. Aucune nouvelle question. Max 2 phrases.",
  prompt_reactivation: "Le lead est silencieux. Réveille la conversation avec une question ouverte, valeur, sans pression. Max 2 phrases. Pas de relance générique style 'tu es là ?'.",
  prompt_slot_confirmation: `Le lead vient de CONFIRMER un créneau de RDV que tu lui avais proposé. Confirme avec : 1) "Parfait, c'est noté pour [JOUR DATE HEURE]" 2) "Je t'envoie l'invitation sur [EMAIL]" 3) "Ressources à venir" 4) "On se retrouve [JOUR] 🙌". 4-5 phrases max.`,
};

const AI_MODELS = [
  { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash (rapide, défaut)' },
  { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (plus précis)' },
  { value: 'openai/gpt-5-mini', label: 'GPT-5 Mini' },
  { value: 'openai/gpt-5', label: 'GPT-5 (premium)' },
];

const MODES = [
  { key: 'prompt_qualification', label: 'Qualification', desc: 'Quand l\'IA pose des questions pour qualifier' },
  { key: 'prompt_objection', label: 'Objection', desc: 'Quand le lead exprime un frein' },
  { key: 'prompt_closing', label: 'Closing', desc: 'Quand le lead est chaud → proposer un RDV' },
  { key: 'prompt_reactivation', label: 'Réactivation', desc: 'Quand le lead est silencieux' },
  { key: 'prompt_slot_confirmation', label: 'Confirmation créneau', desc: 'Quand le lead accepte un créneau' },
];

export default function SettingsAiBehaviorPage() {
  const { data: settings, isLoading } = useFollowupSettings();
  const update = useUpdateFollowupSettings();
  const [form, setForm] = useState<any>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => { if (settings && !form) setForm(settings); }, [settings, form]);

  if (isLoading || !form) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  const set = (patch: Record<string, any>) => { setForm({ ...form, ...patch }); setDirty(true); };
  const save = () => {
    update.mutate({
      ai_instructions: form.ai_instructions,
      ai_examples: form.ai_examples,
      ai_model: form.ai_model,
      max_sentences: form.max_sentences,
      max_questions: form.max_questions,
      max_emojis: form.max_emojis,
      allow_repeated_greeting: form.allow_repeated_greeting,
      allow_signature: form.allow_signature,
      niche_strict: form.niche_strict,
      forbidden_words: form.forbidden_words,
      anti_repetition: form.anti_repetition,
      history_scan_count: form.history_scan_count,
      never_reask_fields: form.never_reask_fields,
      interest_threshold_closing: form.interest_threshold_closing,
      prompt_qualification: form.prompt_qualification,
      prompt_objection: form.prompt_objection,
      prompt_closing: form.prompt_closing,
      prompt_reactivation: form.prompt_reactivation,
      prompt_slot_confirmation: form.prompt_slot_confirmation,
      qualify_system_prompt: form.qualify_system_prompt,
      qualify_model: form.qualify_model,
      suggest_replies_system_prompt: form.suggest_replies_system_prompt,
      suggest_replies_model: form.suggest_replies_model,
      propose_meeting_dedup_minutes: form.propose_meeting_dedup_minutes,
      slot_confirmation_dedup_minutes: form.slot_confirmation_dedup_minutes,
      call_escalation_min_followups: form.call_escalation_min_followups,
      call_escalation_required_score: form.call_escalation_required_score,
    }, { onSuccess: () => setDirty(false) });
  };

  const toggleField = (field: string, value: string) => {
    const arr: string[] = form[field] || [];
    set({ [field]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] });
  };

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" /> Comportement IA</h2>
          <p className="text-sm text-muted-foreground mt-1">Personnalise ton, garde-fous et prompts contextuels de toutes les IA du CRM.</p>
        </div>
        {dirty && (
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Enregistrer
          </Button>
        )}
      </div>

      <Tabs defaultValue="personality">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="personality"><Brain className="w-4 h-4 mr-1.5" /> Personnalité</TabsTrigger>
          <TabsTrigger value="modes"><Sparkles className="w-4 h-4 mr-1.5" /> Modes</TabsTrigger>
          <TabsTrigger value="guardrails"><Shield className="w-4 h-4 mr-1.5" /> Garde-fous</TabsTrigger>
        </TabsList>

        {/* === PERSONNALITÉ === */}
        <TabsContent value="personality" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Brief global de l'IA</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Instructions / personnalité</Label>
                <Textarea rows={5} value={form.ai_instructions || ''} onChange={(e) => set({ ai_instructions: e.target.value })}
                  placeholder="Tu es un closer humain, direct, conversationnel..." />
                <p className="text-xs text-muted-foreground mt-1">Ces instructions sont utilisées pour TOUS les messages WhatsApp générés.</p>
              </div>
              <div>
                <Label>Exemples de style (few-shot)</Label>
                <Textarea rows={4} value={form.ai_examples || ''} onChange={(e) => set({ ai_examples: e.target.value })}
                  placeholder="Donne 1-2 exemples de messages que tu écrirais toi-même..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Modèle (génération messages)</Label>
                  <Select value={form.ai_model} onValueChange={(v) => set({ ai_model: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{AI_MODELS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Format des messages</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Phrases max</Label>
                  <Input type="number" min={1} max={6} value={form.max_sentences ?? 2} onChange={(e) => set({ max_sentences: parseInt(e.target.value) || 2 })} />
                </div>
                <div>
                  <Label>Questions max</Label>
                  <Input type="number" min={0} max={3} value={form.max_questions ?? 1} onChange={(e) => set({ max_questions: parseInt(e.target.value) || 1 })} />
                </div>
                <div>
                  <Label>Emojis max</Label>
                  <Input type="number" min={0} max={5} value={form.max_emojis ?? 1} onChange={(e) => set({ max_emojis: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label>Autoriser "Bonjour" répété</Label>
                <Switch checked={!!form.allow_repeated_greeting} onCheckedChange={(v) => set({ allow_repeated_greeting: v })} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Autoriser une signature</Label>
                <Switch checked={!!form.allow_signature} onCheckedChange={(v) => set({ allow_signature: v })} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === MODES CONTEXTUELS === */}
        <TabsContent value="modes" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Seuil de basculement en closing</CardTitle></CardHeader>
            <CardContent>
              <Label>Intérêt minimum pour passer en mode closing (0-100)</Label>
              <Input type="number" min={0} max={100} value={form.interest_threshold_closing ?? 70}
                onChange={(e) => set({ interest_threshold_closing: parseInt(e.target.value) || 70 })} />
              <p className="text-xs text-muted-foreground mt-1">Quand l'intérêt détecté du lead dépasse ce seuil, l'IA propose directement un RDV.</p>
            </CardContent>
          </Card>

          {MODES.map(m => (
            <Card key={m.key}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{m.label}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">{m.desc}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => set({ [m.key]: '' })} title="Restaurer le défaut">
                    <RotateCcw className="w-3 h-3" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Textarea rows={4} value={form[m.key] || ''} onChange={(e) => set({ [m.key]: e.target.value })}
                  placeholder={DEFAULT_PROMPTS[m.key]} />
                <p className="text-xs text-muted-foreground mt-1">Vide = utilise le prompt par défaut affiché en placeholder.</p>
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardHeader><CardTitle className="text-base">Prompts internes (avancé)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Prompt système — analyse de qualification</Label>
                <Textarea rows={5} value={form.qualify_system_prompt || ''} onChange={(e) => set({ qualify_system_prompt: e.target.value })}
                  placeholder="Vide = prompt par défaut (extraction BANT en JSON via tool calling)" />
              </div>
              <div>
                <Label>Modèle qualification</Label>
                <Select value={form.qualify_model || 'google/gemini-2.5-flash'} onValueChange={(v) => set({ qualify_model: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{AI_MODELS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prompt système — suggestions de réponse (inbox)</Label>
                <Textarea rows={5} value={form.suggest_replies_system_prompt || ''} onChange={(e) => set({ suggest_replies_system_prompt: e.target.value })}
                  placeholder="Vide = 3 angles : closing / qualification / rassure" />
              </div>
              <div>
                <Label>Modèle suggestions</Label>
                <Select value={form.suggest_replies_model || 'google/gemini-2.5-flash'} onValueChange={(v) => set({ suggest_replies_model: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{AI_MODELS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === GARDE-FOUS === */}
        <TabsContent value="guardrails" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Cohérence métier</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Niche stricte</Label>
                  <p className="text-xs text-muted-foreground">Force l'IA à rester dans le vocabulaire de l'offre</p>
                </div>
                <Switch checked={!!form.niche_strict} onCheckedChange={(v) => set({ niche_strict: v })} />
              </div>
              <div>
                <Label>Mots interdits (séparés par virgule)</Label>
                <Input value={(form.forbidden_words || []).join(', ')}
                  onChange={(e) => set({ forbidden_words: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                  placeholder="chantier, BTP, construction" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Anti-répétition</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Activer l'anti-répétition</Label>
                <Switch checked={!!form.anti_repetition} onCheckedChange={(v) => set({ anti_repetition: v })} />
              </div>
              <div>
                <Label>Nombre de messages à scanner</Label>
                <Input type="number" min={3} max={30} value={form.history_scan_count ?? 10}
                  onChange={(e) => set({ history_scan_count: parseInt(e.target.value) || 10 })} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Ne jamais redemander</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {['email', 'phone', 'name'].map(f => (
                <div key={f} className="flex items-center justify-between">
                  <Label className="capitalize">{f}</Label>
                  <Switch checked={(form.never_reask_fields || []).includes(f)} onCheckedChange={() => toggleField('never_reask_fields', f)} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Anti-doublon (création de tâches)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Fenêtre proposition de RDV (minutes)</Label>
                <Input type="number" min={1} max={60} value={form.propose_meeting_dedup_minutes ?? 10}
                  onChange={(e) => set({ propose_meeting_dedup_minutes: parseInt(e.target.value) || 10 })} />
              </div>
              <div>
                <Label>Fenêtre confirmation de créneau (minutes)</Label>
                <Input type="number" min={1} max={60} value={form.slot_confirmation_dedup_minutes ?? 5}
                  onChange={(e) => set({ slot_confirmation_dedup_minutes: parseInt(e.target.value) || 5 })} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Escalade vers appel manuel</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Nombre min de relances avant escalade</Label>
                <Input type="number" min={1} max={10} value={form.call_escalation_min_followups ?? 2}
                  onChange={(e) => set({ call_escalation_min_followups: parseInt(e.target.value) || 2 })} />
              </div>
              <div>
                <Label>Score requis pour escalade chaude</Label>
                <Select value={form.call_escalation_required_score || 'hot'} onValueChange={(v) => set({ call_escalation_required_score: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hot">Hot (chaud)</SelectItem>
                    <SelectItem value="warm">Warm (tiède)</SelectItem>
                    <SelectItem value="cold">Cold (froid)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {dirty && (
        <div className="fixed bottom-4 right-4 z-50">
          <Button size="lg" onClick={save} disabled={update.isPending} className="shadow-lg">
            {update.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Enregistrer les changements
          </Button>
        </div>
      )}
    </div>
  );
}
