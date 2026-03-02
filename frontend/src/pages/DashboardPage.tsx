import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  Users,
  Send,
  AlertCircle,
  Clock,
  CheckCircle2,
  ArrowRight,
  Calendar,
  Phone,
  Video,
} from 'lucide-react';
import { outreachApi, employersApi, informationalsApi } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { usePatchedOutreach, usePatchedInformationals } from '@/hooks/useDecryptedData';

export default function DashboardPage() {
  const { data: reminders, isLoading: remindersLoading } = useQuery({
    queryKey: ['reminders'],
    queryFn: outreachApi.getToday,
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['outreach-stats'],
    queryFn: outreachApi.getStats,
  });

  const { data: topFive, isLoading: topFiveLoading } = useQuery({
    queryKey: ['top-five'],
    queryFn: employersApi.getTopFive,
  });

  const { data: informationalDigest, isLoading: digestLoading } = useQuery({
    queryKey: ['informationals', 'digest'],
    queryFn: informationalsApi.getDigest,
  });

  // Patch outreach reminders with decrypted employer and contact names
  const patchedReminders = usePatchedOutreach(
    reminders?.threeBReminders?.concat(
      reminders?.sevenBReminders || [],
      reminders?.overdue3B || [],
      reminders?.overdue7B || []
    ) || []
  );

  // Patch informationals with decrypted names
  const patchedInformationals = usePatchedInformationals(
    informationalDigest?.today?.concat(
      informationalDigest?.needsPreparation || [],
      informationalDigest?.thisWeek || []
    ) || []
  );

  // Reconstruct patched reminders object
  const patchedRemindersObject = useMemo(() => {
    if (!reminders || !patchedReminders.patchedOutreach) return reminders;

    const patched = patchedReminders.patchedOutreach;
    const threeBCount = reminders.threeBReminders?.length || 0;
    const sevenBCount = reminders.sevenBReminders?.length || 0;
    const overdue3BCount = reminders.overdue3B?.length || 0;
    const overdue7BCount = reminders.overdue7B?.length || 0;

    return {
      ...reminders,
      threeBReminders: patched.slice(0, threeBCount),
      sevenBReminders: patched.slice(threeBCount, threeBCount + sevenBCount),
      overdue3B: patched.slice(threeBCount + sevenBCount, threeBCount + sevenBCount + overdue3BCount),
      overdue7B: patched.slice(threeBCount + sevenBCount + overdue3BCount),
    };
  }, [reminders, patchedReminders]);

  // Reconstruct patched informationals digest
  const patchedDigest = useMemo(() => {
    if (!informationalDigest || !patchedInformationals.patchedInformationals) return informationalDigest;

    const patched = patchedInformationals.patchedInformationals;
    const todayCount = informationalDigest.today?.length || 0;
    const needsPrepCount = informationalDigest.needsPreparation?.length || 0;

    return {
      ...informationalDigest,
      today: patched.slice(0, todayCount),
      needsPreparation: patched.slice(todayCount, todayCount + needsPrepCount),
      thisWeek: patched.slice(todayCount + needsPrepCount),
    };
  }, [informationalDigest, patchedInformationals]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Track your 2-Hour Job Search progress
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          icon={Building2}
          label="Top 5 Employers"
          value={topFive?.length || 0}
          subtext="Active targets"
          loading={topFiveLoading}
        />
        <StatCard
          icon={Send}
          label="Emails Sent"
          value={stats?.totalSent || 0}
          subtext={`${stats?.responseRate || '0%'} response rate`}
          loading={statsLoading}
        />
        <StatCard
          icon={Users}
          label="Boosters Found"
          value={stats?.totalBoosters || 0}
          subtext="Helpful contacts"
          loading={statsLoading}
          highlight
        />
        <StatCard
          icon={AlertCircle}
          label="Actions Needed"
          value={patchedRemindersObject?.summary.totalActionRequired || 0}
          subtext="3B/7B reminders"
          loading={remindersLoading}
          alert={!!patchedRemindersObject?.summary.totalActionRequired}
        />
        <StatCard
          icon={Calendar}
          label="Informationals"
          value={patchedDigest?.summary.todayCount || 0}
          subtext={`${patchedDigest?.summary.weekCount || 0} this week`}
          loading={digestLoading}
          highlight={!!patchedDigest?.summary.todayCount}
        />
      </div>

      {/* Upcoming Informationals */}
      {patchedDigest && (patchedDigest.today.length > 0 || patchedDigest.needsPreparation.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {patchedDigest.today.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Today's Informationals
              </h3>
              <div className="space-y-2">
                {patchedDigest.today.map((inf) => (
                  <div key={inf.id} className="flex items-center justify-between bg-white/50 rounded p-2">
                    <div>
                      <p className="font-medium">{inf.contact?.name}</p>
                      <p className="text-sm text-blue-700">{inf.contact?.employer?.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        {new Date(inf.scheduledAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </p>
                      <p className="text-xs text-blue-600 flex items-center gap-1">
                        {inf.method === 'VIDEO' ? <Video className="w-3 h-3" /> : <Phone className="w-3 h-3" />}
                        {inf.method}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <Link to="/calendar" className="text-sm text-blue-700 hover:underline mt-2 inline-block">
                View calendar →
              </Link>
            </div>
          )}
          {patchedDigest.needsPreparation.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h3 className="font-semibold text-amber-800 mb-3 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                Needs Preparation
              </h3>
              <div className="space-y-2">
                {patchedDigest.needsPreparation.slice(0, 3).map((inf) => (
                  <div key={inf.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-amber-900">{inf.contact?.name}</p>
                      <p className="text-sm text-amber-700">{inf.contact?.employer?.name}</p>
                    </div>
                    <p className="text-sm text-amber-600">{formatDate(inf.scheduledAt)}</p>
                  </div>
                ))}
              </div>
              <Link to="/calendar" className="text-sm text-amber-700 hover:underline mt-2 inline-block">
                Prepare now →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Actions */}
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Today's Actions</h2>
            <Link
              to="/outreach"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {remindersLoading ? (
            <div className="text-muted-foreground">Loading...</div>
          ) : patchedRemindersObject?.summary.totalActionRequired === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="text-muted-foreground">
                All caught up! No actions needed today.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* 3B Reminders */}
              {(patchedRemindersObject?.threeBReminders.length || 0) > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    3B: Try new contact
                  </h3>
                  <ul className="space-y-2">
                    {patchedRemindersObject?.threeBReminders.map((o) => (
                      <ReminderItem
                        key={o.id}
                        type="3B"
                        employer={o.employer?.name || ''}
                        contact={o.contact?.name || ''}
                      />
                    ))}
                  </ul>
                </div>
              )}

              {/* 7B Reminders */}
              {(patchedRemindersObject?.sevenBReminders.length || 0) > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    7B: Follow up
                  </h3>
                  <ul className="space-y-2">
                    {patchedRemindersObject?.sevenBReminders.map((o) => (
                      <ReminderItem
                        key={o.id}
                        type="7B"
                        employer={o.employer?.name || ''}
                        contact={o.contact?.name || ''}
                      />
                    ))}
                  </ul>
                </div>
              )}

              {/* Overdue */}
              {((patchedRemindersObject?.overdue3B.length || 0) + (patchedRemindersObject?.overdue7B.length || 0)) > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-destructive mb-2 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Overdue
                  </h3>
                  <ul className="space-y-2">
                    {patchedRemindersObject?.overdue3B.map((o) => (
                      <ReminderItem
                        key={o.id}
                        type="3B"
                        employer={o.employer?.name || ''}
                        contact={o.contact?.name || ''}
                        overdue
                      />
                    ))}
                    {patchedRemindersObject?.overdue7B.map((o) => (
                      <ReminderItem
                        key={o.id}
                        type="7B"
                        employer={o.employer?.name || ''}
                        contact={o.contact?.name || ''}
                        overdue
                      />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Top 5 Employers */}
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Top 5 Employers</h2>
            <Link
              to="/lamp"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              LAMP List <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {topFiveLoading ? (
            <div className="text-muted-foreground">Loading...</div>
          ) : !topFive?.length ? (
            <div className="text-center py-8">
              <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground mb-4">
                No employers added yet. Start building your LAMP list!
              </p>
              <Link
                to="/lamp"
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90"
              >
                Add Employers
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {topFive.map((employer, index) => (
                <li
                  key={employer.id}
                  className="flex items-center gap-4 p-3 rounded-lg bg-muted/50"
                >
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{employer.name}</p>
                    <p className="text-sm text-muted-foreground">
                      M:{employer.motivation} P:{employer.posting} A:
                      {employer.advocacy ? 'Y' : 'N'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {employer._count?.contacts || 0} contacts
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Quick Tips */}
      <div className="bg-card rounded-lg border border-border p-6">
        <h2 className="text-lg font-semibold mb-4">2HJS Quick Reference</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <TipCard
            title="LAMP List"
            items={[
              'L: 40+ employers',
              'A: Alumni/Advocacy (Y/N)',
              'M: Motivation (0-3)',
              'P: Posting (1-3)',
            ]}
          />
          <TipCard
            title="6-Point Email"
            items={[
              '< 75 words',
              'Ask for advice, not jobs',
              'State connection first',
              'Question ending in "?"',
            ]}
          />
          <TipCard
            title="3B7 Routine"
            items={[
              '3B: Try new contact',
              '7B: Follow up once',
              '20-40% response rate is normal',
              'Focus on finding Boosters!',
            ]}
          />
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: number | string;
  subtext: string;
  loading?: boolean;
  highlight?: boolean;
  alert?: boolean;
}

function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
  loading,
  highlight,
  alert,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'bg-card rounded-lg border border-border p-6',
        highlight && 'border-green-500/50 bg-green-500/5',
        alert && 'border-destructive/50 bg-destructive/5'
      )}
    >
      <div className="flex items-center gap-4">
        <div
          className={cn(
            'w-12 h-12 rounded-lg flex items-center justify-center',
            highlight ? 'bg-green-500/20' : alert ? 'bg-destructive/20' : 'bg-primary/10'
          )}
        >
          <Icon
            className={cn(
              'w-6 h-6',
              highlight ? 'text-green-500' : alert ? 'text-destructive' : 'text-primary'
            )}
          />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          {loading ? (
            <div className="h-8 w-16 bg-muted animate-pulse rounded" />
          ) : (
            <p className="text-2xl font-bold">{value}</p>
          )}
          <p className="text-xs text-muted-foreground">{subtext}</p>
        </div>
      </div>
    </div>
  );
}

interface ReminderItemProps {
  type: '3B' | '7B';
  employer: string;
  contact: string;
  overdue?: boolean;
}

function ReminderItem({ type, employer, contact, overdue }: ReminderItemProps) {
  return (
    <li
      className={cn(
        'flex items-center justify-between p-3 rounded-lg border',
        overdue ? 'bg-destructive/10 border-destructive/30' : 'bg-muted/50 border-transparent'
      )}
    >
      <div>
        <p className="font-medium">{employer}</p>
        <p className="text-sm text-muted-foreground">{contact}</p>
      </div>
      <span
        className={cn(
          'text-xs font-bold px-2 py-1 rounded',
          type === '3B' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
        )}
      >
        {type}
      </span>
    </li>
  );
}

interface TipCardProps {
  title: string;
  items: string[];
}

function TipCard({ title, items }: TipCardProps) {
  return (
    <div className="bg-muted/50 rounded-lg p-4">
      <h3 className="font-semibold mb-2">{title}</h3>
      <ul className="text-sm text-muted-foreground space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="text-primary">•</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
