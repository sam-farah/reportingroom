import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Clock } from "lucide-react";
import type { ScanDurationSetting } from "@shared/schema";
import { CANONICAL_SCAN_TYPES } from "@shared/schema";

type LocalSetting = {
  scanType: string;
  isEnabled: boolean;
  hasLaterality: boolean;
  unilateralDuration: number | null;
  bilateralDuration: number | null;
};

export default function ScanDurationsTab() {
  const { toast } = useToast();
  const [localSettings, setLocalSettings] = useState<LocalSetting[]>([]);

  const { data: settings, isLoading } = useQuery<ScanDurationSetting[]>({
    queryKey: ["/api/scan-durations"],
  });

  useEffect(() => {
    if (settings) {
      setLocalSettings(
        CANONICAL_SCAN_TYPES.map(ct => {
          const saved = settings.find(s => s.scanType === ct.name);
          return {
            scanType: ct.name,
            isEnabled: saved?.isEnabled ?? true,
            hasLaterality: saved?.hasLaterality ?? ct.hasLaterality,
            unilateralDuration: saved?.unilateralDuration ?? (ct.hasLaterality ? 30 : null),
            bilateralDuration: saved?.bilateralDuration ?? 45,
          };
        })
      );
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/scan-durations", "PUT", { settings: localSettings }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scan-durations"] });
      toast({ title: "Scan durations saved" });
    },
    onError: () => {
      toast({ title: "Failed to save", variant: "destructive" });
    },
  });

  const update = (scanType: string, patch: Partial<LocalSetting>) => {
    setLocalSettings(prev =>
      prev.map(s => s.scanType === scanType ? { ...s, ...patch } : s)
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600" />
                Scan Duration Defaults
              </CardTitle>
              <CardDescription className="mt-1">
                Set default booking durations for each scan type. These auto-fill when booking appointments.
                Uncheck "Bilateral" to use a single duration (e.g. Carotid is always bilateral).
              </CardDescription>
            </div>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="flex-shrink-0"
            >
              {saveMutation.isPending
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : <Save className="w-4 h-4 mr-2" />}
              Save Changes
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-semibold text-slate-600 w-[40%]">Scan Type</th>
                  <th className="text-center py-2 px-3 font-semibold text-slate-600">Enabled</th>
                  <th className="text-center py-2 px-3 font-semibold text-slate-600">
                    <span className="flex items-center gap-1 justify-center">
                      Has Uni/Bilateral
                    </span>
                  </th>
                  <th className="text-center py-2 px-3 font-semibold text-slate-600">
                    Unilateral (min)
                  </th>
                  <th className="text-center py-2 px-3 font-semibold text-slate-600">
                    Bilateral / Single (min)
                  </th>
                </tr>
              </thead>
              <tbody>
                {localSettings.map((s) => (
                  <tr
                    key={s.scanType}
                    className={`border-b last:border-0 transition-colors ${
                      s.isEnabled ? "bg-white hover:bg-slate-50" : "bg-slate-50 opacity-60"
                    }`}
                  >
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800">{s.scanType}</span>
                        {!s.isEnabled && (
                          <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-200">
                            disabled
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <div className="flex justify-center">
                        <Switch
                          checked={s.isEnabled}
                          onCheckedChange={(v) => update(s.scanType, { isEnabled: v })}
                        />
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <div className="flex justify-center">
                        <Checkbox
                          checked={s.hasLaterality}
                          onCheckedChange={(v) =>
                            update(s.scanType, {
                              hasLaterality: !!v,
                              unilateralDuration: v ? (s.unilateralDuration ?? 30) : null,
                            })
                          }
                        />
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center">
                      {s.hasLaterality ? (
                        <Input
                          type="number"
                          min={5}
                          max={300}
                          value={s.unilateralDuration ?? ""}
                          onChange={(e) =>
                            update(s.scanType, {
                              unilateralDuration: e.target.value ? parseInt(e.target.value) : null,
                            })
                          }
                          className="w-20 mx-auto text-center"
                          disabled={!s.isEnabled}
                        />
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <Input
                        type="number"
                        min={5}
                        max={300}
                        value={s.bilateralDuration ?? ""}
                        onChange={(e) =>
                          update(s.scanType, {
                            bilateralDuration: e.target.value ? parseInt(e.target.value) : null,
                          })
                        }
                        className="w-20 mx-auto text-center"
                        disabled={!s.isEnabled}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex justify-end">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : <Save className="w-4 h-4 mr-2" />}
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
