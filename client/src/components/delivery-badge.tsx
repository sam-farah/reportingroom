import { Mail, Send, Mailbox, ShieldCheck, AlertCircle } from "lucide-react";

const DELIVERY_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  secure_messaging: { label: "Secure Messaging", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: ShieldCheck },
  email:            { label: "Email",            color: "bg-blue-100 text-blue-700 border-blue-200",          icon: Mail },
  fax:              { label: "Fax",              color: "bg-purple-100 text-purple-700 border-purple-200",    icon: Send },
  post:             { label: "Post",             color: "bg-amber-100 text-amber-700 border-amber-200",       icon: Mailbox },
  other:            { label: "Other",            color: "bg-slate-100 text-slate-700 border-slate-200",       icon: AlertCircle },
};

export function DeliveryBadge({ method, note }: { method?: string | null; note?: string | null }) {
  if (!method) return null;
  const cfg = DELIVERY_CONFIG[method] ?? DELIVERY_CONFIG.other;
  const Icon = cfg.icon;
  const label = method === "other" && note ? note : cfg.label;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-medium ${cfg.color}`} title={`Preferred report delivery: ${label}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}
