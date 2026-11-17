import { useSalesReps, useAssignLead, repLabel } from '@/hooks/useSalesReps';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserCheck } from 'lucide-react';
import { toast } from 'sonner';

export function LeadAssigneeSelect({ leadId, workspaceId, assignedTo }: { leadId: string; workspaceId?: string | null; assignedTo?: string | null }) {
  const { data: reps = [] } = useSalesReps(workspaceId);
  const assign = useAssignLead();
  if (!workspaceId || reps.length < 2) return null;
  return (
    <div className="flex items-center gap-2">
      <UserCheck className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="text-sm text-muted-foreground shrink-0">Commercial</span>
      <Select
        value={assignedTo || 'none'}
        onValueChange={(v) => assign.mutate({ leadId, userId: v === 'none' ? null : v }, {
          onSuccess: () => toast.success('Commercial mis à jour'),
          onError: (e: any) => toast.error(e.message),
        })}
      >
        <SelectTrigger className="h-11 flex-1"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Personne</SelectItem>
          {reps.map(r => <SelectItem key={r.user_id} value={r.user_id}>{repLabel(r.email)}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
