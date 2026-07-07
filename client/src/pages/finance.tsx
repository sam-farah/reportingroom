import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, CalendarDays, TrendingUp, FileCheck2 } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  format,
  parseISO,
  isValid,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subDays,
  eachDayOfInterval,
} from "date-fns";
import { formatCents } from "@shared/mbs";

interface FinanceForm {
  id: number;
  status: "pending_signature" | "signed";
  totalValueCents: number;
  items: { item: string; description: string; feeCents: number }[];
  patientName: string | null;
  physicianName: string | null;
  dateOfService: string | null;
  signedAt: string | null;
  createdAt: string | null;
  /** Clinic-local YYYY-MM-DD the revenue belongs to — computed server-side in the clinic's timezone. */
  dateKey: string | null;
}

function sumCents(forms: FinanceForm[]): number {
  return forms.reduce((s, f) => s + (f.totalValueCents || 0), 0);
}

export default function Finance() {
  const todayKey = format(new Date(), "yyyy-MM-dd");
  const [fromDate, setFromDate] = useState<string>(format(subDays(new Date(), 29), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState<string>(todayKey);

  const { data: forms, isLoading, error } = useQuery<FinanceForm[]>({
    queryKey: ["/api/finance/aob-forms"],
    retry: false,
  });

  const withKeys = useMemo(
    () =>
      (forms ?? []).filter(
        (f): f is FinanceForm & { dateKey: string } =>
          !!f.dateKey && /^\d{4}-\d{2}-\d{2}$/.test(f.dateKey),
      ),
    [forms],
  );

  const now = new Date();
  const weekStartKey = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekEndKey = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const monthStartKey = format(startOfMonth(now), "yyyy-MM-dd");
  const monthEndKey = format(endOfMonth(now), "yyyy-MM-dd");

  const todayForms = withKeys.filter((f) => f.dateKey === todayKey);
  const weekForms = withKeys.filter((f) => f.dateKey >= weekStartKey && f.dateKey <= weekEndKey);
  const monthForms = withKeys.filter((f) => f.dateKey >= monthStartKey && f.dateKey <= monthEndKey);

  // Date-range filter (inclusive) for the chart and the list
  const rangeForms = useMemo(() => {
    const from = fromDate || "0000-01-01";
    const to = toDate || "9999-12-31";
    return withKeys
      .filter((f) => f.dateKey >= from && f.dateKey <= to)
      .sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
  }, [withKeys, fromDate, toDate]);

  const chartData = useMemo(() => {
    const from = parseISO(fromDate);
    const to = parseISO(toDate);
    if (!isValid(from) || !isValid(to) || from > to) return [];
    const byDay = new Map<string, number>();
    for (const f of rangeForms) {
      byDay.set(f.dateKey, (byDay.get(f.dateKey) ?? 0) + (f.totalValueCents || 0));
    }
    return eachDayOfInterval({ start: from, end: to }).map((d) => {
      const key = format(d, "yyyy-MM-dd");
      return {
        day: format(d, "d MMM"),
        dollars: Math.round((byDay.get(key) ?? 0)) / 100,
      };
    });
  }, [rangeForms, fromDate, toDate]);

  const setPreset = (preset: "7d" | "30d" | "month" | "all") => {
    if (preset === "7d") {
      setFromDate(format(subDays(new Date(), 6), "yyyy-MM-dd"));
      setToDate(todayKey);
    } else if (preset === "30d") {
      setFromDate(format(subDays(new Date(), 29), "yyyy-MM-dd"));
      setToDate(todayKey);
    } else if (preset === "month") {
      setFromDate(monthStartKey);
      setToDate(monthEndKey);
    } else {
      const keys = withKeys.map((f) => f.dateKey).sort();
      setFromDate(keys[0] ?? todayKey);
      setToDate(keys[keys.length - 1] ?? todayKey);
    }
  };

  if (error) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
          You don't have access to the finance dashboard.
        </p>
      </div>
    );
  }

  const summaryCards = [
    { label: "Today", forms: todayForms, icon: DollarSign, accent: "text-emerald-600 bg-emerald-50" },
    { label: "This Week", forms: weekForms, icon: CalendarDays, accent: "text-blue-600 bg-blue-50" },
    { label: "This Month", forms: monthForms, icon: TrendingUp, accent: "text-violet-600 bg-violet-50" },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl mx-auto">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Finance</h2>
        <p className="text-sm text-gray-500">
          Revenue recorded from Assignment of Benefits forms. Values are Medicare schedule amounts
          confirmed on each form — not submitted claims.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {summaryCards.map(({ label, forms: fs, icon: Icon, accent }) => {
          const signed = fs.filter((f) => f.status === "signed");
          return (
            <Card key={label}>
              <CardContent className="pt-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
                    {isLoading ? (
                      <Skeleton className="h-8 w-28 mt-1" />
                    ) : (
                      <p className="text-2xl font-bold text-gray-900 mt-0.5">{formatCents(sumCents(fs))}</p>
                    )}
                    {!isLoading && (
                      <p className="text-xs text-gray-500 mt-1">
                        {fs.length} form{fs.length === 1 ? "" : "s"} · {formatCents(sumCents(signed))} signed
                      </p>
                    )}
                  </div>
                  <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full ${accent}`}>
                    <Icon className="w-5 h-5" />
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Date range filter + chart */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <CardTitle className="text-base">Revenue by day</CardTitle>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label className="text-xs text-gray-500">From</Label>
                <Input
                  type="date"
                  value={fromDate}
                  max={toDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="h-8 text-sm w-40"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-500">To</Label>
                <Input
                  type="date"
                  value={toDate}
                  min={fromDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="h-8 text-sm w-40"
                />
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setPreset("7d")}>7 days</Button>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setPreset("30d")}>30 days</Button>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setPreset("month")}>This month</Button>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setPreset("all")}>All</Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : chartData.length === 0 ? (
            <p className="text-sm text-gray-500 py-10 text-center">No data in the selected range.</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${v}`} width={55} />
                  <Tooltip
                    formatter={(value: number) => [`$${value.toFixed(2)}`, "Revenue"]}
                    labelStyle={{ fontSize: 12 }}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Bar dataKey="dollars" fill="#0d9488" radius={[3, 3, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {!isLoading && rangeForms.length > 0 && (
            <p className="text-sm text-gray-600 mt-2 text-right font-medium">
              Range total: {formatCents(sumCents(rangeForms))} ({rangeForms.length} form{rangeForms.length === 1 ? "" : "s"})
            </p>
          )}
        </CardContent>
      </Card>

      {/* Form list for the selected range */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileCheck2 className="w-4 h-4 text-teal-600" />
            Forms in range
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : rangeForms.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">No forms in the selected range.</p>
          ) : (
            <div className="divide-y">
              {rangeForms.map((f) => (
                <div key={f.id} className="py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="text-sm text-gray-500 w-24 flex-shrink-0 font-mono">
                    {format(parseISO(f.dateKey), "d MMM yyyy")}
                  </span>
                  <span className="text-sm font-medium text-gray-900 flex-1 min-w-[140px] truncate">
                    {f.patientName || "Unknown patient"}
                  </span>
                  <span className="text-xs text-gray-500 hidden sm:block flex-shrink-0">
                    {(f.items ?? []).map((i) => i.item).filter(Boolean).join(", ")}
                  </span>
                  {f.status === "signed" ? (
                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[11px]">Signed</Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[11px]">Pending signature</Badge>
                  )}
                  <span className="text-sm font-semibold text-gray-900 w-20 text-right flex-shrink-0">
                    {formatCents(f.totalValueCents || 0)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
