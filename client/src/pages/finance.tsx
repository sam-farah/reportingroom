import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DollarSign, CalendarDays, TrendingUp, FileCheck2, Trash2, Loader2, Filter, Plus, Wallet, BarChart3, LineChart as LineChartIcon, Receipt } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  ComposedChart,
  Area,
  Line,
  Legend,
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
  eachMonthOfInterval,
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

interface RecurringExpense {
  id: number;
  label: string;
  amountCents: number;
  category: string | null;
  startMonth: string; // YYYY-MM
  endMonth: string | null; // YYYY-MM or null (ongoing)
  active: boolean;
  createdAt: string | null;
}

function sumCents(forms: FinanceForm[]): number {
  return forms.reduce((s, f) => s + (f.totalValueCents || 0), 0);
}

// Format a YYYY-MM key as "MMM yyyy" defensively; returns the raw key if malformed.
function formatMonthKey(monthKey: string | null): string {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return monthKey ?? "";
  const d = parseISO(`${monthKey}-01`);
  return isValid(d) ? format(d, "MMM yyyy") : monthKey;
}

// Total monthly recurring expense (cents) that applies to a given YYYY-MM.
function monthlyExpenseCents(expenses: RecurringExpense[], monthKey: string): number {
  return expenses.reduce((sum, e) => {
    if (!e.active) return sum;
    if (e.startMonth > monthKey) return sum;
    if (e.endMonth && e.endMonth < monthKey) return sum;
    return sum + (e.amountCents || 0);
  }, 0);
}

export default function Finance() {
  const { toast } = useToast();
  const todayKey = format(new Date(), "yyyy-MM-dd");
  const [fromDate, setFromDate] = useState<string>(format(subDays(new Date(), 29), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState<string>(todayKey);
  const [pendingDelete, setPendingDelete] = useState<FinanceForm | null>(null);
  const [chartMode, setChartMode] = useState<"daily" | "monthly">("daily");
  const thisMonthKey = format(new Date(), "yyyy-MM");
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    label: "",
    amount: "",
    category: "",
    startMonth: thisMonthKey,
    endMonth: "",
  });
  const [pendingExpenseDelete, setPendingExpenseDelete] = useState<RecurringExpense | null>(null);

  const { data: forms, isLoading, error } = useQuery<FinanceForm[]>({
    queryKey: ["/api/finance/aob-forms"],
    retry: false,
  });

  const { data: expenses } = useQuery<RecurringExpense[]>({
    queryKey: ["/api/finance/expenses"],
    retry: false,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(`/api/finance/aob-forms/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/aob-forms"] });
      toast({ title: "Entry deleted", description: "The form has been removed from finance." });
      setPendingDelete(null);
    },
    onError: () => {
      toast({
        title: "Could not delete",
        description: "Something went wrong removing this entry. Please try again.",
        variant: "destructive",
      });
    },
  });

  const createExpenseMutation = useMutation({
    mutationFn: async (payload: {
      label: string;
      amountCents: number;
      category: string | null;
      startMonth: string;
      endMonth: string | null;
    }) => {
      await apiRequest("/api/finance/expenses", "POST", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/expenses"] });
      toast({ title: "Expense added", description: "The recurring expense has been saved." });
      setExpenseDialogOpen(false);
      setExpenseForm({ label: "", amount: "", category: "", startMonth: thisMonthKey, endMonth: "" });
    },
    onError: () => {
      toast({
        title: "Could not add expense",
        description: "Please check the fields and try again.",
        variant: "destructive",
      });
    },
  });

  const toggleExpenseMutation = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) => {
      await apiRequest(`/api/finance/expenses/${id}`, "PATCH", { active });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/expenses"] });
    },
    onError: () => {
      toast({ title: "Could not update expense", variant: "destructive" });
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(`/api/finance/expenses/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/expenses"] });
      toast({ title: "Expense deleted" });
      setPendingExpenseDelete(null);
    },
    onError: () => {
      toast({ title: "Could not delete expense", variant: "destructive" });
    },
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

  // Date-range filter (inclusive) for the summary card, chart, and list.
  // Uses the same validity guard as the chart so an invalid/reversed/blank
  // range yields an empty result everywhere (no desync).
  const rangeForms = useMemo(() => {
    const from = parseISO(fromDate);
    const to = parseISO(toDate);
    if (!isValid(from) || !isValid(to) || from > to) return [];
    return withKeys
      .filter((f) => f.dateKey >= fromDate && f.dateKey <= toDate)
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

  // Monthly "stock chart" series: revenue, recurring expenses and net profit
  // per month across the selected range.
  const monthlyChartData = useMemo(() => {
    const from = parseISO(fromDate);
    const to = parseISO(toDate);
    if (!isValid(from) || !isValid(to) || from > to) return [];
    const revenueByMonth = new Map<string, number>();
    for (const f of rangeForms) {
      const mk = f.dateKey.slice(0, 7);
      revenueByMonth.set(mk, (revenueByMonth.get(mk) ?? 0) + (f.totalValueCents || 0));
    }
    return eachMonthOfInterval({ start: startOfMonth(from), end: startOfMonth(to) }).map((d) => {
      const mk = format(d, "yyyy-MM");
      const revenue = revenueByMonth.get(mk) ?? 0;
      const expenseCents = monthlyExpenseCents(expenses ?? [], mk);
      return {
        month: format(d, "MMM yyyy"),
        revenue: Math.round(revenue) / 100,
        expenses: Math.round(expenseCents) / 100,
        net: Math.round(revenue - expenseCents) / 100,
      };
    });
  }, [rangeForms, expenses, fromDate, toDate]);

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

  const rangeLabel = (() => {
    const from = parseISO(fromDate);
    const to = parseISO(toDate);
    if (!isValid(from) || !isValid(to)) return "";
    return `${format(from, "d MMM")} – ${format(to, "d MMM yyyy")}`;
  })();

  const summaryCards = [
    { label: "Today", forms: todayForms, icon: DollarSign, accent: "text-emerald-600 bg-emerald-50" },
    { label: "This Week", forms: weekForms, icon: CalendarDays, accent: "text-blue-600 bg-blue-50" },
    { label: "This Month", forms: monthForms, icon: TrendingUp, accent: "text-violet-600 bg-violet-50" },
    { label: "Selected Range", forms: rangeForms, icon: Filter, accent: "text-teal-600 bg-teal-50", sub: rangeLabel },
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map(({ label, forms: fs, icon: Icon, accent, sub }) => {
          const signed = fs.filter((f) => f.status === "signed");
          return (
            <Card key={label} className={sub ? "border-teal-200 bg-teal-50/30" : undefined}>
              <CardContent className="pt-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
                    {isLoading ? (
                      <Skeleton className="h-8 w-28 mt-1" />
                    ) : (
                      <p className="text-2xl font-bold text-gray-900 mt-0.5">{formatCents(sumCents(fs))}</p>
                    )}
                    {!isLoading && sub && (
                      <p className="text-[11px] text-teal-700 font-medium mt-1">{sub}</p>
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
            <div className="flex items-center gap-3">
              <CardTitle className="text-base">
                {chartMode === "daily" ? "Revenue by day" : "Monthly performance"}
              </CardTitle>
              <div className="inline-flex rounded-md border border-gray-200 p-0.5 bg-gray-50">
                <button
                  type="button"
                  onClick={() => setChartMode("daily")}
                  className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded ${
                    chartMode === "daily" ? "bg-white shadow-sm text-teal-700 font-medium" : "text-gray-500"
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" /> Bars
                </button>
                <button
                  type="button"
                  onClick={() => setChartMode("monthly")}
                  className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded ${
                    chartMode === "monthly" ? "bg-white shadow-sm text-teal-700 font-medium" : "text-gray-500"
                  }`}
                >
                  <LineChartIcon className="w-3.5 h-3.5" /> Graph
                </button>
              </div>
            </div>
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
          ) : chartMode === "daily" ? (
            chartData.length === 0 ? (
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
            )
          ) : monthlyChartData.length === 0 ? (
            <p className="text-sm text-gray-500 py-10 text-center">No data in the selected range.</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0d9488" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${v}`} width={55} />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      `$${Number(value).toFixed(2)}`,
                      name.charAt(0).toUpperCase() + name.slice(1),
                    ]}
                    labelStyle={{ fontSize: 12 }}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#0d9488"
                    strokeWidth={2}
                    fill="url(#revFill)"
                    name="Revenue"
                  />
                  <Line
                    type="monotone"
                    dataKey="expenses"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={false}
                    name="Expenses"
                  />
                  <Line
                    type="monotone"
                    dataKey="net"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={false}
                    name="Net"
                  />
                </ComposedChart>
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

      {/* Recurring monthly expenses */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="w-4 h-4 text-rose-500" />
                Recurring monthly expenses
              </CardTitle>
              <p className="text-xs text-gray-500 mt-1">
                Currently {formatCents(monthlyExpenseCents(expenses ?? [], thisMonthKey))} / month
              </p>
            </div>
            <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-8 text-xs">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add expense
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add recurring expense</DialogTitle>
                  <DialogDescription>
                    Enter a monthly cost. It will be counted every month from the start month until the
                    end month (leave end month blank for ongoing).
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-gray-500">Label</Label>
                    <Input
                      placeholder="e.g. Rent, Sonographer wages"
                      value={expenseForm.label}
                      onChange={(e) => setExpenseForm((s) => ({ ...s, label: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-gray-500">Amount ($ / month)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={expenseForm.amount}
                        onChange={(e) => setExpenseForm((s) => ({ ...s, amount: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Category (optional)</Label>
                      <Input
                        placeholder="e.g. Payroll"
                        value={expenseForm.category}
                        onChange={(e) => setExpenseForm((s) => ({ ...s, category: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-gray-500">Start month</Label>
                      <Input
                        type="month"
                        value={expenseForm.startMonth}
                        onChange={(e) => setExpenseForm((s) => ({ ...s, startMonth: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">End month (optional)</Label>
                      <Input
                        type="month"
                        value={expenseForm.endMonth}
                        min={expenseForm.startMonth}
                        onChange={(e) => setExpenseForm((s) => ({ ...s, endMonth: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setExpenseDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    disabled={
                      createExpenseMutation.isPending ||
                      !expenseForm.label.trim() ||
                      !(Number(expenseForm.amount) > 0) ||
                      !/^\d{4}-\d{2}$/.test(expenseForm.startMonth)
                    }
                    onClick={() =>
                      createExpenseMutation.mutate({
                        label: expenseForm.label.trim(),
                        amountCents: Math.round(Number(expenseForm.amount) * 100),
                        category: expenseForm.category.trim() || null,
                        startMonth: expenseForm.startMonth,
                        endMonth: /^\d{4}-\d{2}$/.test(expenseForm.endMonth) ? expenseForm.endMonth : null,
                      })
                    }
                  >
                    {createExpenseMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                    Save expense
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {!expenses || expenses.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              No recurring expenses yet. Add rent, wages, subscriptions and more to track net profit.
            </p>
          ) : (
            <div className="divide-y">
              {expenses.map((e) => (
                <div key={e.id} className="flex items-center justify-between py-2.5 gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className={`font-medium truncate ${e.active ? "text-gray-900" : "text-gray-400 line-through"}`}>
                        {e.label}
                      </span>
                      {e.category && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{e.category}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 pl-6">
                      {formatMonthKey(e.startMonth)}
                      {" – "}
                      {e.endMonth ? formatMonthKey(e.endMonth) : "ongoing"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-semibold text-gray-900">{formatCents(e.amountCents)}/mo</span>
                    <Switch
                      checked={e.active}
                      onCheckedChange={(active) => toggleExpenseMutation.mutate({ id: e.id, active })}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-gray-400 hover:text-red-600"
                      onClick={() => setPendingExpenseDelete(e)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
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
                <div key={f.id} className="py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1" data-testid={`row-finance-form-${f.id}`}>
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
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 flex-shrink-0 text-gray-400 hover:text-red-600 hover:bg-red-50"
                    onClick={() => setPendingDelete(f)}
                    title="Delete entry"
                    data-testid={`button-delete-form-${f.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the Assignment of Benefits form for{" "}
              <span className="font-medium text-gray-900">
                {pendingDelete?.patientName || "Unknown patient"}
              </span>{" "}
              ({formatCents(pendingDelete?.totalValueCents || 0)}) from finance. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (pendingDelete) deleteMutation.mutate(pendingDelete.id);
              }}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!pendingExpenseDelete}
        onOpenChange={(open) => !open && setPendingExpenseDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes{" "}
              <span className="font-medium text-gray-900">
                {pendingExpenseDelete?.label}
              </span>{" "}
              ({formatCents(pendingExpenseDelete?.amountCents || 0)}/mo) and it will no longer be
              counted against revenue. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteExpenseMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (pendingExpenseDelete) deleteExpenseMutation.mutate(pendingExpenseDelete.id);
              }}
              disabled={deleteExpenseMutation.isPending}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {deleteExpenseMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
