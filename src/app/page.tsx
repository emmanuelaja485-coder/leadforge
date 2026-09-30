"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Search,
  Sparkles,
  Filter,
  Loader2,
  Plus,
  Settings,
  CheckCircle2,
  AlertTriangle,
  Mail,
  Linkedin,
  MessageSquare,
  Phone,
  FileText,
  Copy,
  RefreshCw,
  X,
  Trash2,
  Check,
  Zap,
  Bot,
  Globe,
  MapPin,
  Building2,
  Star,
  TrendingUp,
  Clock,
  Calendar,
  ChevronRight,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ---------------- Types ----------------
type Lead = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  location: string | null;
  industry: string | null;
  companySize: string | null;
  snippet: string | null;
  leadType: string;
  bookTitle: string | null;
  bookGenre: string | null;
  bookThemes: string | null;
  bookHook: string | null;
  authorBio: string | null;
  score: number;
  geminiVerified: boolean;
  geminiSummary: string | null;
  geminiAngle: string | null;
  geminiWarnings: string | null;
  portfolioJson: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  lastContactedAt: string | null;
};

type DiscoveredLead = {
  name: string;
  company: string;
  website: string;
  email: string | null;
  phone: string | null;
  location: string;
  industry: string;
  companySize: string;
  snippet: string;
  favicon: string;
  leadType: "ecommerce" | "author";
  // Author-specific
  bookTitle: string | null;
  bookGenre: string | null;
  bookThemes: string[];
  bookHook: string | null;
  authorBio: string | null;
  verified: boolean;
  score: number;
  summary: string;
  angle: string;
  warnings: string[];
  usedMock: boolean;
  usedFallback?: boolean;
  geminiError?: string;
};

type Message = {
  id: string;
  type: string;
  content: string;
  createdAt: string;
};

type Task = {
  id: string;
  leadId: string;
  title: string;
  type: string;
  dueDate: string | null;
  completed: boolean;
  createdAt: string;
};

type AutomationRule = {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  configJson: string | null;
};

type AutomationLog = {
  id: string;
  ruleId: string | null;
  leadId: string | null;
  action: string;
  detail: string | null;
  createdAt: string;
  lead?: { name: string; company: string | null } | null;
};

type Portfolio = {
  website: string;
  siteTitle: string;
  description: string;
  emails: string[];
  phones: string[];
  socials: { type: string; url: string }[];
  companyInfo: { founded?: string; teamSize?: string; keywords: string[] };
  projects: { title: string; url: string }[];
};

// ---------------- Constants ----------------
const PIPELINE_STATUSES = [
  { id: "new", label: "New", color: "text-cyan-400" },
  { id: "contacted", label: "Contacted", color: "text-amber-400" },
  { id: "qualified", label: "Qualified", color: "text-violet-400" },
  { id: "won", label: "Won", color: "text-emerald-400" },
  { id: "lost", label: "Lost", color: "text-rose-400" },
];

const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "500+"];
const INDUSTRIES = [
  "e-commerce",
  "fashion",
  "beauty",
  "fitness",
  "tech",
  "food",
  "home",
  "wellness",
  "jewelry",
  "subscription",
];

const MESSAGE_TYPES = [
  { id: "cold_email", label: "Cold Email", icon: Mail },
  { id: "linkedin", label: "LinkedIn DM", icon: Linkedin },
  { id: "followup", label: "Follow-up #1", icon: RefreshCw },
  { id: "whatsapp", label: "WhatsApp / SMS", icon: Phone },
  { id: "pitch", label: "Pitch / Proposal", icon: FileText },
];

// ---------------- Helpers ----------------
function getGeminiKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("leadforge.geminiKey") || "";
}
function setGeminiKey(v: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("leadforge.geminiKey", v);
}
function getBraveKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("leadforge.braveKey") || "";
}
function setBraveKey(v: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("leadforge.braveKey", v);
}

function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-amber-400";
  if (score >= 40) return "text-orange-400";
  return "text-rose-400";
}
function scoreTier(score: number) {
  if (score >= 80) return "hot";
  if (score >= 60) return "warm";
  return "cold";
}
function parsePortfolio(json: string | null): Portfolio | null {
  if (!json) return null;
  try { return JSON.parse(json); } catch { return null; }
}
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// ============================================================
//  MAIN APP
// ============================================================
export default function Home() {
  const [tab, setTab] = useState<"discover" | "pipeline" | "automation" | "settings">("discover");

  // Discovery
  const [query, setQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [industryFilter, setIndustryFilter] = useState("e-commerce");
  const [niche, setNiche] = useState<"ecommerce" | "author">("ecommerce");
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredLead[]>([]);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  // Pipeline
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [filter, setFilter] = useState({
    location: "",
    industry: "",
    companySize: "",
    minScore: 0,
    status: "all",
    q: "",
  });

  // Detail sheet
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<"overview" | "portfolio" | "messages" | "tasks">("overview");
  const [messages, setMessages] = useState<Message[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [enriching, setEnriching] = useState(false);
  const [generatingType, setGeneratingType] = useState<string | null>(null);

  // Automation
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [autoLogs, setAutoLogs] = useState<AutomationLog[]>([]);
  const [runningAuto, setRunningAuto] = useState(false);

  // Settings
  const [geminiKeyInput, setGeminiKeyInput] = useState("");
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [braveKeyInput, setBraveKeyInput] = useState("");
  const [showBraveKey, setShowBraveKey] = useState(false);

  useEffect(() => {
    setGeminiKeyInput(getGeminiKey());
    setBraveKeyInput(getBraveKey());
    refreshLeads();
    refreshAutomation();
    // run automation once on load
    fetch("/api/automation/run", { method: "POST" }).then(() => refreshLeads());
     
  }, []);

  // ---------- Discovery ----------
  async function discover() {
    if (!query.trim()) {
      toast.error("Enter a search query first");
      return;
    }
    setDiscovering(true);
    setDiscovered([]);
    setSavedIds(new Set());
    try {
      const res = await fetch("/api/leads/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-gemini-key": getGeminiKey() },
        body: JSON.stringify({
          query,
          location: locationFilter,
          industry: niche === "author" ? "publishing" : industryFilter,
          leadType: niche,
          geminiKey: getGeminiKey(),
          braveKey: getBraveKey(),
        }),
      });
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setDiscovered(data.leads || []);
      const anyMock = data.leads?.some((l: DiscoveredLead) => l.usedMock);
      const anyFallback = data.leads?.some((l: DiscoveredLead) => l.usedFallback);
      if (anyMock) {
        toast.info("Gemini key not set — running in demo mode with mock AI responses. Add your key in Settings for real AI.");
      } else if (anyFallback) {
        toast.success(`Discovered ${data.leads?.length || 0} verified leads`);
        toast.info("Gemini geo-blocked from this server — using ZAI chat as fallback for real AI responses.");
      } else {
        toast.success(`Discovered ${data.leads?.length || 0} verified leads`);
      }
    } catch (e: any) {
      toast.error(e.message || "Discovery failed");
    } finally {
      setDiscovering(false);
    }
  }

  async function saveLead(l: DiscoveredLead) {
    const sig = `${l.website}|${l.email || ""}`;
    if (savingIds.has(sig)) return;
    setSavingIds(new Set(savingIds).add(sig));
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: l.name,
          company: l.company,
          email: l.email,
          phone: l.phone,
          website: l.website,
          location: l.location,
          industry: l.industry,
          companySize: l.companySize,
          snippet: l.snippet,
          score: l.score,
          geminiSummary: l.summary,
          geminiAngle: l.angle,
          geminiWarnings: l.warnings ? JSON.stringify(l.warnings) : null,
          geminiVerified: l.verified,
          status: "new",
          leadType: l.leadType || "ecommerce",
          bookTitle: l.bookTitle || null,
          bookGenre: l.bookGenre || null,
          bookThemes: l.bookThemes ? JSON.stringify(l.bookThemes) : null,
          bookHook: l.bookHook || null,
          authorBio: l.authorBio || null,
        }),
      });
      const data = await res.json();
      if (data.duplicate) {
        toast.info("Already in pipeline");
      } else {
        toast.success("Lead saved to pipeline");
        setSavedIds(new Set(savedIds).add(sig));
        refreshLeads();
        // Trigger auto-enrich in the background
        if (data.lead?.id) {
          fetch(`/api/leads/${data.lead.id}/enrich`, {
            method: "POST",
            headers: { "x-gemini-key": getGeminiKey() },
          }).then(() => refreshLeads());
        }
      }
    } catch {
      toast.error("Save failed");
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(sig);
        return next;
      });
    }
  }

  // ---------- Pipeline ----------
  async function refreshLeads() {
    setLoadingLeads(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filter).forEach(([k, v]) => {
        if (v && v !== "all" && v !== 0) params.append(k, String(v));
      });
      const res = await fetch(`/api/leads?${params.toString()}`);
      const data = await res.json();
      setLeads(data.leads || []);
    } catch {
      toast.error("Failed to load leads");
    } finally {
      setLoadingLeads(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(refreshLeads, 200);
    return () => clearTimeout(t);
     
  }, [filter]);

  async function updateLeadStatus(lead: Lead, status: string) {
    // Optimistic
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, status } : l)));
    await fetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    toast.success(`Moved to ${status}`);
    refreshLeads();
  }

  async function deleteLead(lead: Lead) {
    await fetch(`/api/leads/${lead.id}`, { method: "DELETE" });
    setDetailOpen(false);
    refreshLeads();
    toast.success("Lead deleted");
  }

  // ---------- Detail ----------
  async function openLead(lead: Lead) {
    setSelectedLead(lead);
    setDetailOpen(true);
    setDetailTab("overview");
    setMessages([]);
    setTasks([]);
    // Fetch messages + tasks
    try {
      const [m, t] = await Promise.all([
        fetch(`/api/leads/${lead.id}/messages`).then((r) => r.json()),
        fetch(`/api/leads/${lead.id}/tasks`).then((r) => r.json()),
      ]);
      setMessages(m.messages || []);
      setTasks(t.tasks || []);
    } catch {
      /* ignore */
    }
  }

  async function enrichLead() {
    if (!selectedLead) return;
    setEnriching(true);
    try {
      const res = await fetch(`/api/leads/${selectedLead.id}/enrich`, {
        method: "POST",
        headers: { "x-gemini-key": getGeminiKey() },
      });
      const data = await res.json();
      if (data.lead) {
        setSelectedLead(data.lead);
        refreshLeads();
        toast.success("Lead enriched");
      }
      if (data.gemini?.usedMock) {
        toast.info("Using mock AI — set your Gemini key in Settings for real responses.");
      } else if (data.gemini?.usedFallback) {
        toast.info("Gemini geo-blocked — used ZAI chat fallback for real AI responses.");
      }
    } catch {
      toast.error("Enrich failed");
    } finally {
      setEnriching(false);
    }
  }

  async function generateMessage(type: string) {
    if (!selectedLead) return;
    setGeneratingType(type);
    const isAuthor = selectedLead.leadType === "author";
    try {
      const res = await fetch(`/api/leads/${selectedLead.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-gemini-key": getGeminiKey() },
        body: JSON.stringify({ type, geminiKey: getGeminiKey(), authorMode: isAuthor }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        return;
      }
      setMessages((prev) => [data.message, ...prev]);
      toast.success("Message generated");
      if (data.usedMock) {
        toast.info("Using mock AI — set your Gemini key in Settings for real responses.");
      } else if (data.usedFallback) {
        toast.info("Gemini geo-blocked — used ZAI chat fallback for real AI responses.");
      }
      // Refresh selectedLead to update lastContactedAt + status
      const leadRes = await fetch(`/api/leads/${selectedLead.id}`);
      const leadData = await leadRes.json();
      if (leadData.lead) setSelectedLead(leadData.lead);
      refreshLeads();
    } catch (e: any) {
      toast.error(e.message || "Generation failed");
    } finally {
      setGeneratingType(null);
    }
  }

  async function toggleTask(task: Task) {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completed: !t.completed } : t)));
    await fetch(`/api/leads/${selectedLead?.id}/tasks`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: task.id, completed: !task.completed }),
    });
  }

  async function addTask(title: string, type: string, dueDate: string) {
    if (!selectedLead || !title) return;
    const res = await fetch(`/api/leads/${selectedLead.id}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, type, dueDate: dueDate || null }),
    });
    const data = await res.json();
    if (data.task) {
      setTasks((prev) => [data.task, ...prev]);
      toast.success("Task added");
    }
  }

  async function deleteTask(task: Task) {
    await fetch(`/api/leads/${selectedLead?.id}/tasks?taskId=${task.id}`, { method: "DELETE" });
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
  }

  // ---------- Automation ----------
  async function refreshAutomation() {
    try {
      const res = await fetch("/api/automation/rules");
      const data = await res.json();
      setRules(data.rules || []);
      setAutoLogs(data.logs || []);
    } catch {
      /* ignore */
    }
  }

  async function toggleRule(rule: AutomationRule) {
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)));
    await fetch("/api/automation/rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rule.id, enabled: !rule.enabled }),
    });
  }

  async function runAutomation() {
    setRunningAuto(true);
    try {
      const res = await fetch("/api/automation/run", { method: "POST" });
      const data = await res.json();
      toast.success(`Advanced ${data.advanced} leads, created ${data.tasksCreated} tasks`);
      refreshAutomation();
      refreshLeads();
    } catch {
      toast.error("Automation run failed");
    } finally {
      setRunningAuto(false);
    }
  }

  // ---------- Settings ----------
  function saveSettings() {
    setGeminiKey(geminiKeyInput.trim());
    toast.success("Gemini API key saved locally");
    setTab("discover");
  }

  // ============================================================
  //  RENDER
  // ============================================================
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-4 px-4 md:px-6 h-16">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center glow-emerald">
              <Zap className="size-5 text-black" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight">LeadForge</h1>
              <p className="text-[11px] text-muted-foreground -mt-0.5">AI-Powered Lead Generation CRM</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden md:inline-flex gap-1 border-emerald-500/30 text-emerald-400">
              <Sparkles className="size-3" />
              {getGeminiKey() ? "Gemini connected" : "Demo mode"}
            </Badge>
            <Button size="sm" variant="ghost" onClick={() => setTab("settings")}>
              <Settings className="size-4" /> Settings
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 md:px-6">
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList className="bg-transparent border-b border-border/60 rounded-none w-full h-auto p-0 justify-start gap-6">
              <TabsTrigger value="discover" className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-400 data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3 gap-2">
                <Search className="size-4" /> Discover
              </TabsTrigger>
              <TabsTrigger value="pipeline" className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-400 data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3 gap-2">
                <TrendingUp className="size-4" /> Pipeline
                <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{leads.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="automation" className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-400 data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3 gap-2">
                <Bot className="size-4" /> Automation
              </TabsTrigger>
              <TabsTrigger value="settings" className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-400 data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3 gap-2">
                <Settings className="size-4" /> Settings
              </TabsTrigger>
            </TabsList>

            <TabsContent value="discover" className="mt-0 p-4 md:p-6">
              {DiscoverView()}
            </TabsContent>
            <TabsContent value="pipeline" className="mt-0 p-4 md:p-6">
              {PipelineView()}
            </TabsContent>
            <TabsContent value="automation" className="mt-0 p-4 md:p-6">
              {AutomationView()}
            </TabsContent>
            <TabsContent value="settings" className="mt-0 p-4 md:p-6">
              {SettingsView()}
            </TabsContent>
          </Tabs>
        </div>
      </header>

      {/* Footer */}
      <footer className="mt-auto border-t border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="px-4 md:px-6 py-3 flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Zap className="size-3.5 text-emerald-400" />
            LeadForge — Gemini AI-qualified lead discovery
          </div>
          <div className="flex items-center gap-4">
            <span>Web search via z-ai-web-dev-sdk</span>
            <span className="text-border">•</span>
            <span>{getGeminiKey() ? "Real Gemini AI active" : "Demo mode (set key in Settings)"}</span>
          </div>
        </div>
      </footer>

      {/* Lead detail sheet */}
      {LeadDetailSheet()}

      {/* Sub-components defined below as closures for state reuse */}
    </div>
  );

  // -------- Inline sub-views (closures, share parent state) --------

  function DiscoverView() {
    return (
      <div className="max-w-7xl mx-auto">
        {/* Hero search */}
        <div className="grid-bg rounded-2xl border border-border/60 p-6 md:p-10 mb-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-cyan-500/5 pointer-events-none" />
          <div className="relative">
            <div className="flex items-start justify-between gap-4 mb-2">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
                  {niche === "author" ? (
                    <>Find your next <span className="text-emerald-400 text-glow">author leads</span></>
                  ) : (
                    <>Find your next <span className="text-emerald-400 text-glow">e-commerce leads</span></>
                  )}
                </h2>
                <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
                  {niche === "author"
                    ? "Search the web for published authors and their books. Gemini extracts the author name, their most recent book title, themes, and a specific concrete \u2018hook\u2019 from the book to reference in outreach."
                    : "Search the web for SMB / Shopify / WooCommerce brands. Every lead is AI-confirmed with Gemini (validates contact info, scores 0-100, summarizes portfolio) before showing up below."}
                </p>
              </div>
            </div>

            {/* Niche toggle */}
            <div className="flex items-center gap-2 mb-4">
              <Button
                size="sm"
                variant={niche === "ecommerce" ? "default" : "outline"}
                onClick={() => setNiche("ecommerce")}
                className={niche === "ecommerce" ? "bg-emerald-500 hover:bg-emerald-400 text-black" : ""}
              >
                <Building2 className="size-3.5" /> E-commerce / SMB
              </Button>
              <Button
                size="sm"
                variant={niche === "author" ? "default" : "outline"}
                onClick={() => setNiche("author")}
                className={niche === "author" ? "bg-emerald-500 hover:bg-emerald-400 text-black" : ""}
              >
                <BookOpen className="size-3.5" /> Authors / Books
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-6 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder={niche === "author"
                    ? 'e.g. "debut literary fiction authors", "self-published fantasy authors", "memoir writers NYC"'
                    : "e.g. Shopify stores selling skincare, WooCommerce fashion brands, DTC coffee..."}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && discover()}
                  className="pl-9 h-11 bg-card/50 border-border/60"
                />
              </div>
              <div className="md:col-span-2 relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="Location"
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  className="pl-9 h-11 bg-card/50 border-border/60"
                />
              </div>
              {niche === "ecommerce" ? (
                <div className="md:col-span-2">
                  <Select value={industryFilter} onValueChange={setIndustryFilter}>
                    <SelectTrigger className="h-11 bg-card/50 border-border/60">
                      <SelectValue placeholder="Industry" />
                    </SelectTrigger>
                    <SelectContent>
                      {INDUSTRIES.map((i) => (
                        <SelectItem key={i} value={i}>{i}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="md:col-span-2">
                  <Select value={industryFilter} onValueChange={setIndustryFilter}>
                    <SelectTrigger className="h-11 bg-card/50 border-border/60">
                      <SelectValue placeholder="Genre" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="literary fiction">Literary fiction</SelectItem>
                      <SelectItem value="fantasy">Fantasy</SelectItem>
                      <SelectItem value="romance">Romance</SelectItem>
                      <SelectItem value="thriller">Thriller</SelectItem>
                      <SelectItem value="mystery">Mystery</SelectItem>
                      <SelectItem value="memoir">Memoir</SelectItem>
                      <SelectItem value="historical">Historical</SelectItem>
                      <SelectItem value="young adult">Young adult</SelectItem>
                      <SelectItem value="poetry">Poetry</SelectItem>
                      <SelectItem value="nonfiction">Nonfiction</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="md:col-span-2">
                <Button onClick={discover} disabled={discovering} className="h-11 w-full bg-emerald-500 hover:bg-emerald-400 text-black font-medium">
                  {discovering ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  {discovering ? "Searching..." : "Discover"}
                </Button>
              </div>
            </div>

            {!getGeminiKey() && (
              <div className="mt-4 flex items-start gap-2 text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                <AlertTriangle className="size-4 mt-0.5 shrink-0" />
                <span>
                  No Gemini API key set. Discovery will run in <b>demo mode</b> with mock AI responses.
                  Go to <button className="underline" onClick={() => setTab("settings")}>Settings</button> to add your key.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Results */}
        {discovering && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="bg-card/50 border-border/60 animate-pulse">
                <CardContent className="p-4 space-y-3">
                  <div className="h-4 w-3/4 bg-muted/60 rounded" />
                  <div className="h-3 w-full bg-muted/40 rounded" />
                  <div className="h-3 w-2/3 bg-muted/40 rounded" />
                  <div className="h-9 w-full bg-muted/30 rounded mt-3" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!discovering && discovered.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Sparkles className="size-5 text-emerald-400" />
                {discovered.length} AI-verified leads
              </h3>
              <Button variant="outline" size="sm" onClick={() => setDiscovered([])}>
                <X className="size-3.5" /> Clear
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {discovered.map((l, i) => (
                <DiscoveredCard key={`${l.website}-${i}`} lead={l} />
              ))}
            </div>
          </div>
        )}

        {!discovering && discovered.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Search className="size-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Search for leads to begin</p>
            {niche === "author" ? (
              <p className="text-xs mt-1">Try: "debut literary fiction authors", "self-published fantasy authors", "memoir writers with recent book"</p>
            ) : (
              <p className="text-xs mt-1">Try: "Shopify fashion brands", "DTC skincare stores", "WooCommerce coffee roasters"</p>
            )}
          </div>
        )}
      </div>
    );
  }

  function DiscoveredCard({ lead }: { lead: DiscoveredLead }) {
    const sig = `${lead.website}|${lead.email || ""}`;
    const saving = savingIds.has(sig);
    const saved = savedIds.has(sig);
    const tier = scoreTier(lead.score);
    const isAuthor = lead.leadType === "author";
    return (
      <Card className="bg-card/60 border-border/60 hover:border-emerald-500/40 transition-colors flex flex-col">
        <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2 space-y-0">
          <div className="flex items-start gap-2 min-w-0">
            {lead.favicon ? (
               
              <img src={lead.favicon} alt="" className="size-8 rounded shrink-0 mt-0.5 bg-white/5" />
            ) : isAuthor ? (
              <BookOpen className="size-8 rounded shrink-0 mt-0.5 text-emerald-400/60" />
            ) : (
              <Globe className="size-8 rounded shrink-0 mt-0.5 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <CardTitle className="text-sm font-semibold truncate">{lead.name}</CardTitle>
              <a href={lead.website} target="_blank" rel="noreferrer" className="text-[11px] text-muted-foreground hover:text-emerald-400 truncate block">
                {lead.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className={`text-sm font-bold ${scoreColor(lead.score)}`}>{lead.score}</span>
            <Badge variant="outline" className={`text-[9px] uppercase px-1.5 py-0 border-${tier === "hot" ? "emerald" : tier === "warm" ? "amber" : "rose"}-500/40`}>{tier}</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col gap-3 pt-2">
          {isAuthor && (lead.bookTitle || lead.bookGenre) && (
            <div className="bg-violet-500/8 border border-violet-500/30 rounded-md px-2 py-2">
              <div className="flex items-center gap-1.5 text-violet-300 text-[10px] uppercase tracking-wide">
                <BookOpen className="size-3" /> {lead.bookGenre || "Unknown genre"}
              </div>
              <p className="text-sm font-semibold text-violet-100 truncate mt-0.5">
                {lead.bookTitle || "(book title not extracted — set Gemini key)"}
              </p>
              {lead.bookThemes && lead.bookThemes.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {lead.bookThemes.slice(0, 4).map((t, i) => (
                    <Badge key={i} variant="outline" className="text-[9px] border-violet-500/30 text-violet-200">{t}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}
          {lead.summary && (
            <p className="text-xs text-muted-foreground line-clamp-3">{lead.summary}</p>
          )}
          {isAuthor && lead.bookHook && (
            <div className="text-[11px] bg-amber-500/8 border border-amber-500/30 rounded-md px-2 py-1.5 text-amber-200">
              <b>Book hook for outreach:</b> {lead.bookHook}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 text-[10px]">
            {lead.email && (
              <Badge variant="secondary" className="gap-1 font-mono"><Mail className="size-2.5" /> {lead.email}</Badge>
            )}
            {lead.phone && (
              <Badge variant="secondary" className="gap-1 font-mono"><Phone className="size-2.5" /> {lead.phone}</Badge>
            )}
            {lead.location && (
              <Badge variant="secondary" className="gap-1"><MapPin className="size-2.5" /> {lead.location}</Badge>
            )}
            {lead.industry && !isAuthor && (
              <Badge variant="secondary" className="gap-1"><Building2 className="size-2.5" /> {lead.industry}</Badge>
            )}
            {isAuthor && lead.authorBio && (
              <Badge variant="secondary" className="gap-1"><BookOpen className="size-2.5" /> author</Badge>
            )}
          </div>
          {!isAuthor && lead.angle && (
            <div className="text-[11px] bg-emerald-500/8 border border-emerald-500/20 rounded-md px-2 py-1.5 text-emerald-300">
              <b>AI angle:</b> {lead.angle}
            </div>
          )}
          {isAuthor && lead.angle && (
            <div className="text-[11px] bg-emerald-500/8 border border-emerald-500/20 rounded-md px-2 py-1.5 text-emerald-300">
              <b>Outreach angle:</b> {lead.angle}
            </div>
          )}
          {lead.warnings?.length > 0 && (
            <div className="text-[11px] text-amber-400 flex items-start gap-1">
              <AlertTriangle className="size-3 mt-0.5 shrink-0" />
              <span>{lead.warnings[0]}</span>
            </div>
          )}
          {lead.usedMock && (
            <div className="text-[10px] text-muted-foreground bg-muted/30 rounded px-1.5 py-0.5">
              Mock AI response (set Gemini key for real)
            </div>
          )}
          <Button
            size="sm"
            onClick={() => saveLead(lead)}
            disabled={saving || saved}
            className={`mt-auto ${saved ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" : "bg-emerald-500 hover:bg-emerald-400 text-black"} font-medium`}
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : saved ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
            {saved ? "In pipeline" : "Save to pipeline"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  function PipelineView() {
    return (
      <div className="max-w-[1400px] mx-auto">
        {/* Filter bar */}
        <Card className="bg-card/50 border-border/60 mb-6">
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <div className="md:col-span-2 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, company, email..."
                  value={filter.q}
                  onChange={(e) => setFilter({ ...filter, q: e.target.value })}
                  className="pl-9 h-10 bg-background/50"
                />
              </div>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="Location"
                  value={filter.location}
                  onChange={(e) => setFilter({ ...filter, location: e.target.value })}
                  className="pl-9 h-10 bg-background/50"
                />
              </div>
              <Select
                value={filter.industry || "all"}
                onValueChange={(v) => setFilter({ ...filter, industry: v === "all" ? "" : v })}
              >
                <SelectTrigger className="h-10 bg-background/50"><Filter className="size-3.5 mr-1" /><SelectValue placeholder="Industry" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All industries</SelectItem>
                  {INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select
                value={filter.companySize || "all"}
                onValueChange={(v) => setFilter({ ...filter, companySize: v === "all" ? "" : v })}
              >
                <SelectTrigger className="h-10 bg-background/50"><Building2 className="size-3.5 mr-1" /><SelectValue placeholder="Company size" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any size</SelectItem>
                  {COMPANY_SIZES.map((s) => <SelectItem key={s} value={s}>{s} employees</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex flex-col">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>Min score: {filter.minScore}</span>
                  <Star className="size-3" />
                </div>
                <input
                  type="range" min={0} max={100} step={5}
                  value={filter.minScore}
                  onChange={(e) => setFilter({ ...filter, minScore: parseInt(e.target.value, 10) })}
                  className="accent-emerald-500 h-10"
                />
              </div>
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/40">
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant={filter.status === "all" ? "default" : "outline"}
                  onClick={() => setFilter({ ...filter, status: "all" })}
                  className={filter.status === "all" ? "bg-emerald-500 text-black hover:bg-emerald-400" : ""}
                >
                  All ({leads.length})
                </Button>
                {PIPELINE_STATUSES.map((s) => {
                  const count = leads.filter((l) => l.status === s.id).length;
                  return (
                    <Button
                      key={s.id}
                      size="sm"
                      variant={filter.status === s.id ? "default" : "outline"}
                      onClick={() => setFilter({ ...filter, status: s.id })}
                      className={filter.status === s.id ? "bg-emerald-500 text-black hover:bg-emerald-400" : ""}
                    >
                      <span className={filter.status === s.id ? "text-black" : s.color}>{s.label}</span> ({count})
                    </Button>
                  );
                })}
              </div>
              <Button size="sm" variant="ghost" onClick={() => refreshLeads()}>
                <RefreshCw className="size-3.5" /> Refresh
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Kanban */}
        {loadingLeads ? (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-64 bg-card/50 animate-pulse rounded-xl border border-border/60" />
            ))}
          </div>
        ) : leads.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <TrendingUp className="size-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No leads match your filters</p>
            <p className="text-xs mt-1">Try adjusting filters or discover new leads from the Discover tab</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {PIPELINE_STATUSES.map((status) => {
              const columnLeads = leads.filter((l) => l.status === status.id);
              return (
                <div key={status.id} className="flex flex-col gap-2 min-h-[200px]">
                  <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-2">
                      <span className={`size-2 rounded-full ${status.color.replace("text-", "bg-")}`} />
                      <span className={`text-sm font-semibold ${status.color}`}>{status.label}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{columnLeads.length}</Badge>
                  </div>
                  <div className="flex flex-col gap-2 min-h-[60px]">
                    {columnLeads.length === 0 ? (
                      <div className="text-[11px] text-muted-foreground text-center py-3 border border-dashed border-border/40 rounded-lg">
                        Empty
                      </div>
                    ) : (
                      columnLeads.map((lead) => (
                        <PipelineCard key={lead.id} lead={lead} onOpen={() => openLead(lead)} onMove={(s) => updateLeadStatus(lead, s)} />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function PipelineCard({ lead, onOpen, onMove }: { lead: Lead; onOpen: () => void; onMove: (s: string) => void }) {
    const portfolio = parsePortfolio(lead.portfolioJson);
    const isAuthor = lead.leadType === "author";
    return (
      <Card
        className="bg-card/70 border-border/60 hover:border-emerald-500/40 cursor-pointer transition-all hover:-translate-y-0.5"
        onClick={onOpen}
      >
        <CardContent className="p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex items-start gap-1.5">
              {isAuthor && <BookOpen className="size-3.5 text-violet-400 shrink-0 mt-0.5" />}
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{lead.name}</p>
                {isAuthor && lead.bookTitle && (
                  <p className="text-[11px] text-violet-300 truncate italic">"{lead.bookTitle}"</p>
                )}
                {!isAuthor && lead.company && lead.company !== lead.name && (
                  <p className="text-[11px] text-muted-foreground truncate">{lead.company}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className={`text-xs font-bold ${scoreColor(lead.score)}`}>{lead.score}</span>
              {lead.geminiVerified && (
                <Tooltip><TooltipTrigger asChild><CheckCircle2 className="size-3.5 text-emerald-400" /></TooltipTrigger><TooltipContent>AI verified</TooltipContent></Tooltip>
              )}
            </div>
          </div>

          {(lead.geminiSummary || lead.snippet) && (
            <p className="text-[11px] text-muted-foreground line-clamp-2">
              {lead.geminiSummary || lead.snippet}
            </p>
          )}

          <div className="flex flex-wrap gap-1">
            {lead.email && <Badge variant="secondary" className="text-[9px] gap-1"><Mail className="size-2" /> email</Badge>}
            {lead.phone && <Badge variant="secondary" className="text-[9px] gap-1"><Phone className="size-2" /> phone</Badge>}
            {portfolio?.socials?.length > 0 && <Badge variant="secondary" className="text-[9px] gap-1"><Globe className="size-2" /> {portfolio.socials.length}</Badge>}
            {lead.location && <Badge variant="secondary" className="text-[9px] gap-1"><MapPin className="size-2" /> {lead.location}</Badge>}
            {isAuthor && <Badge variant="outline" className="text-[9px] gap-1 border-violet-500/40 text-violet-300"><BookOpen className="size-2" /> author</Badge>}
          </div>

          <Select
            value={lead.status}
            onValueChange={onMove}
          >
            <SelectTrigger className="h-7 text-[11px] bg-background/50" onClick={(e) => e.stopPropagation()}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PIPELINE_STATUSES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
    );
  }

  function AutomationView() {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <Card className="bg-card/50 border-border/60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><Bot className="size-5 text-emerald-400" /> Automation rules</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">Toggle rules below. Click "Run now" to execute on demand.</p>
              </div>
              <Button onClick={runAutomation} disabled={runningAuto} size="sm" className="bg-emerald-500 hover:bg-emerald-400 text-black">
                {runningAuto ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
                Run now
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {rules.length === 0 && <p className="text-sm text-muted-foreground">No rules yet.</p>}
            {rules.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-background/40 border border-border/40">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`size-8 rounded-md flex items-center justify-center shrink-0 ${r.enabled ? "bg-emerald-500/15 text-emerald-400" : "bg-muted/40 text-muted-foreground"}`}>
                    {r.type === "auto_enrich" && <Sparkles className="size-4" />}
                    {r.type === "auto_advance_status" && <TrendingUp className="size-4" />}
                    {r.type === "auto_followup_task" && <Clock className="size-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{r.name}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{r.type}</p>
                  </div>
                </div>
                <Switch checked={r.enabled} onCheckedChange={() => toggleRule(r)} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Calendar className="size-5 text-emerald-400" /> Recent automation activity</CardTitle>
          </CardHeader>
          <CardContent>
            {autoLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <ScrollArea className="max-h-80 scrollbar-thin">
                <ul className="space-y-2">
                  {autoLogs.map((log) => (
                    <li key={log.id} className="flex items-start gap-3 text-sm py-2 border-b border-border/30 last:border-0">
                      <div className="size-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-xs text-emerald-400">{log.action}</p>
                        <p className="text-xs text-muted-foreground">{log.detail}</p>
                        {log.lead && (
                          <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                            Lead: {log.lead.name} · {relativeTime(log.createdAt)}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  function SettingsView() {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Card className="bg-card/50 border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Search className="size-5 text-emerald-400" /> Brave Search API key (recommended)</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Powers the Discover tab. Brave Search is the most reliable way to find leads — 2000 queries/month free, no geo-block. Get a free key at <a href="https://api.search.brave.com" target="_blank" rel="noreferrer" className="text-emerald-400 underline">api.search.brave.com</a> → Register → Subscribe to Free plan → copy API key.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label htmlFor="brave-key">Brave API key</Label>
            <div className="flex gap-2">
              <Input
                id="brave-key"
                type={showBraveKey ? "text" : "password"}
                value={braveKeyInput}
                onChange={(e) => setBraveKeyInput(e.target.value)}
                placeholder="BSA..."
                className="font-mono bg-background/50"
              />
              <Button variant="outline" size="icon" onClick={() => setShowBraveKey((s) => !s)}>
                {showBraveKey ? "Hide" : "Show"}
              </Button>
            </div>
            <div className="flex items-center justify-between pt-2">
              <p className="text-[11px] text-muted-foreground">
                Status: {getBraveKey() ? <Badge variant="outline" className="text-emerald-400 border-emerald-500/30">Connected</Badge> : <Badge variant="outline" className="text-amber-400 border-amber-500/30">Not set</Badge>}
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setBraveKey(""); setBraveKeyInput(""); toast.success("Cleared"); }}>
                  Clear
                </Button>
                <Button size="sm" onClick={() => { setBraveKey(braveKeyInput.trim()); toast.success("Brave API key saved locally"); setTab("discover"); }} className="bg-emerald-500 hover:bg-emerald-400 text-black">
                  <Check className="size-4" /> Save
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sparkles className="size-5 text-emerald-400" /> Gemini API key (optional)</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Powers AI summaries, lead scoring, and message generation. Get a free key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-emerald-400 underline">Google AI Studio</a>. If you don't set this, the app uses ZAI chat as fallback (works on this sandbox).
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label htmlFor="gemini-key">API key</Label>
            <div className="flex gap-2">
              <Input
                id="gemini-key"
                type={showGeminiKey ? "text" : "password"}
                value={geminiKeyInput}
                onChange={(e) => setGeminiKeyInput(e.target.value)}
                placeholder="AIza..."
                className="font-mono bg-background/50"
              />
              <Button variant="outline" size="icon" onClick={() => setShowGeminiKey((s) => !s)}>
                {showGeminiKey ? "Hide" : "Show"}
              </Button>
            </div>
            <div className="flex items-center justify-between pt-2">
              <p className="text-[11px] text-muted-foreground">
                Status: {getGeminiKey() ? <Badge variant="outline" className="text-emerald-400 border-emerald-500/30">Connected</Badge> : <Badge variant="outline" className="text-amber-400 border-amber-500/30">Demo mode</Badge>}
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setGeminiKey(""); setGeminiKeyInput(""); toast.success("Cleared"); }}>
                  Clear
                </Button>
                <Button size="sm" onClick={saveSettings} className="bg-emerald-500 hover:bg-emerald-400 text-black">
                  <Check className="size-4" /> Save
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Bot className="size-5 text-emerald-400" /> What this enables</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p className="flex items-start gap-2"><CheckCircle2 className="size-4 text-emerald-400 mt-0.5 shrink-0" /> Gemini reads the lead's website + portfolio and returns a JSON validation, 0-100 score, and recommended angle.</p>
            <p className="flex items-start gap-2"><CheckCircle2 className="size-4 text-emerald-400 mt-0.5 shrink-0" /> Gemini generates personalized cold emails, LinkedIn DMs, follow-ups, WhatsApp messages, and full pitches.</p>
            <p className="flex items-start gap-2"><CheckCircle2 className="size-4 text-emerald-400 mt-0.5 shrink-0" /> Without a key, the app still works in demo mode with mock AI responses — useful for exploring the UI.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  function LeadDetailSheet() {
    if (!selectedLead) return null;
    const portfolio = parsePortfolio(selectedLead.portfolioJson);
    const isAuthor = selectedLead.leadType === "author";
    return (
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl bg-card/95 border-l border-border/60 p-0">
          <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/40">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <SheetTitle className="text-lg font-semibold truncate flex items-center gap-2">
                  {isAuthor && <BookOpen className="size-4 text-violet-400 shrink-0" />}
                  {selectedLead.name}
                </SheetTitle>
                {isAuthor && selectedLead.bookTitle && (
                  <p className="text-xs text-violet-300 truncate italic mt-0.5">"{selectedLead.bookTitle}"</p>
                )}
                {!isAuthor && selectedLead.company && selectedLead.company !== selectedLead.name && (
                  <p className="text-xs text-muted-foreground truncate">{selectedLead.company}</p>
                )}
                {selectedLead.website && (
                  <a href={selectedLead.website} target="_blank" rel="noreferrer" className="text-[11px] text-emerald-400 hover:underline truncate block mt-0.5">
                    {selectedLead.website.replace(/^https?:\/\//, "")}
                  </a>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex flex-col items-end">
                  <span className={`text-2xl font-bold ${scoreColor(selectedLead.score)}`}>{selectedLead.score}</span>
                  <span className="text-[10px] text-muted-foreground">AI score</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {isAuthor && (
                <Badge variant="outline" className="border-violet-500/40 text-violet-300 gap-1">
                  <BookOpen className="size-3" /> Author
                </Badge>
              )}
              <Badge variant="outline" className={`border-${selectedLead.geminiVerified ? "emerald" : "amber"}-500/40 text-${selectedLead.geminiVerified ? "emerald" : "amber"}-400 gap-1`}>
                {selectedLead.geminiVerified ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />}
                {selectedLead.geminiVerified ? "AI verified" : "Unverified"}
              </Badge>
              {selectedLead.email && <Badge variant="secondary" className="gap-1 font-mono text-[10px]"><Mail className="size-3" /> {selectedLead.email}</Badge>}
              {selectedLead.phone && <Badge variant="secondary" className="gap-1 font-mono text-[10px]"><Phone className="size-3" /> {selectedLead.phone}</Badge>}
              {selectedLead.location && <Badge variant="secondary" className="gap-1 text-[10px]"><MapPin className="size-3" /> {selectedLead.location}</Badge>}
              {selectedLead.industry && !isAuthor && <Badge variant="secondary" className="gap-1 text-[10px]"><Building2 className="size-3" /> {selectedLead.industry}</Badge>}
              {selectedLead.bookGenre && isAuthor && <Badge variant="secondary" className="gap-1 text-[10px]"><BookOpen className="size-3" /> {selectedLead.bookGenre}</Badge>}
            </div>
          </SheetHeader>

          <div className="p-0 flex flex-col">
            <Tabs value={detailTab} onValueChange={(v) => setDetailTab(v as any)}>
              <TabsList className="bg-transparent border-b border-border/40 rounded-none w-full h-auto p-0 justify-start gap-4 px-4">
                <TabsTrigger value="overview" className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-400 data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2 text-xs">Overview</TabsTrigger>
                <TabsTrigger value="portfolio" className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-400 data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2 text-xs">Portfolio</TabsTrigger>
                <TabsTrigger value="messages" className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-400 data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2 text-xs">Messages ({messages.length})</TabsTrigger>
                <TabsTrigger value="tasks" className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-400 data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2 text-xs">Tasks ({tasks.filter((t) => !t.completed).length})</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="m-0 p-4 space-y-3 max-h-[60vh] overflow-y-auto scrollbar-thin">
                {selectedLead.leadType === "author" && (selectedLead.bookTitle || selectedLead.bookGenre || selectedLead.bookHook || selectedLead.authorBio) && (
                  <div className="bg-violet-500/8 border border-violet-500/30 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-1.5 text-violet-300 text-[10px] uppercase tracking-wide">
                      <BookOpen className="size-3" /> {selectedLead.bookGenre || "Unknown genre"}
                    </div>
                    {selectedLead.bookTitle && (
                      <p className="text-base font-semibold text-violet-100">"{selectedLead.bookTitle}"</p>
                    )}
                    {selectedLead.bookThemes && (
                      (() => {
                        try {
                          const themes = JSON.parse(selectedLead.bookThemes);
                          if (Array.isArray(themes) && themes.length > 0) {
                            return (
                              <div className="flex flex-wrap gap-1">
                                {themes.map((t, i) => (
                                  <Badge key={i} variant="outline" className="text-[10px] border-violet-500/40 text-violet-200">{t}</Badge>
                                ))}
                              </div>
                            );
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()
                    )}
                    {selectedLead.bookHook && (
                      <div className="text-[11px] bg-amber-500/8 border border-amber-500/30 rounded-md px-2 py-1.5 text-amber-200 mt-2">
                        <b>Specific hook for outreach:</b> {selectedLead.bookHook}
                      </div>
                    )}
                    {selectedLead.authorBio && (
                      <p className="text-xs text-muted-foreground italic mt-2">{selectedLead.authorBio}</p>
                    )}
                  </div>
                )}
                {selectedLead.geminiSummary ? (
                  <div>
                    <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{selectedLead.leadType === "author" ? "AI author summary" : "AI summary"}</Label>
                    <p className="text-sm mt-1">{selectedLead.geminiSummary}</p>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground italic">
                    {selectedLead.leadType === "author"
                      ? "No AI summary yet. Click \"Re-enrich\" below to fetch the author's portfolio + book extraction via Gemini."
                      : "No AI summary yet. Click \"Re-enrich\" below to fetch portfolio + Gemini analysis."}
                  </div>
                )}
                {selectedLead.geminiAngle && (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-md p-3">
                    <Label className="text-[11px] uppercase tracking-wide text-emerald-400">Recommended angle</Label>
                    <p className="text-sm mt-1 text-emerald-200">{selectedLead.geminiAngle}</p>
                  </div>
                )}
                {selectedLead.snippet && (
                  <div>
                    <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Source snippet</Label>
                    <p className="text-xs mt-1 text-muted-foreground italic">{selectedLead.snippet}</p>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 pt-3 border-t border-border/40">
                  <Button variant="outline" size="sm" onClick={() => deleteLead(selectedLead)}>
                    <Trash2 className="size-3.5" /> Delete
                  </Button>
                  <Button onClick={enrichLead} disabled={enriching} size="sm" className="bg-emerald-500 hover:bg-emerald-400 text-black">
                    {enriching ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                    Re-enrich
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="portfolio" className="m-0 p-4 space-y-3 max-h-[60vh] overflow-y-auto scrollbar-thin">
                {portfolio ? (
                  <>
                    <div>
                      <Label className="text-[11px] uppercase text-muted-foreground">Website</Label>
                      <p className="text-sm mt-1 font-medium">{portfolio.siteTitle}</p>
                      <p className="text-xs text-muted-foreground">{portfolio.website}</p>
                    </div>
                    {portfolio.description && (
                      <div>
                        <Label className="text-[11px] uppercase text-muted-foreground">Description</Label>
                        <p className="text-sm mt-1 line-clamp-4">{portfolio.description}</p>
                      </div>
                    )}
                    {portfolio.emails.length > 0 && (
                      <div>
                        <Label className="text-[11px] uppercase text-muted-foreground">Emails found on site</Label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {portfolio.emails.map((e, i) => <Badge key={i} variant="secondary" className="font-mono text-[10px]">{e}</Badge>)}
                        </div>
                      </div>
                    )}
                    {portfolio.phones.length > 0 && (
                      <div>
                        <Label className="text-[11px] uppercase text-muted-foreground">Phones</Label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {portfolio.phones.map((p, i) => <Badge key={i} variant="secondary" className="font-mono text-[10px]">{p}</Badge>)}
                        </div>
                      </div>
                    )}
                    {portfolio.socials.length > 0 && (
                      <div>
                        <Label className="text-[11px] uppercase text-muted-foreground">Social profiles</Label>
                        <ul className="mt-1 space-y-1">
                          {portfolio.socials.map((s, i) => (
                            <li key={i}>
                              <a href={s.url} target="_blank" rel="noreferrer" className="text-xs text-emerald-400 hover:underline inline-flex items-center gap-1">
                                <ChevronRight className="size-3" /> {s.type}: {s.url.replace(/^https?:\/\//, "").slice(0, 50)}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {portfolio.companyInfo.keywords.length > 0 && (
                      <div>
                        <Label className="text-[11px] uppercase text-muted-foreground">Detected keywords</Label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {portfolio.companyInfo.keywords.map((k, i) => <Badge key={i} variant="outline" className="text-[10px]">{k}</Badge>)}
                        </div>
                      </div>
                    )}
                    {portfolio.projects.length > 0 && (
                      <div>
                        <Label className="text-[11px] uppercase text-muted-foreground">Portfolio links</Label>
                        <ul className="mt-1 space-y-1">
                          {portfolio.projects.map((p, i) => (
                            <li key={i}>
                              <a href={p.url} target="_blank" rel="noreferrer" className="text-xs text-emerald-400 hover:underline inline-flex items-center gap-1">
                                <ChevronRight className="size-3" /> {p.title}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8">
                    <Globe className="size-10 mx-auto opacity-30 mb-2" />
                    <p className="text-sm text-muted-foreground">No portfolio yet</p>
                    <Button onClick={enrichLead} disabled={enriching} size="sm" className="mt-3 bg-emerald-500 hover:bg-emerald-400 text-black">
                      {enriching ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                      Enrich portfolio
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="messages" className="m-0 p-4 max-h-[60vh] overflow-y-auto scrollbar-thin space-y-3">
                <div>
                  <Label className="text-[11px] uppercase text-muted-foreground">
                    {isAuthor ? "Generate book-aware outreach" : "Generate new message"}
                  </Label>
                  {isAuthor && (
                    <p className="text-[10px] text-violet-300/80 mt-1 mb-2">
                      Each message references a specific concrete detail from "{selectedLead.bookTitle || "the author's book"}" to catch their attention — not generic praise.
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-1.5 mt-2">
                    {MESSAGE_TYPES.map((t) => {
                      const Icon = t.icon;
                      const label = isAuthor
                        ? (t.id === "cold_email" ? "Author Cold Email"
                          : t.id === "linkedin" ? "LinkedIn DM"
                          : t.id === "followup" ? "Follow-up #1"
                          : t.id === "whatsapp" ? "WhatsApp / SMS"
                          : "Pitch / Proposal")
                        : t.label;
                      return (
                        <Button
                          key={t.id}
                          variant="outline"
                          size="sm"
                          disabled={generatingType === t.id}
                          onClick={() => generateMessage(t.id)}
                          className="justify-start gap-1.5 h-8 text-[11px]"
                        >
                          {generatingType === t.id ? <Loader2 className="size-3 animate-spin" /> : <Icon className="size-3" />}
                          {label}
                        </Button>
                      );
                    })}
                  </div>
                  {!getGeminiKey() && (
                    <p className="text-[10px] text-amber-400/80 mt-2 flex items-center gap-1">
                      <AlertTriangle className="size-3" /> Demo mode — mock messages will be generated. Set Gemini key in Settings.
                    </p>
                  )}
                </div>

                <Separator />

                {messages.length === 0 ? (
                  <div className="text-center py-6">
                    <MessageSquare className="size-8 mx-auto opacity-30 mb-2" />
                    <p className="text-xs text-muted-foreground">No messages generated yet</p>
                  </div>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className="border border-border/40 rounded-lg p-3 bg-background/30">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {MESSAGE_TYPES.find((t) => t.id === m.type)?.label || m.type}
                        </Badge>
                        <div className="flex gap-1">
                          <Tooltip><TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" className="size-6" onClick={() => { navigator.clipboard.writeText(m.content); toast.success("Copied"); }}>
                              <Copy className="size-3" />
                            </Button>
                          </TooltipTrigger><TooltipContent>Copy</TooltipContent></Tooltip>
                        </div>
                      </div>
                      <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed">{m.content}</pre>
                      <p className="text-[10px] text-muted-foreground mt-2">{relativeTime(m.createdAt)}</p>
                    </div>
                  ))
                )}
              </TabsContent>

              <TabsContent value="tasks" className="m-0 p-4 max-h-[60vh] overflow-y-auto scrollbar-thin space-y-3">
                <AddTaskForm onAdd={addTask} />
                <Separator />
                {tasks.length === 0 ? (
                  <div className="text-center py-6">
                    <Clock className="size-8 mx-auto opacity-30 mb-2" />
                    <p className="text-xs text-muted-foreground">No tasks yet. Automation creates a follow-up task 3 days after a lead is added.</p>
                  </div>
                ) : (
                  tasks.map((t) => (
                    <div key={t.id} className="flex items-start gap-3 p-2 rounded-md hover:bg-background/30">
                      <Checkbox checked={t.completed} onToggle={() => toggleTask(t)} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${t.completed ? "line-through text-muted-foreground" : ""}`}>{t.title}</p>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <Badge variant="outline" className="text-[9px]">{t.type}</Badge>
                          {t.dueDate && <span className="flex items-center gap-0.5"><Calendar className="size-2.5" /> {new Date(t.dueDate).toLocaleDateString()}</span>}
                          <span>{relativeTime(t.createdAt)}</span>
                        </div>
                      </div>
                      <Button size="icon" variant="ghost" className="size-6" onClick={() => deleteTask(t)}>
                        <X className="size-3" />
                      </Button>
                    </div>
                  ))
                )}
              </TabsContent>
            </Tabs>
          </div>
        </SheetContent>
      </Sheet>
    );
  }
}

// ---------- Small standalone components ----------

function Checkbox({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`size-5 rounded border shrink-0 mt-0.5 flex items-center justify-center transition-colors ${
        checked ? "bg-emerald-500 border-emerald-500 text-black" : "border-border/60 bg-transparent hover:border-emerald-500/40"
      }`}
      aria-pressed={checked}
    >
      {checked && <Check className="size-3.5" strokeWidth={3} />}
    </button>
  );
}

function AddTaskForm({ onAdd }: { onAdd: (title: string, type: string, dueDate: string) => void }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("followup");
  const [dueDate, setDueDate] = useState("");
  return (
    <div className="border border-border/40 rounded-lg p-3 bg-background/30 space-y-2">
      <Label className="text-[11px] uppercase text-muted-foreground">Add task</Label>
      <Input
        placeholder="Task title..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="h-8 text-xs bg-background/50"
      />
      <div className="flex gap-2">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-8 text-xs bg-background/50 w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="followup">Follow-up</SelectItem>
            <SelectItem value="call">Call</SelectItem>
            <SelectItem value="meeting">Meeting</SelectItem>
            <SelectItem value="research">Research</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="h-8 text-xs bg-background/50 flex-1"
        />
        <Button size="sm" className="h-8 bg-emerald-500 hover:bg-emerald-400 text-black" onClick={() => { onAdd(title, type, dueDate); setTitle(""); setDueDate(""); }}>
          <Plus className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
