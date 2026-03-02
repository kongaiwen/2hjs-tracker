import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  Video,
  Phone,
  Users,
  Plus,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { informationalsApi, googleApi, contactsApi, outreachApi } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { usePatchedOutreach, usePatchedInformationals } from '@/hooks/useDecryptedData';
import type { Informational, MeetingMethod, TimeSlot, Outreach } from '@/types';

// Calendar helper functions
function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Add days from previous month to fill first week
  const startDay = firstDay.getDay();
  for (let i = startDay - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push(d);
  }

  // Add all days of current month
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(new Date(year, month, i));
  }

  // Add days from next month to fill last week
  const endDay = lastDay.getDay();
  for (let i = 1; i < 7 - endDay; i++) {
    days.push(new Date(year, month + 1, i));
  }

  return days;
}

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function CalendarPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [preselectedContactId, setPreselectedContactId] = useState<string | null>(null);

  // Check for contactId in URL params (from Contacts page redirect)
  useEffect(() => {
    const contactId = searchParams.get('contactId');
    if (contactId) {
      setPreselectedContactId(contactId);
      setShowScheduleModal(true);
      // Clear the URL param
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const days = useMemo(() => getDaysInMonth(year, month), [year, month]);

  // Fetch informationals for current month
  const monthStart = new Date(year, month, 1).toISOString();
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

  const { data: informationals } = useQuery({
    queryKey: ['informationals', 'calendar', year, month],
    queryFn: () => informationalsApi.getAll({ from: monthStart, to: monthEnd }),
  });

  // Use patched data with decrypted names
  const { patchedInformationals } = usePatchedInformationals(informationals);

  const { data: digest } = useQuery({
    queryKey: ['informationals', 'digest'],
    queryFn: informationalsApi.getDigest,
  });

  const { data: googleStatus } = useQuery({
    queryKey: ['google-status'],
    queryFn: googleApi.getStatus,
  });

  // Fetch outreach for 3B/7B reminders
  const { data: outreachData } = useQuery({
    queryKey: ['outreach'],
    queryFn: outreachApi.getAll,
  });

  // Use patched data with decrypted names for outreach
  const { patchedOutreach } = usePatchedOutreach(outreachData);

  // Group informationals by date
  const informalsByDate = useMemo(() => {
    const map = new Map<string, Informational[]>();
    patchedInformationals?.forEach((inf) => {
      const dateKey = new Date(inf.scheduledAt).toDateString();
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(inf);
    });
    return map;
  }, [patchedInformationals]);

  // Group 3B/7B reminders by date
  const remindersByDate = useMemo(() => {
    const map = new Map<string, { threeB: Outreach[]; sevenB: Outreach[] }>();
    (patchedOutreach || []).forEach((o) => {
      if (o.status === 'AWAITING_3B' && o.threeB_Date) {
        const dateKey = new Date(o.threeB_Date).toDateString();
        if (!map.has(dateKey)) map.set(dateKey, { threeB: [], sevenB: [] });
        map.get(dateKey)!.threeB.push(o);
      }
      if ((o.status === 'AWAITING_7B' || o.status === 'MOVED_ON') && o.sevenB_Date) {
        const dateKey = new Date(o.sevenB_Date).toDateString();
        if (!map.has(dateKey)) map.set(dateKey, { threeB: [], sevenB: [] });
        map.get(dateKey)!.sevenB.push(o);
      }
    });
    return map;
  }, [patchedOutreach]);

  const navigateMonth = (delta: number) => {
    setCurrentDate(new Date(year, month + delta, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
    setSelectedDate(new Date());
  };

  const today = new Date();

  // Get informationals and reminders for selected date
  const selectedDateInformationals = selectedDate
    ? informalsByDate.get(selectedDate.toDateString()) || []
    : [];
  const selectedDateReminders = selectedDate
    ? remindersByDate.get(selectedDate.toDateString()) || { threeB: [], sevenB: [] }
    : { threeB: [], sevenB: [] };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Calendar</h1>
          <p className="text-muted-foreground mt-1">
            Schedule and track informational interviews
          </p>
        </div>
        <button
          onClick={() => {
            setSelectedDate(new Date());
            setShowScheduleModal(true);
          }}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" />
          Schedule Informational
        </button>
      </div>

      {/* Digest Summary */}
      {digest && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center gap-2 text-blue-600 mb-1">
              <CalendarIcon className="w-4 h-4" />
              <span className="text-sm font-medium">Today</span>
            </div>
            <p className="text-2xl font-bold">{digest.summary.todayCount}</p>
          </div>
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center gap-2 text-green-600 mb-1">
              <Clock className="w-4 h-4" />
              <span className="text-sm font-medium">This Week</span>
            </div>
            <p className="text-2xl font-bold">{digest.summary.weekCount}</p>
          </div>
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center gap-2 text-amber-600 mb-1">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm font-medium">Needs Prep</span>
            </div>
            <p className="text-2xl font-bold">{digest.summary.needsPrepCount}</p>
          </div>
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center gap-2 text-red-600 mb-1">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm font-medium">Overdue</span>
            </div>
            <p className="text-2xl font-bold">{digest.summary.overdueCount}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Calendar Grid */}
        <div className="col-span-2 bg-card rounded-lg border border-border">
          {/* Calendar Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigateMonth(-1)}
                className="p-2 hover:bg-muted rounded-lg"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h2 className="text-xl font-semibold">
                {MONTHS[month]} {year}
              </h2>
              <button
                onClick={() => navigateMonth(1)}
                className="p-2 hover:bg-muted rounded-lg"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
            <button
              onClick={goToToday}
              className="px-3 py-1 text-sm border border-border rounded-lg hover:bg-muted"
            >
              Today
            </button>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 border-b border-border">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="p-3 text-center text-sm font-medium text-muted-foreground"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          <div className="grid grid-cols-7">
            {days.map((day, idx) => {
              const isCurrentMonth = day.getMonth() === month;
              const isToday = isSameDay(day, today);
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              const dayInformationals = informalsByDate.get(day.toDateString()) || [];
              const dayReminders = remindersByDate.get(day.toDateString());
              const hasInformationals = dayInformationals.length > 0;
              const hasReminders = dayReminders && (dayReminders.threeB.length > 0 || dayReminders.sevenB.length > 0);

              return (
                <button
                  key={idx}
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    'min-h-[100px] p-2 border-b border-r border-border text-left hover:bg-muted/50 transition-colors',
                    !isCurrentMonth && 'bg-muted/30 text-muted-foreground',
                    isSelected && 'bg-primary/10 ring-2 ring-primary ring-inset',
                    idx % 7 === 6 && 'border-r-0'
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={cn(
                        'w-7 h-7 flex items-center justify-center rounded-full text-sm',
                        isToday && 'bg-primary text-primary-foreground font-bold'
                      )}
                    >
                      {day.getDate()}
                    </span>
                    <div className="flex gap-1">
                      {hasInformationals && (
                        <span className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                          {dayInformationals.length}
                        </span>
                      )}
                      {hasReminders && (
                        <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                          {(dayReminders?.threeB.length || 0) + (dayReminders?.sevenB.length || 0)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    {dayInformationals.slice(0, 2).map((inf) => (
                      <div
                        key={inf.id}
                        className={cn(
                          'text-xs px-1.5 py-0.5 rounded truncate',
                          inf.completedAt
                            ? 'bg-green-100 text-green-800'
                            : 'bg-blue-100 text-blue-800'
                        )}
                      >
                        {formatTime(inf.scheduledAt)} {inf.contact?.name}
                      </div>
                    ))}
                    {dayInformationals.length > 2 && (
                      <div className="text-xs text-muted-foreground px-1.5">
                        +{dayInformationals.length - 2} more
                      </div>
                    )}
                    {dayReminders?.threeB.map((o) => (
                      <div key={`3b-${o.id}`} className="text-xs px-1.5 py-0.5 rounded truncate bg-amber-100 text-amber-800">
                        3B: {o.contact?.name}
                      </div>
                    ))}
                    {dayReminders?.sevenB.map((o) => (
                      <div key={`7b-${o.id}`} className="text-xs px-1.5 py-0.5 rounded truncate bg-orange-100 text-orange-800">
                        7B: {o.contact?.name}
                      </div>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sidebar - Selected Date Details */}
        <div className="space-y-4">
          {/* Selected Date Header */}
          <div className="bg-card rounded-lg border border-border p-4">
            <h3 className="font-semibold mb-2">
              {selectedDate
                ? selectedDate.toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })
                : 'Select a date'}
            </h3>
            {selectedDate && (
              <button
                onClick={() => setShowScheduleModal(true)}
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Schedule for this day
              </button>
            )}
          </div>

          {/* Selected Date Informationals */}
          {selectedDate && (
            <div className="bg-card rounded-lg border border-border divide-y divide-border">
              {selectedDateInformationals.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  No informationals scheduled
                </div>
              ) : (
                selectedDateInformationals.map((inf) => (
                  <InformationalCard key={inf.id} informational={inf} />
                ))
              )}
            </div>
          )}

          {/* Selected Date 3B/7B Reminders */}
          {selectedDate && (selectedDateReminders.threeB.length > 0 || selectedDateReminders.sevenB.length > 0) && (
            <div className="bg-card rounded-lg border border-border overflow-hidden">
              <div className="px-4 py-2 bg-amber-50 border-b border-amber-200">
                <p className="text-sm font-medium text-amber-800">Outreach Checkpoints</p>
              </div>
              {selectedDateReminders.threeB.map((o) => (
                <div key={`3b-${o.id}`} className="p-4 border-b border-border last:border-b-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{o.contact?.name}</p>
                      <p className="text-xs text-muted-foreground">{o.employer?.name}</p>
                    </div>
                    <span className="text-xs px-2 py-1 bg-amber-100 text-amber-800 rounded font-medium">
                      3B Checkpoint
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    No response? Try a different contact at this company.
                  </p>
                </div>
              ))}
              {selectedDateReminders.sevenB.map((o) => (
                <div key={`7b-${o.id}`} className="p-4 border-b border-border last:border-b-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{o.contact?.name}</p>
                      <p className="text-xs text-muted-foreground">{o.employer?.name}</p>
                    </div>
                    <span className="text-xs px-2 py-1 bg-orange-100 text-orange-800 rounded font-medium">
                      7B Follow-up
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Time to send your 7B follow-up email.
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Upcoming This Week */}
          {digest && digest.thisWeek.length > 0 && (
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold mb-3">Upcoming This Week</h3>
              <div className="space-y-2">
                {digest.thisWeek.slice(0, 5).map((inf) => (
                  <div
                    key={inf.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <MeetingMethodIcon method={inf.method} className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">{inf.contact?.name}</span>
                    <span className="text-muted-foreground">
                      {formatDate(inf.scheduledAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Needs Preparation */}
          {digest && digest.needsPreparation.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h3 className="font-semibold text-amber-800 mb-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Needs Preparation
              </h3>
              <div className="space-y-2">
                {digest.needsPreparation.map((inf) => (
                  <div
                    key={inf.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span>{inf.contact?.name}</span>
                    <span className="text-amber-700">{formatDate(inf.scheduledAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Schedule Modal */}
      {showScheduleModal && (
        <ScheduleInformationalModal
          initialDate={selectedDate}
          initialContactId={preselectedContactId}
          onClose={() => {
            setShowScheduleModal(false);
            setPreselectedContactId(null);
          }}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['informationals'] });
            setShowScheduleModal(false);
            setPreselectedContactId(null);
          }}
          googleConnected={googleStatus?.isAuthenticated || false}
        />
      )}
    </div>
  );
}

function MeetingMethodIcon({ method, className }: { method: MeetingMethod; className?: string }) {
  switch (method) {
    case 'VIDEO':
      return <Video className={className} />;
    case 'IN_PERSON':
      return <Users className={className} />;
    default:
      return <Phone className={className} />;
  }
}

function InformationalCard({ informational }: { informational: Informational }) {
  const queryClient = useQueryClient();
  const [showComplete, setShowComplete] = useState(false);

  const completeMutation = useMutation({
    mutationFn: (data: { outcome: string; notes?: string }) =>
      informationalsApi.complete(informational.id, {
        outcome: data.outcome as any,
        notes: data.notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['informationals'] });
      setShowComplete(false);
    },
  });

  const isPast = new Date(informational.scheduledAt) < new Date();
  const isCompleted = !!informational.completedAt;

  return (
    <div className="p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="font-medium">{informational.contact?.name}</p>
          <p className="text-sm text-muted-foreground">
            {informational.contact?.employer?.name}
          </p>
        </div>
        <span
          className={cn(
            'text-xs px-2 py-1 rounded',
            isCompleted
              ? 'bg-green-100 text-green-800'
              : isPast
              ? 'bg-red-100 text-red-800'
              : 'bg-blue-100 text-blue-800'
          )}
        >
          {isCompleted ? 'Completed' : isPast ? 'Overdue' : 'Scheduled'}
        </span>
      </div>

      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
        <span className="flex items-center gap-1">
          <Clock className="w-4 h-4" />
          {formatTime(informational.scheduledAt)}
        </span>
        <span className="flex items-center gap-1">
          <MeetingMethodIcon method={informational.method} className="w-4 h-4" />
          {informational.method}
        </span>
        <span>{informational.duration} min</span>
      </div>

      {informational.calendarEventId && (
        <a
          href={`https://calendar.google.com/calendar/event?eid=${informational.calendarEventId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline flex items-center gap-1 mb-2"
        >
          <ExternalLink className="w-3 h-3" />
          View in Google Calendar
        </a>
      )}

      {isCompleted ? (
        <div className="bg-green-50 rounded p-2 text-sm">
          <p className="font-medium text-green-800">
            Outcome: {informational.outcome?.replace('_', ' ')}
          </p>
          {informational.referralName && (
            <p className="text-green-700">Referral: {informational.referralName}</p>
          )}
        </div>
      ) : isPast && !showComplete ? (
        <button
          onClick={() => setShowComplete(true)}
          className="text-sm px-3 py-1 bg-green-100 text-green-800 rounded hover:bg-green-200"
        >
          Record Outcome
        </button>
      ) : showComplete ? (
        <CompleteForm
          onSubmit={(outcome, notes) => completeMutation.mutate({ outcome, notes })}
          onCancel={() => setShowComplete(false)}
          isLoading={completeMutation.isPending}
        />
      ) : null}
    </div>
  );
}

function CompleteForm({
  onSubmit,
  onCancel,
  isLoading,
}: {
  onSubmit: (outcome: string, notes?: string) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [outcome, setOutcome] = useState('REFERRAL_OFFERED');
  const [notes, setNotes] = useState('');

  return (
    <div className="space-y-2 mt-2">
      <select
        value={outcome}
        onChange={(e) => setOutcome(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-border rounded bg-background"
      >
        <option value="REFERRAL_OFFERED">Referral Offered</option>
        <option value="NO_REFERRAL">No Referral</option>
        <option value="FOLLOW_UP_SCHEDULED">Follow-up Scheduled</option>
        <option value="DEAD_END">Dead End</option>
      </select>
      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        className="w-full px-3 py-2 text-sm border border-border rounded bg-background"
      />
      <div className="flex gap-2">
        <button
          onClick={() => onSubmit(outcome, notes)}
          disabled={isLoading}
          className="flex-1 px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
        >
          {isLoading ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1 text-sm border border-border rounded hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ScheduleInformationalModal({
  initialDate,
  initialContactId,
  onClose,
  onSuccess,
  googleConnected,
}: {
  initialDate: Date | null;
  initialContactId?: string | null;
  onClose: () => void;
  onSuccess: () => void;
  googleConnected: boolean;
}) {
  const [contactId, setContactId] = useState(initialContactId || '');
  const [date, setDate] = useState(
    initialDate ? initialDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
  );
  const [time, setTime] = useState('10:00');
  const [duration, setDuration] = useState(30);
  const [method, setMethod] = useState<MeetingMethod>('PHONE');
  const [createCalendarEvent, setCreateCalendarEvent] = useState(googleConnected);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);

  const { data: contacts } = useQuery({
    queryKey: ['contacts'],
    queryFn: contactsApi.getAll,
  });

  // Fetch availability for selected date
  const { data: availability, isLoading: loadingAvailability } = useQuery({
    queryKey: ['availability', date, duration],
    queryFn: () => informationalsApi.getAvailability(date, duration),
    enabled: googleConnected && !!date,
  });

  const createMutation = useMutation({
    mutationFn: informationalsApi.create,
    onSuccess,
  });

  // Filter to contacts with positive response (Boosters or those with positive outreach)
  // Also include pre-selected contact even if not in the filtered list
  const eligibleContacts = contacts?.filter(
    (c) => c.id === initialContactId || c.segment === 'BOOSTER' || c.outreach?.some((o) => o.responseType === 'POSITIVE')
  );

  const handleSubmit = () => {
    if (!contactId) return;

    const scheduledAt = selectedSlot
      ? selectedSlot.start
      : `${date}T${time}:00`;

    createMutation.mutate({
      contactId,
      scheduledAt,
      duration,
      method,
      createCalendarEvent,
    });
  };

  const handleSlotSelect = (slot: TimeSlot) => {
    setSelectedSlot(slot);
    const slotDate = new Date(slot.start);
    setTime(slotDate.toTimeString().slice(0, 5));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-border flex items-center justify-between">
          <h2 className="text-xl font-semibold">Schedule Informational</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-2xl">
            &times;
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Contact Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">Contact *</label>
            <select
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              className="w-full px-4 py-2 border border-border rounded-lg bg-background"
            >
              <option value="">Select a contact</option>
              {eligibleContacts?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} - {c.employer?.name}
                  {c.segment === 'BOOSTER' ? ' (Booster)' : ''}
                </option>
              ))}
            </select>
            {contacts && eligibleContacts && eligibleContacts.length < contacts.length && (
              <p className="text-xs text-muted-foreground mt-1">
                Showing contacts with positive responses. All contacts can be scheduled from Contacts page.
              </p>
            )}
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Date *</label>
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setSelectedSlot(null);
                }}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-4 py-2 border border-border rounded-lg bg-background"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Time *</label>
              <input
                type="time"
                value={time}
                onChange={(e) => {
                  setTime(e.target.value);
                  setSelectedSlot(null);
                }}
                className="w-full px-4 py-2 border border-border rounded-lg bg-background"
              />
            </div>
          </div>

          {/* Available Slots */}
          {googleConnected && availability && (
            <div>
              <label className="block text-sm font-medium mb-2">
                Available Time Slots
                <span className="text-muted-foreground font-normal ml-2">
                  (based on your calendar)
                </span>
              </label>
              {loadingAvailability ? (
                <p className="text-sm text-muted-foreground">Loading availability...</p>
              ) : availability.availableSlots.length === 0 ? (
                <p className="text-sm text-amber-600">No available slots for this date</p>
              ) : (
                <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto">
                  {availability.availableSlots.map((slot, idx) => {
                    const isSelected = selectedSlot?.start === slot.start;
                    return (
                      <button
                        key={idx}
                        onClick={() => handleSlotSelect(slot)}
                        className={cn(
                          'px-3 py-2 text-sm border rounded-lg',
                          isSelected
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border hover:bg-muted'
                        )}
                      >
                        {formatTime(slot.start)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Duration & Method */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Duration</label>
              <select
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value))}
                className="w-full px-4 py-2 border border-border rounded-lg bg-background"
              >
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>60 minutes</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Method</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as MeetingMethod)}
                className="w-full px-4 py-2 border border-border rounded-lg bg-background"
              >
                <option value="PHONE">Phone Call</option>
                <option value="VIDEO">Video Call</option>
                <option value="IN_PERSON">In Person</option>
              </select>
            </div>
          </div>

          {/* Calendar Integration */}
          {googleConnected && (
            <label className="flex items-center gap-3 p-4 border border-border rounded-lg cursor-pointer hover:bg-muted/50">
              <input
                type="checkbox"
                checked={createCalendarEvent}
                onChange={(e) => setCreateCalendarEvent(e.target.checked)}
                className="w-4 h-4"
              />
              <div>
                <p className="font-medium">Create Google Calendar event</p>
                <p className="text-sm text-muted-foreground">
                  Automatically add this informational to your calendar with reminders
                </p>
              </div>
            </label>
          )}

          {!googleConnected && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800">
                Connect Google in Settings to enable calendar integration and see available time slots.
              </p>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-border flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-border rounded-lg hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!contactId || createMutation.isPending}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            {createMutation.isPending ? 'Scheduling...' : 'Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}
