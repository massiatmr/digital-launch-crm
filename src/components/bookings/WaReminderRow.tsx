import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Settings2 } from "lucide-react";
import type { BookingEmailType } from "@/hooks/useBookingEmailTemplates";
import type { WorkspaceBookingWaTemplate } from "@/hooks/useBookingWaTemplates";

interface WaTpl { id: string; name: string; language: string; variables_count: number; category: string }

interface Props {
  type: BookingEmailType;
  label: string;
  description: string;
  config: WorkspaceBookingWaTemplate | undefined;
  templates: WaTpl[];
  onChange: (patch: Partial<WorkspaceBookingWaTemplate> & { type: BookingEmailType }) => void;
  disabled?: boolean;
}

const PLACEHOLDERS = [
  { value: "{{name}}", label: "Nom du lead" },
  { value: "{{date}}", label: "Date du RDV" },
  { value: "{{time}}", label: "Heure du RDV" },
  { value: "{{offer_name}}", label: "Nom de l'offre" },
  { value: "{{meet_url}}", label: "Lien Meet" },
];

export function WaReminderRow({ type, label, description, config, templates, onChange, disabled }: Props) {
  const enabled = !!config?.enabled;
  const templateId = config?.template_id || "";
  const tpl = templates.find((t) => t.id === templateId);
  const varsCount = tpl?.variables_count ?? 0;

  const [varsMap, setVarsMap] = useState<Record<string, string>>(config?.variables_map || {});
  useEffect(() => { setVarsMap(config?.variables_map || {}); }, [config?.variables_map]);

  return (
    <div className="flex items-start justify-between gap-3 flex-wrap py-2 border-b border-white/5 last:border-b-0">
      <div className="min-w-[140px]">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center gap-2 flex-1 min-w-[260px] justify-end flex-wrap">
        <Select
          value={templateId || "none"}
          onValueChange={(v) =>
            onChange({ type, template_id: v === "none" ? null : v, enabled, language: tpl?.language || "fr", variables_map: varsMap })
          }
          disabled={disabled}
        >
          <SelectTrigger className="w-[220px] h-9">
            <SelectValue placeholder="Choisir un template…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— Aucun —</SelectItem>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name} <span className="text-xs text-muted-foreground ml-1">({t.language})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button size="icon" variant="outline" className="h-9 w-9" disabled={!tpl || disabled} title="Variables">
              <Settings2 className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 space-y-3">
            <div>
              <p className="text-sm font-medium">Variables du template</p>
              <p className="text-xs text-muted-foreground">
                {varsCount > 0
                  ? `Mappe chaque variable {{1}}…{{${varsCount}}} sur une donnée du RDV.`
                  : "Ce template n'a pas de variables."}
              </p>
            </div>
            {Array.from({ length: varsCount }, (_, i) => {
              const k = String(i + 1);
              const val = varsMap[k] || "";
              return (
                <div key={k} className="space-y-1">
                  <label className="text-xs text-muted-foreground">Variable {`{{${k}}}`}</label>
                  <div className="flex gap-1">
                    <Select
                      value={PLACEHOLDERS.find((p) => p.value === val)?.value || "custom"}
                      onValueChange={(v) => {
                        const next = { ...varsMap, [k]: v === "custom" ? val : v };
                        setVarsMap(next);
                      }}
                    >
                      <SelectTrigger className="h-8 flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PLACEHOLDERS.map((p) => (
                          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                        ))}
                        <SelectItem value="custom">Texte fixe…</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {!PLACEHOLDERS.find((p) => p.value === val) && (
                    <Input
                      className="h-8"
                      placeholder="Texte fixe"
                      value={val}
                      onChange={(e) => setVarsMap({ ...varsMap, [k]: e.target.value })}
                    />
                  )}
                </div>
              );
            })}
            <Button
              size="sm"
              className="w-full"
              onClick={() => onChange({ type, template_id: templateId || null, enabled, language: tpl?.language || "fr", variables_map: varsMap })}
            >
              Enregistrer les variables
            </Button>
          </PopoverContent>
        </Popover>

        <Switch
          checked={enabled}
          onCheckedChange={(v) =>
            onChange({ type, enabled: v, template_id: templateId || null, language: tpl?.language || "fr", variables_map: varsMap })
          }
          disabled={disabled || !templateId}
        />
      </div>
    </div>
  );
}
