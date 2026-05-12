import { MessageCircle, Facebook, Instagram } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConversationChannel } from '@/hooks/useWhatsAppInbox';

const META: Record<ConversationChannel, { label: string; Icon: typeof MessageCircle; cls: string }> = {
  whatsapp: { label: 'WhatsApp', Icon: MessageCircle, cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  messenger: { label: 'Messenger', Icon: Facebook, cls: 'text-sky-400 bg-sky-500/10 border-sky-500/30' },
  instagram: { label: 'Instagram', Icon: Instagram, cls: 'text-pink-400 bg-pink-500/10 border-pink-500/30' },
};

export function ChannelBadge({ channel, compact = false, className }: { channel: ConversationChannel; compact?: boolean; className?: string }) {
  const m = META[channel] ?? META.whatsapp;
  const Icon = m.Icon;
  if (compact) {
    return (
      <span title={m.label} className={cn('inline-flex items-center justify-center h-4 w-4 rounded border', m.cls, className)}>
        <Icon className="h-2.5 w-2.5" />
      </span>
    );
  }
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]', m.cls, className)}>
      <Icon className="h-3 w-3" /> {m.label}
    </span>
  );
}

export function channelLabel(c: ConversationChannel) {
  return META[c]?.label ?? c;
}
