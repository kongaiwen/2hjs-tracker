import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Users, UserCheck, Pencil, Trash2, X,
  Calendar, ArrowUpDown, Clock, CheckCircle2, AlertCircle, Mail,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { contactsApi, employersApi } from '@/lib/api';
import { cn, getSegmentColor, formatDate } from '@/lib/utils';
import type { Contact, CreateContactInput, ContactSegment, OutreachStatus } from '@/types';

// ─── helpers ──────────────────────────────────────────────────────────────────

function daysAgo(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

type LatestOutreach = {
  id: string;
  status: OutreachStatus;
  sentAt: string;
  threeB_Date: string;
  sevenB_Date: string;
  followUpSentAt: string | null;
  responseAt: string | null;
  responseType: string | null;
  subject: string;
};

function getNextTask(o: LatestOutreach | undefined): {
  label: string;
  urgency: 'overdue' | 'soon' | 'ok' | 'done' | 'none';
} | null {
  if (!o) return null;

  switch (o.status) {
    case 'AWAITING_3B': {
      const d = daysUntil(o.threeB_Date);
      if (d < 0) return { label: `3B overdue (${Math.abs(d)}d ago)`, urgency: 'overdue' };
      if (d === 0) return { label: '3B checkpoint today', urgency: 'soon' };
      return { label: `3B checkpoint in ${d}d`, urgency: d <= 1 ? 'soon' : 'ok' };
    }
    case 'MOVED_ON':
    case 'AWAITING_7B': {
      const d = daysUntil(o.sevenB_Date);
      if (d < 0) return { label: `7B follow-up overdue (${Math.abs(d)}d ago)`, urgency: 'overdue' };
      if (d === 0) return { label: '7B follow-up today', urgency: 'soon' };
      return { label: `7B follow-up in ${d}d`, urgency: d <= 1 ? 'soon' : 'ok' };
    }
    case 'FOLLOWED_UP':
      return { label: 'Awaiting response after follow-up', urgency: 'ok' };
    case 'RESPONDED':
      return { label: 'Schedule informational', urgency: 'soon' };
    case 'SCHEDULED':
      return { label: 'Informational scheduled', urgency: 'done' };
    case 'COMPLETED':
      return { label: 'Completed', urgency: 'done' };
    case 'NO_RESPONSE':
      return { label: 'No response — closed', urgency: 'none' };
    default:
      return null;
  }
}

function getNextTaskDate(o: LatestOutreach | undefined): string | null {
  if (!o) return null;
  if (['AWAITING_3B'].includes(o.status)) return o.threeB_Date;
  if (['AWAITING_7B', 'MOVED_ON'].includes(o.status)) return o.sevenB_Date;
  return o.sentAt;
}

type ViewTab = 'all' | 'uncontacted' | 'active' | 'completed' | 'movedOn';
type SortKey = 'employer' | 'name' | 'lastContacted' | 'nextTask' | 'lampRank';
type OrgType = 'all' | 'companies' | 'networks';

const ACTIVE_STATUSES: OutreachStatus[] = ['AWAITING_3B', 'MOVED_ON', 'AWAITING_7B', 'FOLLOWED_UP'];
const COMPLETED_STATUSES: OutreachStatus[] = ['RESPONDED', 'SCHEDULED', 'COMPLETED', 'NO_RESPONSE'];

// ─── page ─────────────────────────────────────────────────────────────────────

export default function ContactsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [view, setView] = useState<ViewTab>('all');
  const [selectedEmployerId, setSelectedEmployerId] = useState<string | null>(null);
  const [selectedSegment, setSelectedSegment] = useState<string>('');
  const [orgType, setOrgType] = useState<OrgType>('all');
  const [sortBy, setSortBy] = useState<SortKey>('employer');
  const [topXEnabled, setTopXEnabled] = useState(false);
  const [topXCount, setTopXCount] = useState(5);
  const [excludeActiveCompanies, setExcludeActiveCompanies] = useState(false);
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  const { data: employers } = useQuery({
    queryKey: ['employers'],
    queryFn: employersApi.getAll,
  });

  const { data: allContacts, isLoading } = useQuery({
    queryKey: ['contacts'],
    queryFn: contactsApi.getAll,
  });

  const createMutation = useMutation({
    mutationFn: contactsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setIsAddingContact(false);
    },
  });

  const updateSegmentMutation = useMutation({
    mutationFn: ({ id, segment }: { id: string; segment: ContactSegment }) =>
      contactsApi.updateSegment(id, segment),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contacts'] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateContactInput> }) =>
      contactsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setEditingContact(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: contactsApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contacts'] }),
  });

  // ── top X non-network employer IDs (in LAMP rank order) ─────────────────────
  const topXEmployerIds = useMemo(() => {
    const companies = (employers || []).filter(e => !e.isNetworkOrg);
    return companies.slice(0, topXCount).map(e => e.id);
  }, [employers, topXCount]);

  const topXEmployerRank = useMemo(() => {
    const map = new Map<string, number>();
    topXEmployerIds.forEach((id, i) => map.set(id, i));
    return map;
  }, [topXEmployerIds]);

  // ── resolve employer names from decrypted employers list ────────────────────
  const employerNameMap = useMemo(() => {
    const map = new Map<string, string>();
    (employers || []).forEach(e => map.set(e.id, e.name));
    return map;
  }, [employers]);

  // Patch contact employer names (server JOIN returns '[encrypted]' after E2E encryption)
  const patchedContacts = useMemo(() => {
    return (allContacts || []).map(c => {
      const resolvedName = employerNameMap.get(c.employerId);
      if (resolvedName && c.employer && c.employer.name !== resolvedName) {
        return { ...c, employer: { ...c.employer, name: resolvedName } };
      }
      return c;
    });
  }, [allContacts, employerNameMap]);

  const companiesWithActiveOutreach = useMemo(() => {
    const ids = new Set<string>();
    (allContacts || []).forEach(c => {
      const o = (c.outreach as LatestOutreach[] | undefined)?.[0];
      if (o && ACTIVE_STATUSES.includes(o.status as OutreachStatus)) {
        ids.add(c.employerId);
      }
    });
    return ids;
  }, [allContacts]);

  // Employers with MOVED_ON outreach (companies where we've hit 3B and should try another contact)
  const companiesWithMovedOn = useMemo(() => {
    const ids = new Set<string>();
    (allContacts || []).forEach(c => {
      const o = (c.outreach as LatestOutreach[] | undefined)?.[0];
      if (o && o.status === 'MOVED_ON') {
        ids.add(c.employerId);
      }
    });
    return ids;
  }, [allContacts]);

  // ── derived counts for tabs (always based on all contacts) ──────────────────
  const counts = useMemo(() => {
    const all = allContacts || [];
    return {
      all: all.length,
      uncontacted: all.filter(c => !c._count?.outreach || c._count.outreach === 0).length,
      active: all.filter(c => {
        const o = (c.outreach as LatestOutreach[] | undefined)?.[0];
        return o && ACTIVE_STATUSES.includes(o.status as OutreachStatus);
      }).length,
      completed: all.filter(c => {
        const o = (c.outreach as LatestOutreach[] | undefined)?.[0];
        return o && COMPLETED_STATUSES.includes(o.status as OutreachStatus);
      }).length,
      movedOn: all.filter(c => companiesWithMovedOn.has(c.employerId)).length,
      boosters: all.filter(c => c.segment === 'BOOSTER').length,
    };
  }, [allContacts, companiesWithMovedOn]);

  // ── filtered + sorted list ───────────────────────────────────────────────────
  const contacts = useMemo(() => {
    let result = patchedContacts;

    // view filter
    if (view === 'uncontacted') {
      result = result.filter(c => !c._count?.outreach || c._count.outreach === 0);
    } else if (view === 'active') {
      result = result.filter(c => {
        const o = (c.outreach as LatestOutreach[] | undefined)?.[0];
        return o && ACTIVE_STATUSES.includes(o.status as OutreachStatus);
      });
    } else if (view === 'completed') {
      result = result.filter(c => {
        const o = (c.outreach as LatestOutreach[] | undefined)?.[0];
        return o && COMPLETED_STATUSES.includes(o.status as OutreachStatus);
      });
    } else if (view === 'movedOn') {
      // Contacts at companies where someone has hit MOVED_ON status
      // Show all contacts at these companies (including those already contacted)
      result = result.filter(c => companiesWithMovedOn.has(c.employerId));
    }

    // org type filter
    if (orgType !== 'all') {
      const employerMap = new Map((employers || []).map(e => [e.id, e]));
      result = result.filter(c => {
        const emp = employerMap.get(c.employerId);
        return orgType === 'networks' ? emp?.isNetworkOrg : !emp?.isNetworkOrg;
      });
    }

    // employer filter
    if (selectedEmployerId) {
      result = result.filter(c => c.employerId === selectedEmployerId);
    }

    // segment filter
    if (selectedSegment) {
      result = result.filter(c => c.segment === selectedSegment);
    }

    // top X companies filter
    if (topXEnabled) {
      const topIds = new Set(topXEmployerIds);
      result = result.filter(c => topIds.has(c.employerId));
    }

    // exclude companies with active outreach
    if (excludeActiveCompanies) {
      result = result.filter(c => !companiesWithActiveOutreach.has(c.employerId));
    }

    // sort
    return [...result].sort((a, b) => {
      const ao = (a.outreach as LatestOutreach[] | undefined)?.[0];
      const bo = (b.outreach as LatestOutreach[] | undefined)?.[0];
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'lastContacted': {
          if (!ao && !bo) return 0;
          if (!ao) return 1;
          if (!bo) return -1;
          return new Date(bo.sentAt).getTime() - new Date(ao.sentAt).getTime();
        }
        case 'nextTask': {
          const an = getNextTaskDate(ao);
          const bn = getNextTaskDate(bo);
          if (!an && !bn) return 0;
          if (!an) return 1;
          if (!bn) return -1;
          return new Date(an).getTime() - new Date(bn).getTime();
        }
        case 'lampRank': {
          const ar = topXEmployerRank.get(a.employerId) ?? 999;
          const br = topXEmployerRank.get(b.employerId) ?? 999;
          if (ar !== br) return ar - br;
          return a.priority - b.priority;
        }
        case 'employer':
        default:
          return (a.employer?.name || '').localeCompare(b.employer?.name || '');
      }
    });
  }, [patchedContacts, view, selectedEmployerId, selectedSegment, orgType, sortBy, topXEnabled, topXEmployerIds, topXEmployerRank, excludeActiveCompanies, companiesWithActiveOutreach, employers]);

  const showOutreachColumns = view !== 'uncontacted';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Contacts</h1>
          <p className="text-muted-foreground mt-1">
            Track Boosters, Obligates, and Curmudgeons — and who still needs a first touch
          </p>
        </div>
        <button
          onClick={() => setIsAddingContact(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" />
          Add Contact
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard icon={Users} label="Not Contacted" count={counts.uncontacted}
          color="bg-slate-100 text-slate-600"
          active={view === 'uncontacted'} onClick={() => setView('uncontacted')} />
        <StatCard icon={Clock} label="Active Outreach" count={counts.active}
          color="bg-blue-100 text-blue-700"
          active={view === 'active'} onClick={() => setView('active')} />
        <StatCard icon={CheckCircle2} label="Responded/Done" count={counts.completed}
          color="bg-purple-100 text-purple-700"
          active={view === 'completed'} onClick={() => setView('completed')} />
        <StatCard icon={UserCheck} label="Boosters" count={counts.boosters}
          color="bg-green-100 text-green-700"
          active={false} onClick={() => { setView('all'); setSelectedSegment('BOOSTER'); }} />
      </div>

      {/* View tabs + controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Tabs */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          {([
            ['all', 'All', counts.all],
            ['uncontacted', 'Not Contacted', counts.uncontacted],
            ['active', 'Active', counts.active],
            ['completed', 'Done', counts.completed],
            ['movedOn', 'Next @ Active Companies', counts.movedOn],
          ] as [ViewTab, string, number][]).map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={cn(
                'px-4 py-2 text-sm font-medium border-r border-border last:border-r-0 transition-colors',
                view === key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card hover:bg-muted'
              )}
            >
              {label}
              <span className={cn(
                'ml-1.5 px-1.5 py-0.5 rounded text-xs',
                view === key ? 'bg-primary-foreground/20' : 'bg-muted-foreground/20'
              )}>
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* Sort + filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Sort */}
          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="text-sm px-2 py-1.5 border border-border rounded-lg bg-background"
            >
              <option value="employer">Sort: Employer</option>
              <option value="name">Sort: Name</option>
              <option value="lastContacted">Sort: Last Contacted</option>
              {view !== 'uncontacted' && <option value="nextTask">Sort: Next Task</option>}
              <option value="lampRank">Sort: LAMP Rank</option>
            </select>
          </div>

          {/* Org type filter */}
          <select
            value={orgType}
            onChange={(e) => setOrgType(e.target.value as OrgType)}
            className="text-sm px-2 py-1.5 border border-border rounded-lg bg-background"
          >
            <option value="all">All Org Types</option>
            <option value="companies">Companies Only</option>
            <option value="networks">Networks & Affinity</option>
          </select>

          {/* Employer filter */}
          <select
            value={selectedEmployerId || ''}
            onChange={(e) => setSelectedEmployerId(e.target.value || null)}
            className="text-sm px-2 py-1.5 border border-border rounded-lg bg-background"
          >
            <option value="">All Organizations</option>
            {employers?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.isNetworkOrg ? '◈ ' : ''}{e.name}
              </option>
            ))}
          </select>

          {/* Segment filter */}
          <select
            value={selectedSegment}
            onChange={(e) => setSelectedSegment(e.target.value)}
            className="text-sm px-2 py-1.5 border border-border rounded-lg bg-background"
          >
            <option value="">All Segments</option>
            <option value="UNKNOWN">Unknown</option>
            <option value="BOOSTER">Boosters</option>
            <option value="OBLIGATE">Obligates</option>
            <option value="CURMUDGEON">Curmudgeons</option>
          </select>

          {/* Top X companies filter */}
          <div className="flex items-center">
            <button
              onClick={() => setTopXEnabled(v => !v)}
              className={cn(
                'text-sm px-2 py-1.5 border-y border-l rounded-l-lg transition-colors',
                topXEnabled ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:bg-muted'
              )}
            >
              Top
            </button>
            <input
              type="number"
              min={1}
              max={50}
              value={topXCount}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val > 0) { setTopXCount(val); setTopXEnabled(true); }
              }}
              className={cn(
                'w-12 text-sm px-1 py-1.5 border-y text-center bg-background',
                topXEnabled ? 'border-primary' : 'border-border'
              )}
            />
            <button
              onClick={() => setTopXEnabled(v => !v)}
              className={cn(
                'text-sm px-2 py-1.5 border-y border-r rounded-r-lg transition-colors',
                topXEnabled ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:bg-muted text-muted-foreground'
              )}
            >
              cos.
            </button>
          </div>

          {/* Exclude companies with active outreach */}
          <button
            onClick={() => setExcludeActiveCompanies(v => !v)}
            className={cn(
              'text-sm px-2 py-1.5 border rounded-lg transition-colors whitespace-nowrap',
              excludeActiveCompanies
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-border hover:bg-muted'
            )}
          >
            Skip active orgs
          </button>

          {/* Clear filters */}
          {(selectedEmployerId || selectedSegment || orgType !== 'all' || view !== 'all' || topXEnabled || excludeActiveCompanies) && (
            <button
              onClick={() => { setView('all'); setSelectedEmployerId(null); setSelectedSegment(''); setOrgType('all'); setTopXEnabled(false); setExcludeActiveCompanies(false); }}
              className="text-sm px-2 py-1.5 text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Top X info banner */}
      {topXEnabled && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            Filtering to contacts from your top {Math.min(topXCount, topXEmployerIds.length)} LAMP-ranked companies.
          </span>
        </div>
      )}

      {/* Forms */}
      {isAddingContact && (
        <ContactForm
          employerId={selectedEmployerId}
          employers={employers || []}
          onSave={(data) => createMutation.mutate(data as CreateContactInput)}
          onCancel={() => setIsAddingContact(false)}
          isLoading={createMutation.isPending}
        />
      )}
      {editingContact && (
        <ContactForm
          contact={editingContact}
          employerId={editingContact.employerId}
          employers={employers || []}
          onSave={(data) => updateMutation.mutate({ id: editingContact.id, data })}
          onCancel={() => setEditingContact(null)}
          isLoading={updateMutation.isPending}
        />
      )}

      {/* Table */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading contacts...</div>
        ) : !contacts.length ? (
          <div className="p-8 text-center text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="mb-1">No contacts in this view</p>
            <p className="text-sm">Try a different filter or tab</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left p-4 font-semibold">#</th>
                  <th className="text-left p-4 font-semibold">Name</th>
                  <th className="text-left p-4 font-semibold">Organization</th>
                  <th className="text-left p-4 font-semibold">Title</th>
                  {showOutreachColumns && (
                    <>
                      <th className="text-left p-4 font-semibold">Last Contacted</th>
                      <th className="text-left p-4 font-semibold">Next Task</th>
                    </>
                  )}
                  <th className="text-center p-4 font-semibold">Segment</th>
                  <th className="text-left p-4 font-semibold">Traits</th>
                  <th className="text-right p-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => {
                  const latest = (contact.outreach as LatestOutreach[] | undefined)?.[0];
                  const nextTask = getNextTask(latest);
                  return (
                    <tr
                      key={contact.id}
                      className={cn(
                        'border-b border-border hover:bg-muted/30',
                        contact.linkedInUrl && 'cursor-pointer'
                      )}
                      onClick={() => {
                        if (contact.linkedInUrl) window.open(contact.linkedInUrl, '_blank', 'noopener,noreferrer');
                      }}
                    >
                      <td className="p-4 text-muted-foreground">{contact.priority}</td>
                      <td className="p-4 font-medium">{contact.name}</td>
                      <td className="p-4 text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          {topXEnabled && topXEmployerRank.has(contact.employerId) && (
                            <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold flex-shrink-0">
                              {(topXEmployerRank.get(contact.employerId) ?? 0) + 1}
                            </span>
                          )}
                          <span>{contact.employer?.name || '—'}</span>
                          {employers?.find(e => e.id === contact.employerId)?.isNetworkOrg && (
                            <span className="px-1 py-0.5 rounded text-xs bg-violet-100 text-violet-700">Network</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-muted-foreground text-sm">{contact.title || '—'}</td>

                      {showOutreachColumns && (
                        <>
                          {/* Last Contacted */}
                          <td className="p-4 text-sm">
                            {latest ? (
                              <div>
                                <p className="font-medium">{daysAgo(latest.sentAt)}</p>
                                <p className="text-muted-foreground">{formatDate(latest.sentAt)}</p>
                              </div>
                            ) : (
                              <span className="text-muted-foreground italic">Never</span>
                            )}
                          </td>

                          {/* Next Task */}
                          <td className="p-4 text-sm">
                            {nextTask ? (
                              <span className={cn(
                                'inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium',
                                nextTask.urgency === 'overdue' && 'bg-red-100 text-red-800',
                                nextTask.urgency === 'soon' && 'bg-amber-100 text-amber-800',
                                nextTask.urgency === 'ok' && 'bg-blue-100 text-blue-800',
                                nextTask.urgency === 'done' && 'bg-green-100 text-green-800',
                                nextTask.urgency === 'none' && 'bg-slate-100 text-slate-600',
                              )}>
                                {nextTask.urgency === 'overdue' && <AlertCircle className="w-3 h-3" />}
                                {nextTask.urgency === 'done' && <CheckCircle2 className="w-3 h-3" />}
                                {nextTask.label}
                              </span>
                            ) : (
                              <span className="text-muted-foreground italic">—</span>
                            )}
                          </td>
                        </>
                      )}

                      {/* Segment */}
                      <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={contact.segment}
                          onChange={(e) =>
                            updateSegmentMutation.mutate({ id: contact.id, segment: e.target.value as ContactSegment })
                          }
                          className={cn(
                            'px-2 py-1 rounded border text-xs font-medium',
                            getSegmentColor(contact.segment)
                          )}
                        >
                          <option value="UNKNOWN">Unknown</option>
                          <option value="BOOSTER">Booster</option>
                          <option value="OBLIGATE">Obligate</option>
                          <option value="CURMUDGEON">Curmudgeon</option>
                        </select>
                      </td>

                      {/* Traits */}
                      <td className="p-4">
                        <div className="flex gap-1 flex-wrap">
                          {contact.isFunctionallyRelevant && (
                            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">Functional</span>
                          )}
                          {contact.isAlumni && (
                            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">Alumni</span>
                          )}
                          {contact.levelAboveTarget > 0 && (
                            <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-xs">
                              +{contact.levelAboveTarget}
                            </span>
                          )}
                          {!contact.isFunctionallyRelevant && !contact.isAlumni && contact.levelAboveTarget === 0 && (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {!latest && (
                            <button
                              onClick={() => navigate('/outreach')}
                              className="p-1.5 rounded hover:bg-blue-100 transition-colors"
                              title="Start outreach"
                            >
                              <Mail className="w-4 h-4 text-blue-500" />
                            </button>
                          )}
                          {contact.segment === 'BOOSTER' && (
                            <button
                              onClick={() => navigate(`/calendar?contactId=${contact.id}`)}
                              className="p-1.5 rounded hover:bg-green-100 transition-colors"
                              title="Schedule informational"
                            >
                              <Calendar className="w-4 h-4 text-green-600" />
                            </button>
                          )}
                          <button
                            onClick={() => setEditingContact(contact)}
                            className="p-1.5 rounded hover:bg-muted transition-colors"
                            title="Edit contact"
                          >
                            <Pencil className="w-4 h-4 text-muted-foreground" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Delete ${contact.name}?`)) deleteMutation.mutate(contact.id);
                            }}
                            className="p-1.5 rounded hover:bg-red-100 transition-colors"
                            title="Delete contact"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── sub-components ───────────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  count: number;
  color: string;
  active: boolean;
  onClick: () => void;
}

function StatCard({ icon: Icon, label, count, color, active, onClick }: StatCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'bg-card rounded-lg border p-4 text-left transition-all hover:shadow-sm',
        active ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/40'
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', color)}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{count}</p>
        </div>
      </div>
    </button>
  );
}

interface ContactFormProps {
  contact?: Contact;
  employerId: string | null;
  employers: Array<{ id: string; name: string }>;
  onSave: (data: CreateContactInput | Partial<CreateContactInput>) => void;
  onCancel: () => void;
  isLoading: boolean;
}

function ContactForm({ contact, employerId, employers, onSave, onCancel, isLoading }: ContactFormProps) {
  const [data, setData] = useState<CreateContactInput>({
    employerId: contact?.employerId || employerId || '',
    name: contact?.name || '',
    title: contact?.title || '',
    email: contact?.email || '',
    linkedInUrl: contact?.linkedInUrl || '',
    phone: contact?.phone || '',
    isFunctionallyRelevant: contact?.isFunctionallyRelevant || false,
    isAlumni: contact?.isAlumni || false,
    levelAboveTarget: contact?.levelAboveTarget || 0,
    contactMethod: contact?.contactMethod || null,
    notes: contact?.notes || '',
  });

  const isEditing = !!contact;

  return (
    <div className="bg-card rounded-lg border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">{isEditing ? 'Edit Contact' : 'Add New Contact'}</h3>
        <button onClick={onCancel} className="p-1 hover:bg-muted rounded">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Organization *</label>
          <select
            value={data.employerId}
            onChange={(e) => setData({ ...data, employerId: e.target.value })}
            className="w-full px-4 py-2 border border-border rounded-lg bg-background"
          >
            <option value="">Select an organization</option>
            {employers.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Name *</label>
          <input
            type="text"
            value={data.name}
            onChange={(e) => setData({ ...data, name: e.target.value })}
            className="w-full px-4 py-2 border border-border rounded-lg bg-background"
            placeholder="Contact name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Title</label>
          <input
            type="text"
            value={data.title || ''}
            onChange={(e) => setData({ ...data, title: e.target.value })}
            className="w-full px-4 py-2 border border-border rounded-lg bg-background"
            placeholder="Job title"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            value={data.email || ''}
            onChange={(e) => setData({ ...data, email: e.target.value })}
            className="w-full px-4 py-2 border border-border rounded-lg bg-background"
            placeholder="email@example.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">LinkedIn URL</label>
          <input
            type="url"
            value={data.linkedInUrl || ''}
            onChange={(e) => setData({ ...data, linkedInUrl: e.target.value })}
            className="w-full px-4 py-2 border border-border rounded-lg bg-background"
            placeholder="https://linkedin.com/in/..."
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Contact Method</label>
          <select
            value={data.contactMethod || ''}
            onChange={(e) => setData({ ...data, contactMethod: (e.target.value as any) || null })}
            className="w-full px-4 py-2 border border-border rounded-lg bg-background"
          >
            <option value="">Select method</option>
            <option value="LINKEDIN_GROUP">LinkedIn Group</option>
            <option value="DIRECT_EMAIL_ALUMNI">Direct Email (Alumni)</option>
            <option value="DIRECT_EMAIL_HUNTER">Direct Email (Hunter.io)</option>
            <option value="FAN_MAIL">Fan Mail</option>
            <option value="LINKEDIN_CONNECT">LinkedIn Connect</option>
            <option value="SOCIAL_MEDIA">Social Media</option>
            <option value="SECOND_DEGREE">Second Degree</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Level Above Target</label>
          <select
            value={data.levelAboveTarget}
            onChange={(e) => setData({ ...data, levelAboveTarget: parseInt(e.target.value) })}
            className="w-full px-4 py-2 border border-border rounded-lg bg-background"
          >
            <option value={0}>Same level</option>
            <option value={1}>1 level above</option>
            <option value={2}>2 levels above</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Phone</label>
          <input
            type="tel"
            value={data.phone || ''}
            onChange={(e) => setData({ ...data, phone: e.target.value })}
            className="w-full px-4 py-2 border border-border rounded-lg bg-background"
            placeholder="Phone number"
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="block text-sm font-medium mb-1">Notes</label>
        <textarea
          value={data.notes || ''}
          onChange={(e) => setData({ ...data, notes: e.target.value })}
          className="w-full px-4 py-2 border border-border rounded-lg bg-background"
          rows={2}
          placeholder="Any notes about this contact..."
        />
      </div>

      <div className="flex gap-6 mt-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={data.isFunctionallyRelevant}
            onChange={(e) => setData({ ...data, isFunctionallyRelevant: e.target.checked })}
            className="rounded"
          />
          <span className="text-sm">Functionally Relevant</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={data.isAlumni}
            onChange={(e) => setData({ ...data, isAlumni: e.target.checked })}
            className="rounded"
          />
          <span className="text-sm">Alumni/Affinity</span>
        </label>
      </div>

      <div className="flex justify-end gap-2 mt-6">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg border border-border hover:bg-muted"
        >
          Cancel
        </button>
        <button
          onClick={() => data.name && data.employerId && onSave(data)}
          disabled={!data.name || !data.employerId || isLoading}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isLoading ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Contact'}
        </button>
      </div>
    </div>
  );
}
