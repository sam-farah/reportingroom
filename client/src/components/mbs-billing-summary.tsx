import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Receipt } from "lucide-react";
import { calculateVisitBilling, formatCents } from "@shared/mbs";

export default function MbsBillingSummary({
  scanTypes,
  otherSameDayAppointmentCount,
}: {
  scanTypes: string[];
  otherSameDayAppointmentCount?: number;
}) {
  const result = useMemo(
    () => calculateVisitBilling(scanTypes, { otherSameDayAppointmentCount }),
    [scanTypes, otherSameDayAppointmentCount]
  );

  if (scanTypes.length === 0) return null;

  return (
    <Card className="border-blue-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Receipt className="w-4 h-4 text-blue-600" />
          Suggested MBS Billing
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {result.lines.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="text-left py-1 pr-2 font-medium">Item</th>
                  <th className="text-left py-1 px-2 font-medium">Schedule Fee</th>
                  <th className="text-left py-1 px-2 font-medium">Rule</th>
                  <th className="text-right py-1 pl-2 font-medium">Allocated</th>
                </tr>
              </thead>
              <tbody>
                {result.lines.map((l, i) => (
                  <tr key={`${l.item}-${i}`} className="border-b last:border-0">
                    <td className="py-1.5 pr-2 font-mono font-medium">{l.item}</td>
                    <td className="py-1.5 px-2 text-slate-500">{formatCents(l.scheduleFeeCents)}</td>
                    <td className="py-1.5 px-2 text-slate-500">{l.ruleApplied}</td>
                    <td className="py-1.5 pl-2 text-right font-medium">{formatCents(l.allocatedFeeCents)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-semibold">
                  <td className="py-1.5 pr-2" colSpan={3}>Estimated total rebate</td>
                  <td className="py-1.5 pl-2 text-right">{formatCents(result.totalAllocatedFeeCents)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {result.unmappedScanTypes.length > 0 && (
          <div className="text-xs text-slate-500">
            No suggestion for: {result.unmappedScanTypes.join(", ")}
          </div>
        )}

        <div className="space-y-1">
          {result.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[11px] text-amber-700">
              <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function MbsItemBadges({ scanType }: { scanType: string }) {
  const result = useMemo(
    () => calculateVisitBilling(scanType.split(",").map(s => s.trim()).filter(Boolean)),
    [scanType]
  );
  if (result.lines.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {result.lines.map((l, i) => (
        <Badge key={`${l.item}-${i}`} variant="outline" className="text-[10px] font-mono px-1.5 py-0 h-4 text-blue-700 border-blue-200 bg-blue-50">
          {l.item}
        </Badge>
      ))}
    </span>
  );
}
