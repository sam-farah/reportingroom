import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Receipt } from "lucide-react";
import { CANONICAL_SCAN_TYPES } from "@shared/schema";
import { SCAN_TYPE_MBS, MBS_ITEMS, MBS_REFERENCE_ONLY_ITEMS, formatCents, type MbsClaimLine } from "@shared/mbs";

function formatLines(lines: MbsClaimLine[] | undefined): string {
  if (!lines || lines.length === 0) return "—";
  return lines.map(l => (l.qty === 2 ? `${l.item} x2 (R & L)` : l.item)).join(" + ");
}

export default function MbsReferenceTab() {
  return (
    <div className="space-y-6">
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="pt-4 flex gap-3 items-start">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 space-y-1">
            <p className="font-medium">Reference only — not a claiming system</p>
            <p>Item numbers and fees are sourced from MBS Online and are current as at 1 Jul 2026. Fees are indexed periodically (usually each 1 July) — always confirm on MBS Online before billing. Rules B and C (same-day consultation interactions) are not modelled anywhere in this app.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-blue-600" />
            Scan Type → MBS Item Numbers
          </CardTitle>
          <CardDescription>
            Suggested item composition per scan type. Items marked "unverified" could not be confirmed on MBS Online and must be checked manually.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-semibold text-slate-600">Scan Type</th>
                  <th className="text-left py-2 px-3 font-semibold text-slate-600">Unilateral</th>
                  <th className="text-left py-2 px-3 font-semibold text-slate-600">Bilateral / Single</th>
                  <th className="text-left py-2 px-3 font-semibold text-slate-600">Notes</th>
                </tr>
              </thead>
              <tbody>
                {CANONICAL_SCAN_TYPES.map(ct => {
                  const mapping = SCAN_TYPE_MBS[ct.name];
                  if (!mapping) {
                    return (
                      <tr key={ct.name} className="border-b last:border-0">
                        <td className="py-3 pr-4 font-medium text-slate-800">{ct.name}</td>
                        <td className="py-3 px-3 text-slate-300" colSpan={2}>Not mapped</td>
                        <td className="py-3 px-3 text-slate-400 text-xs">—</td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={ct.name} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="py-3 pr-4 font-medium text-slate-800">{ct.name}</td>
                      <td className="py-3 px-3">
                        {ct.hasLaterality ? formatLines(mapping.unilateral) : <span className="text-slate-300">n/a</span>}
                      </td>
                      <td className="py-3 px-3">{formatLines(mapping.bilateral)}</td>
                      <td className="py-3 px-3 text-xs">
                        {!mapping.suggestable && (
                          <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 mr-1">
                            manual selection required
                          </Badge>
                        )}
                        {mapping.note && <span className="text-slate-500">{mapping.note}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>MBS Item Fees</CardTitle>
          <CardDescription>Schedule fee and rule category for every item used above, plus items billed separately from a scan type.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-semibold text-slate-600">Item</th>
                  <th className="text-left py-2 px-3 font-semibold text-slate-600">Description</th>
                  <th className="text-left py-2 px-3 font-semibold text-slate-600">Fee</th>
                  <th className="text-left py-2 px-3 font-semibold text-slate-600">Category</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(MBS_ITEMS).map(([item, info]) => (
                  <tr key={item} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="py-3 pr-4 font-mono font-medium text-slate-800">
                      {item}
                      {!info.verified && (
                        <Badge variant="outline" className="ml-2 text-red-600 border-red-300 bg-red-50 text-[10px]">
                          unverified
                        </Badge>
                      )}
                      {MBS_REFERENCE_ONLY_ITEMS.includes(item) && (
                        <Badge variant="outline" className="ml-2 text-slate-500 border-slate-300 text-[10px]">
                          not scan-type linked
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-600">{info.description}</td>
                    <td className="py-3 px-3 font-medium">{formatCents(info.scheduleFeeCents)}</td>
                    <td className="py-3 px-3">
                      <Badge variant="outline" className="text-xs">
                        {info.category === "DI_VASCULAR" ? "Vascular ultrasound (MPR applies)" : info.category === "DI_GENERAL" ? "General DI (Rule A applies)" : "Category 2 (no DI rules)"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
