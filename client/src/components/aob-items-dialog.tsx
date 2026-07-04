import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Plus, X, ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { calculateVisitBilling, formatCents, MBS_ITEMS } from "@shared/mbs";

export interface AobLineItem {
  item: string;
  description: string;
  feeCents: number;
}

interface AobItemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Scan type strings used to prefill the suggested items when the dialog opens. */
  scanTypes: string[];
  title?: string;
  description?: string;
  submitLabel?: string;
  submittingLabel?: string;
  isPending?: boolean;
  onSubmit: (items: AobLineItem[]) => void;
}

/**
 * Shared Assessment of Benefits item-confirmation dialog. Prefills the suggested
 * Medicare items from the given scan type(s) and lets staff edit them line-by-line
 * (pick from the MBS list or enter manually, edit description/fee, add/remove rows)
 * before confirming. Used both when marking a study "Sono Complete" (Reporting Room)
 * and when generating a form on-demand from the calendar appointment screen.
 */
export function AobItemsDialog({
  open,
  onOpenChange,
  scanTypes,
  title = "Confirm Assessment of Benefits",
  description = "Confirm the Medicare items billed for this visit. Suggested items only — check they are clinically correct before continuing. This is not a submitted claim.",
  submitLabel = "Confirm",
  submittingLabel = "Saving…",
  isPending = false,
  onSubmit,
}: AobItemsDialogProps) {
  const [items, setItems] = useState<AobLineItem[]>([]);
  const [manualEntry, setManualEntry] = useState<boolean[]>([]);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);

  // Sorted once — the reference list rarely changes and is small (~15 items).
  const mbsItemOptions = useMemo(
    () =>
      Object.entries(MBS_ITEMS).sort(([a], [b]) =>
        a.localeCompare(b, undefined, { numeric: true }),
      ),
    [],
  );

  // Prefill from the scan type(s) each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    const clean = scanTypes.map((s) => s.trim()).filter(Boolean);
    const result = calculateVisitBilling(clean);
    const lines = result.lines.map((l) => ({
      item: l.item,
      description: l.description,
      feeCents: l.allocatedFeeCents,
    }));
    setItems(lines);
    // Suggested items always come from the same MBS reference data, but fall
    // back to manual-entry mode defensively if one somehow isn't in the list.
    setManualEntry(lines.map((l) => !MBS_ITEMS[l.item]));
    setPickerIndex(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const validItems = items.filter((l) => l.item.trim() || l.description.trim());
  const total = items.reduce((sum, l) => sum + (l.feeCents || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {items.length === 0 && (
            <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
              No item numbers could be suggested for this study type. Add at least
              one item manually to continue.
            </p>
          )}
          {items.map((line, i) => (
            <div key={i} className="flex items-start gap-2 border rounded-md p-2">
              <div className="w-48 flex-shrink-0">
                <Label className="text-xs text-gray-500">Item</Label>
                {manualEntry[i] ? (
                  <div className="flex items-center gap-1">
                    <Input
                      value={line.item}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((l, idx) =>
                            idx === i ? { ...l, item: e.target.value } : l,
                          ),
                        )
                      }
                      placeholder="Item #"
                      className="h-8 text-sm font-mono"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-1.5 text-xs text-gray-400 hover:text-gray-700 flex-shrink-0"
                      title="Choose from list instead"
                      onClick={() =>
                        setManualEntry((prev) =>
                          prev.map((m, idx) => (idx === i ? false : m)),
                        )
                      }
                    >
                      List
                    </Button>
                  </div>
                ) : (
                  <Popover
                    open={pickerIndex === i}
                    onOpenChange={(o) => setPickerIndex(o ? i : null)}
                    modal
                  >
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={pickerIndex === i}
                        className="h-8 w-full justify-between px-2 text-sm font-mono font-normal"
                      >
                        <span className="truncate">
                          {line.item || "Select item"}
                        </span>
                        <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-96 p-0" align="start">
                      <Command
                        filter={(value, search) =>
                          value.toLowerCase().includes(search.toLowerCase())
                            ? 1
                            : 0
                        }
                      >
                        <CommandInput
                          placeholder="Search item number or description..."
                          className="text-sm"
                        />
                        <CommandList>
                          <CommandEmpty>No matching item.</CommandEmpty>
                          <CommandGroup>
                            {mbsItemOptions.map(([num, info]) => (
                              <CommandItem
                                key={num}
                                value={`${num} ${info.description}`}
                                onSelect={() => {
                                  setItems((prev) =>
                                    prev.map((l, idx) =>
                                      idx === i
                                        ? {
                                            ...l,
                                            item: num,
                                            description: info.description,
                                            feeCents: info.scheduleFeeCents,
                                          }
                                        : l,
                                    ),
                                  );
                                  setPickerIndex(null);
                                }}
                                className="items-start gap-2"
                              >
                                <Check
                                  className={cn(
                                    "mt-0.5 h-4 w-4 shrink-0",
                                    line.item === num
                                      ? "opacity-100"
                                      : "opacity-0",
                                  )}
                                />
                                <div className="flex flex-col">
                                  <span className="font-mono text-sm">
                                    {num} — {formatCents(info.scheduleFeeCents)}
                                    {!info.verified ? " (unverified)" : ""}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    {info.description}
                                  </span>
                                </div>
                              </CommandItem>
                            ))}
                            <CommandItem
                              value="other manual entry not listed"
                              onSelect={() => {
                                setManualEntry((prev) =>
                                  prev.map((m, idx) => (idx === i ? true : m)),
                                );
                                setItems((prev) =>
                                  prev.map((l, idx) =>
                                    idx === i ? { ...l, item: "" } : l,
                                  ),
                                );
                                setPickerIndex(null);
                              }}
                            >
                              <span className="text-gray-500">
                                Other / manual entry…
                              </span>
                            </CommandItem>
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
              <div className="flex-1">
                <Label className="text-xs text-gray-500">Description</Label>
                <Input
                  value={line.description}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((l, idx) =>
                        idx === i ? { ...l, description: e.target.value } : l,
                      ),
                    )
                  }
                  className="h-8 text-sm"
                />
              </div>
              <div className="w-28 flex-shrink-0">
                <Label className="text-xs text-gray-500">Fee ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={(line.feeCents / 100).toFixed(2)}
                  onChange={(e) => {
                    const dollars = parseFloat(e.target.value);
                    setItems((prev) =>
                      prev.map((l, idx) =>
                        idx === i
                          ? {
                              ...l,
                              feeCents: isNaN(dollars)
                                ? 0
                                : Math.round(dollars * 100),
                            }
                          : l,
                      ),
                    );
                  }}
                  className="h-8 text-sm"
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-5 text-gray-400 hover:text-red-600"
                onClick={() => {
                  setItems((prev) => prev.filter((_, idx) => idx !== i));
                  setManualEntry((prev) => prev.filter((_, idx) => idx !== i));
                  setPickerIndex(null);
                }}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setItems((prev) => [
                ...prev,
                { item: "", description: "", feeCents: 0 },
              ]);
              setManualEntry((prev) => [...prev, false]);
            }}
          >
            <Plus className="w-3 h-3 mr-1" /> Add item
          </Button>
          <div className="flex items-center justify-between border-t pt-2 text-sm font-medium">
            <span>Total value</span>
            <span>{formatCents(total)}</span>
          </div>
          <p className="text-[11px] text-gray-400">
            Suggested items only — confirm clinically correct before continuing.
            This is not a submitted claim.
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => onSubmit(validItems)}
            disabled={isPending || validItems.length === 0}
            className="bg-teal-600 hover:bg-teal-700 text-white"
          >
            {isPending ? submittingLabel : submitLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
