import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, Crosshair, ScrollText, Clock, Check, X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/app/history")({
  component: HistoryPage,
});

type Entry =
  | {
      kind: "trophy_purchase";
      id: string;
      created_at: string;
      package_key: string | null;
      trophies: number;
      is_virtual: boolean;
    }
  | {
      kind: "uc_withdrawal";
      id: string;
      created_at: string;
      package_key: string;
      uc_amount: number;
      trophies_cost: number;
      usd_value: number;
      status: string;
      pubg_id: string;
    };

const TROPHY_LABEL: Record<string, string> = {
  starter_100: "حزمة المبتدئ — 100 كأس",
  bronze_500: "حزمة برونزية — 500 كأس",
  silver_1000: "حزمة فضية — 1000 كأس",
  gold_5000: "حزمة ذهبية — 5000 كأس",
};

const UC_LABEL: Record<string, string> = {
  uc_60: "60 UC",
  uc_325: "325 UC",
  uc_660: "660 UC",
  uc_1800: "1800 UC",
  uc_3850: "3850 UC",
};

const STATUS_BADGE: Record<string, { label: string; className: string; icon: any }> = {
  pending: { label: "قيد المعالجة", className: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30", icon: Clock },
  approved: { label: "تم التنفيذ", className: "bg-green-500/10 text-green-500 border-green-500/30", icon: Check },
  rejected: { label: "مرفوض", className: "bg-red-500/10 text-red-500 border-red-500/30", icon: X },
};

function HistoryPage() {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null));
  }, []);

  const { data: purchases } = useQuery({
    queryKey: ["history-purchases", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("shop_transactions")
        .select("id, kind, trophies_added, package_key, is_virtual, created_at")
        .eq("user_id", userId!)
        .eq("kind", "purchase")
        .order("created_at", { ascending: false })
        .limit(200);
      return (data ?? []).map<Entry>((r) => ({
        kind: "trophy_purchase",
        id: r.id,
        created_at: r.created_at,
        package_key: r.package_key,
        trophies: r.trophies_added,
        is_virtual: r.is_virtual,
      }));
    },
  });

  const { data: withdrawals } = useQuery({
    queryKey: ["history-uc-withdrawals", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("uc_withdrawal_requests")
        .select("id, package_key, uc_amount, trophies_cost, usd_value, status, pubg_id, created_at")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(200);
      return (data ?? []).map<Entry>((r) => ({
        kind: "uc_withdrawal",
        id: r.id,
        created_at: r.created_at,
        package_key: r.package_key,
        uc_amount: r.uc_amount,
        trophies_cost: r.trophies_cost,
        usd_value: Number(r.usd_value),
        status: r.status,
        pubg_id: r.pubg_id,
      }));
    },
  });

  const all = [...(purchases ?? []), ...(withdrawals ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-4xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="size-12 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary">
          <ScrollText className="size-6" />
        </div>
        <div>
          <h1 className="display text-3xl">السجل</h1>
          <p className="text-sm text-muted-foreground">جميع عمليات شراء الكؤوس وسحب الشدات</p>
        </div>
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid grid-cols-3 mb-4">
          <TabsTrigger value="all">الكل ({all.length})</TabsTrigger>
          <TabsTrigger value="trophies">شراء كؤوس ({purchases?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="uc">سحب شدات ({withdrawals?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <EntryList entries={all} />
        </TabsContent>
        <TabsContent value="trophies">
          <EntryList entries={purchases ?? []} />
        </TabsContent>
        <TabsContent value="uc">
          <EntryList entries={withdrawals ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EntryList({ entries }: { entries: Entry[] }) {
  if (entries.length === 0) {
    return <div className="text-center text-muted-foreground py-12 text-sm">لا يوجد سجل بعد.</div>;
  }
  return (
    <div className="space-y-2">
      {entries.map((e) => (
        <EntryRow key={`${e.kind}-${e.id}`} entry={e} />
      ))}
    </div>
  );
}

function EntryRow({ entry }: { entry: Entry }) {
  const date = new Date(entry.created_at).toLocaleString("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  if (entry.kind === "trophy_purchase") {
    return (
      <div className="rounded-xl border border-border bg-card/50 p-4 flex items-center gap-3">
        <div className="size-11 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
          <Trophy className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm truncate">
            {TROPHY_LABEL[entry.package_key ?? ""] ?? "شراء كؤوس"}
          </div>
          <div className="text-xs text-muted-foreground">{date}</div>
        </div>
        <div className="text-end shrink-0">
          <div className="font-bold text-amber-400">+{entry.trophies.toLocaleString()} 🏆</div>
          <div className="text-[10px] text-muted-foreground">{entry.is_virtual ? "تجريبي" : "حقيقي"}</div>
        </div>
      </div>
    );
  }

  const badge = STATUS_BADGE[entry.status] ?? STATUS_BADGE.pending;
  const StatusIcon = badge.icon;

  return (
    <div className="rounded-xl border border-border bg-card/50 p-4 flex items-center gap-3">
      <div className="size-11 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 shrink-0">
        <Crosshair className="size-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm truncate">
          سحب {UC_LABEL[entry.package_key] ?? entry.package_key}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          ID: {entry.pubg_id} · {date}
        </div>
      </div>
      <div className="text-end shrink-0 flex flex-col items-end gap-1">
        <div className="font-bold text-sm">−{entry.trophies_cost.toLocaleString()} 🏆</div>
        <span className={`text-[10px] px-2 py-0.5 rounded border flex items-center gap-1 ${badge.className}`}>
          <StatusIcon className="size-3" />
          {badge.label}
        </span>
      </div>
    </div>
  );
}
