import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, AlertCircle, Copy, ChevronRight, ChevronLeft, FileText, Mail, Calendar, Edit2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { outreachApi, contactsApi, templatesApi, googleApi, employersApi } from '@/lib/api';
import { cn, formatDate, getStatusLabel, getSegmentColor, countWords } from '@/lib/utils';
import type { Outreach, ResponseType, Contact, Employer, OutreachStatus } from '@/types';

export default function OutreachPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialContactId = searchParams.get('contactId');
  const [showComposer, setShowComposer] = useState(!!initialContactId);

  // Clear the contactId param after opening the composer so it doesn't persist on refresh
  useEffect(() => {
    if (initialContactId) {
      setSearchParams({}, { replace: true });
    }
  }, [initialContactId, setSearchParams]);

  const { data: reminders } = useQuery({
    queryKey: ['reminders'],
    queryFn: outreachApi.getToday,
  });

  const { data: outreach, isLoading } = useQuery({
    queryKey: ['outreach'],
    queryFn: outreachApi.getAll,
  });

  const { data: stats } = useQuery({
    queryKey: ['outreach-stats'],
    queryFn: outreachApi.getStats,
  });

  const { data: googleStatus } = useQuery({
    queryKey: ['google-status'],
    queryFn: googleApi.getStatus,
  });

  // Fetch employers and contacts for name resolution (server JOINs return '[encrypted]' after E2E encryption)
  const { data: employers } = useQuery({
    queryKey: ['employers'],
    queryFn: employersApi.getAll,
  });

  const { data: contacts } = useQuery({
    queryKey: ['contacts'],
    queryFn: contactsApi.getAll,
  });

  const isGoogleAuthenticated = googleStatus?.isAuthenticated ?? false;

  // Patch outreach with employer and contact names from decrypted lists
  const patchedOutreach = useMemo(() => {
    if (!outreach || !employers || !contacts) return outreach;

    const employerMap = new Map(employers.map((e: Employer) => [e.id, e]));
    const contactMap = new Map(contacts.map((c: Contact) => [c.id, c]));

    return outreach.map((o: Outreach) => {
      const employer = employerMap.get(o.employerId);
      const contact = contactMap.get(o.contactId);
      return {
        ...o,
        employer: employer ? { id: employer.id, name: employer.name } : o.employer,
        contact: contact ? {
          id: contact.id,
          name: contact.name,
          segment: contact.segment,
        } : o.contact,
      };
    });
  }, [outreach, employers, contacts]);

  // Patch reminders similarly
  const patchedReminders = useMemo(() => {
    if (!reminders || !employers || !contacts) return reminders;

    const employerMap = new Map(employers.map((e: Employer) => [e.id, e]));
    const contactMap = new Map(contacts.map((c: Contact) => [c.id, c]));

    const patchArray = (items: Outreach[]) => items.map((o: Outreach) => {
      const employer = employerMap.get(o.employerId);
      const contact = contactMap.get(o.contactId);
      return {
        ...o,
        employer: employer ? { id: employer.id, name: employer.name } : o.employer,
        contact: contact ? {
          id: contact.id,
          name: contact.name,
          segment: contact.segment,
        } : o.contact,
      };
    });

    return {
      ...reminders,
      threeBReminders: patchArray(reminders.threeBReminders || []),
      sevenBReminders: patchArray(reminders.sevenBReminders || []),
      overdue3B: patchArray(reminders.overdue3B || []),
      overdue7B: patchArray(reminders.overdue7B || []),
    };
  }, [reminders, employers, contacts]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Outreach</h1>
          <p className="text-muted-foreground mt-1">
            Track your 6-Point Emails and 3B7 routine
          </p>
        </div>
        <button
          onClick={() => setShowComposer(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90"
        >
          <Send className="w-4 h-4" />
          New Outreach
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-card rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Total Sent</p>
          <p className="text-2xl font-bold">{stats?.totalSent || 0}</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Responses</p>
          <p className="text-2xl font-bold">{stats?.totalResponses || 0}</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Response Rate</p>
          <p className="text-2xl font-bold">{stats?.responseRate || '0%'}</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Boosters Found</p>
          <p className="text-2xl font-bold text-green-600">{stats?.totalBoosters || 0}</p>
        </div>
      </div>

      {/* Today's Reminders */}
      {patchedReminders && patchedReminders.summary.totalActionRequired > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h3 className="font-semibold text-amber-800 mb-3 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Today's Actions ({patchedReminders.summary.totalActionRequired})
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {patchedReminders.threeBReminders.length > 0 && (
              <div>
                <p className="text-sm font-medium text-amber-700 mb-2">
                  3B: Try new contact ({patchedReminders.threeBReminders.length})
                </p>
                <ul className="space-y-1">
                  {patchedReminders.threeBReminders.map((o) => (
                    <li key={o.id} className="text-sm">
                      {o.employer?.name} - {o.contact?.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {patchedReminders.sevenBReminders.length > 0 && (
              <div>
                <p className="text-sm font-medium text-amber-700 mb-2">
                  7B: Follow up ({patchedReminders.sevenBReminders.length})
                </p>
                <ul className="space-y-1">
                  {patchedReminders.sevenBReminders.map((o) => (
                    <li key={o.id} className="text-sm">
                      {o.employer?.name} - {o.contact?.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Email Composer */}
      {showComposer && (
        <EmailComposer
          initialContactId={initialContactId || undefined}
          onClose={() => setShowComposer(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['outreach'] });
            setShowComposer(false);
          }}
        />
      )}

      {/* Outreach List */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left p-4 font-semibold">Date</th>
                <th className="text-left p-4 font-semibold">Employer</th>
                <th className="text-left p-4 font-semibold">Contact</th>
                <th className="text-left p-4 font-semibold">Subject</th>
                <th className="text-center p-4 font-semibold">Words</th>
                <th className="text-center p-4 font-semibold">Status</th>
                <th className="text-left p-4 font-semibold">3B / 7B</th>
                <th className="text-right p-4 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    Loading outreach...
                  </td>
                </tr>
              ) : !patchedOutreach?.length ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    <Send className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p className="mb-2">No outreach yet</p>
                    <p className="text-sm">
                      Start by sending 6-Point Emails to your Top 5 employers
                    </p>
                  </td>
                </tr>
              ) : (
                patchedOutreach.map((o) => (
                  <OutreachRow key={o.id} outreach={o} isGoogleAuthenticated={isGoogleAuthenticated} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function OutreachRow({ outreach, isGoogleAuthenticated }: { outreach: Outreach; isGoogleAuthenticated: boolean }) {
  const queryClient = useQueryClient();
  const [showResponseForm, setShowResponseForm] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);

  const recordResponseMutation = useMutation({
    mutationFn: ({ responseType, notes }: { responseType: ResponseType; notes?: string }) =>
      outreachApi.recordResponse(outreach.id, {
        responseAt: new Date().toISOString(),
        responseType,
        notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outreach'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setShowResponseForm(false);
    },
  });

  const markMovedOnMutation = useMutation({
    mutationFn: () => outreachApi.markMovedOn(outreach.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['outreach'] }),
  });

  const createCalendarEventsMutation = useMutation({
    mutationFn: () => outreachApi.createCalendarEvents(outreach.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['outreach'] }),
  });

  const isWordCountOk = outreach.wordCount <= 75;

  return (
    <>
      <tr
        className="border-b border-border hover:bg-muted/30 cursor-pointer"
        onClick={() => setShowDetail(!showDetail)}
      >
        <td className="p-4 text-sm">{formatDate(outreach.sentAt)}</td>
        <td className="p-4 font-medium">{outreach.employer?.name}</td>
        <td className="p-4">
          <div>
            <p>{outreach.contact?.name}</p>
            {outreach.contact?.segment && outreach.contact.segment !== 'UNKNOWN' && (
              <span
                className={cn(
                  'inline-block px-2 py-0.5 rounded text-xs mt-1',
                  getSegmentColor(outreach.contact.segment)
                )}
              >
                {outreach.contact.segment}
              </span>
            )}
          </div>
        </td>
        <td className="p-4 text-sm text-muted-foreground truncate max-w-xs">
          {outreach.subject}
        </td>
        <td className="p-4 text-center">
          <span
            className={cn(
              'inline-block px-2 py-1 rounded text-sm font-medium',
              isWordCountOk ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            )}
          >
            {outreach.wordCount}
          </span>
        </td>
        <td className="p-4 text-center">
          <span
            className={cn(
              'inline-block px-3 py-1 rounded-full text-xs font-medium',
              outreach.status === 'RESPONDED' || outreach.status === 'SCHEDULED'
                ? 'bg-green-100 text-green-800'
                : outreach.status === 'NO_RESPONSE'
                ? 'bg-red-100 text-red-800'
                : 'bg-blue-100 text-blue-800'
            )}
          >
            {getStatusLabel(outreach.status)}
          </span>
        </td>
        <td className="p-4 text-sm">
          <div className="space-y-1">
            <p>3B: {formatDate(outreach.threeB_Date)}</p>
            <p>7B: {formatDate(outreach.sevenB_Date)}</p>
          </div>
        </td>
        <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => { setShowEditForm(true); setShowDetail(false); }}
              className="p-1.5 rounded hover:bg-muted"
              title="Edit outreach"
            >
              <Edit2 className="w-4 h-4 text-muted-foreground" />
            </button>
            {isGoogleAuthenticated && !outreach.calendarEventId && (
              <button
                onClick={() => createCalendarEventsMutation.mutate()}
                disabled={createCalendarEventsMutation.isPending}
                className="p-1.5 rounded hover:bg-muted disabled:opacity-50"
                title="Add 3B/7B reminders to Google Calendar"
              >
                <Calendar className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
            {outreach.status === 'AWAITING_3B' && (
              <button
                onClick={() => markMovedOnMutation.mutate()}
                className="text-xs px-3 py-1 bg-blue-100 text-blue-800 rounded hover:bg-blue-200"
              >
                Moved On
              </button>
            )}
            {(outreach.status === 'AWAITING_7B' || outreach.status === 'AWAITING_3B') && (
              <button
                onClick={() => { setShowResponseForm(true); setShowDetail(false); }}
                className="text-xs px-3 py-1 bg-green-100 text-green-800 rounded hover:bg-green-200"
              >
                Got Response
              </button>
            )}
          </div>
        </td>
      </tr>
      {showDetail && (
        <tr className="bg-muted/20 border-b border-border">
          <td colSpan={8} className="p-4">
            <OutreachDetail outreach={outreach} onClose={() => setShowDetail(false)} />
          </td>
        </tr>
      )}
      {showResponseForm && (
        <tr className="bg-green-50">
          <td colSpan={8} className="p-4">
            <ResponseForm
              onSubmit={(type, notes) =>
                recordResponseMutation.mutate({ responseType: type, notes })
              }
              onCancel={() => setShowResponseForm(false)}
              isLoading={recordResponseMutation.isPending}
            />
          </td>
        </tr>
      )}
      {showEditForm && (
        <tr className="bg-blue-50">
          <td colSpan={8} className="p-4">
            <EditOutreachForm
              outreach={outreach}
              onCancel={() => setShowEditForm(false)}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function ResponseForm({
  onSubmit,
  onCancel,
  isLoading,
}: {
  onSubmit: (type: ResponseType, notes?: string) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [type, setType] = useState<ResponseType>('POSITIVE');
  const [notes, setNotes] = useState('');

  return (
    <div className="flex items-end gap-4">
      <div>
        <label className="block text-sm font-medium mb-1">Response Type</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as ResponseType)}
          className="px-4 py-2 border border-border rounded-lg bg-background"
        >
          <option value="POSITIVE">Positive (Agreed to meet)</option>
          <option value="DELAYED_POSITIVE">Delayed Positive</option>
          <option value="NEGATIVE">Negative (Declined)</option>
          <option value="REFERRAL_ONLY">Referral Only</option>
          <option value="OUT_OF_OFFICE">Out of Office</option>
        </select>
      </div>
      <div className="flex-1">
        <label className="block text-sm font-medium mb-1">Notes</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes"
          className="w-full px-4 py-2 border border-border rounded-lg bg-background"
        />
      </div>
      <button
        onClick={() => onSubmit(type, notes)}
        disabled={isLoading}
        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
      >
        {isLoading ? 'Saving...' : 'Save'}
      </button>
      <button
        onClick={onCancel}
        className="px-4 py-2 border border-border rounded-lg hover:bg-muted"
      >
        Cancel
      </button>
    </div>
  );
}

function EditOutreachForm({ outreach, onCancel }: { outreach: Outreach; onCancel: () => void }) {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState(outreach.subject || '');
  const [body, setBody] = useState(outreach.body || '');
  const [sentAt, setSentAt] = useState(outreach.sentAt?.split('T')[0] || '');
  const [notes, setNotes] = useState(outreach.notes || '');
  const [status, setStatus] = useState<OutreachStatus>(outreach.status);

  const updateMutation = useMutation({
    mutationFn: (data: { subject?: string; body?: string; sentAt?: string; notes?: string; status?: OutreachStatus }) =>
      outreachApi.update(outreach.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outreach'] });
      onCancel();
    },
  });

  const wordCount = countWords(body);
  const isWordCountOk = wordCount <= 75;

  const handleSubmit = () => {
    const data: any = {};
    if (subject !== outreach.subject) data.subject = subject;
    if (body !== outreach.body) data.body = body;
    if (sentAt && sentAt !== outreach.sentAt?.split('T')[0]) data.sentAt = new Date(sentAt).toISOString();
    if (notes !== outreach.notes) data.notes = notes;
    if (status !== outreach.status) data.status = status;

    if (Object.keys(data).length === 0) {
      onCancel();
      return;
    }

    updateMutation.mutate(data);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm">Edit Outreach</h4>
        <button
          onClick={onCancel}
          className="text-muted-foreground hover:text-foreground text-lg leading-none"
        >
          &times;
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Subject</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Status</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as OutreachStatus)}
          className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
        >
          <option value="DRAFT">Draft</option>
          <option value="SENT">Sent</option>
          <option value="AWAITING_3B">Awaiting 3B</option>
          <option value="MOVED_ON">Moved On</option>
          <option value="AWAITING_7B">Awaiting 7B</option>
          <option value="FOLLOWED_UP">Followed Up</option>
          <option value="RESPONDED">Responded</option>
          <option value="SCHEDULED">Scheduled</option>
          <option value="COMPLETED">Completed</option>
          <option value="NO_RESPONSE">No Response</option>
        </select>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium">Body</label>
          <span
            className={cn(
              'text-sm font-medium',
              isWordCountOk ? 'text-green-600' : 'text-red-600'
            )}
          >
            {wordCount} / 75 words
          </span>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          className="w-full px-3 py-2 border border-border rounded-lg bg-background font-mono text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Sent Date</label>
        <input
          type="date"
          value={sentAt}
          onChange={(e) => setSentAt(e.target.value)}
          max={new Date().toISOString().split('T')[0]}
          className="px-3 py-2 border border-border rounded-lg bg-background text-sm"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Changing the sent date will recalculate 3B and 7B reminder dates
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Notes</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes"
          className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={updateMutation.isPending}
          className="px-4 py-2 border border-border rounded-lg hover:bg-muted"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={updateMutation.isPending}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

function OutreachDetail({ outreach, onClose }: { outreach: Outreach; onClose: () => void }) {
  return (
    <div className="space-y-4" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm">Message Details</h4>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground text-lg leading-none"
        >
          &times;
        </button>
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-3 gap-x-6 gap-y-2 text-sm">
        <div>
          <span className="text-muted-foreground">Sent: </span>
          {formatDate(outreach.sentAt)}
        </div>
        <div>
          <span className="text-muted-foreground">Status: </span>
          {getStatusLabel(outreach.status)}
        </div>
        <div>
          <span className="text-muted-foreground">Word count: </span>
          <span className={outreach.wordCount <= 75 ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>
            {outreach.wordCount}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">3B: </span>
          {formatDate(outreach.threeB_Date)}
        </div>
        <div>
          <span className="text-muted-foreground">7B: </span>
          {formatDate(outreach.sevenB_Date)}
        </div>
        {outreach.responseAt && (
          <div>
            <span className="text-muted-foreground">Response: </span>
            {outreach.responseType} ({formatDate(outreach.responseAt)})
          </div>
        )}
        {outreach.followUpSentAt && (
          <div>
            <span className="text-muted-foreground">Follow-up sent: </span>
            {formatDate(outreach.followUpSentAt)}
          </div>
        )}
        {outreach.gmailMessageId && (
          <div>
            <span className="text-muted-foreground">Gmail ID: </span>
            <span className="font-mono text-xs">{outreach.gmailMessageId}</span>
          </div>
        )}
        {outreach.notes && (
          <div className="col-span-3">
            <span className="text-muted-foreground">Notes: </span>
            {outreach.notes}
          </div>
        )}
      </div>

      {/* Email body */}
      <div>
        <p className="text-sm font-medium mb-1">
          Subject: <span className="font-normal">{outreach.subject}</span>
        </p>
        <div className="bg-background border border-border rounded-lg p-4 font-mono text-sm whitespace-pre-wrap leading-relaxed">
          {outreach.body}
        </div>
      </div>

      {/* Follow-up body if present */}
      {outreach.followUpBody && (
        <div>
          <p className="text-sm font-medium mb-1">Follow-up message:</p>
          <div className="bg-background border border-border rounded-lg p-4 font-mono text-sm whitespace-pre-wrap leading-relaxed">
            {outreach.followUpBody}
          </div>
        </div>
      )}
    </div>
  );
}

type ComposerStep = 'select' | 'variables' | 'edit';

function EmailComposer({
  initialContactId,
  onClose,
  onSuccess,
}: {
  initialContactId?: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<ComposerStep>('select');
  const [contactId, setContactId] = useState(initialContactId || '');
  const [templateId, setTemplateId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sentAt, setSentAt] = useState('');
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  const { data: allContacts } = useQuery({
    queryKey: ['contacts'],
    queryFn: contactsApi.getAll,
  });

  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: templatesApi.getAll,
  });

  const { data: employers } = useQuery({
    queryKey: ['employers'],
    queryFn: employersApi.getAll,
  });

  // Patch contact employer names (server JOIN returns '[encrypted]' after E2E encryption)
  const patchedContacts = useMemo(() => {
    if (!allContacts || !employers) return allContacts;
    const employerNameMap = new Map(employers.map(e => [e.id, e.name]));
    return allContacts.map(c => {
      const resolvedName = employerNameMap.get(c.employerId);
      if (resolvedName && c.employer && c.employer.name !== resolvedName) {
        return { ...c, employer: { ...c.employer, name: resolvedName } };
      }
      return c;
    });
  }, [allContacts, employers]);

  const { data: googleStatus } = useQuery({
    queryKey: ['google-status'],
    queryFn: googleApi.getStatus,
  });

  // Group contacts by employer for the dropdown
  const contactsByEmployer = useMemo(() => {
    return patchedContacts?.reduce((acc, contact) => {
      const employerName = contact.employer?.name || 'Unknown';
      if (!acc[employerName]) {
        acc[employerName] = [];
      }
      acc[employerName].push(contact);
      return acc;
    }, {} as Record<string, Contact[]>);
  }, [patchedContacts]);

  // Get selected contact and template
  const selectedContact = patchedContacts?.find((c) => c.id === contactId);
  const selectedTemplate = templates?.find((t) => t.id === templateId);
  const employerId = selectedContact?.employerId || '';
  const employerName = selectedContact?.employer?.name || '';

  // Get template variables (excluding auto-filled ones)
  const templateVariables = useMemo(() => {
    if (!selectedTemplate) return [];
    // Handle case where variables might be encrypted (string) instead of array
    const vars = Array.isArray(selectedTemplate.variables) ? selectedTemplate.variables : [];
    // These will be auto-filled from the contact/employer
    const autoFilled = ['contactName', 'employerName', 'jobTitle'];
    return vars.filter((v) => !autoFilled.includes(v));
  }, [selectedTemplate]);

  const createMutation = useMutation({
    mutationFn: outreachApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outreach'] });
      onSuccess();
    },
  });

  const createDraftMutation = useMutation({
    mutationFn: googleApi.createDraft,
    onSuccess: (data) => {
      // Open the draft in Gmail
      const gmailUrl = data.messageId
        ? `https://mail.google.com/mail/u/0/#drafts/${data.messageId}`
        : 'https://mail.google.com/mail/u/0/#drafts';
      window.open(gmailUrl, '_blank', 'noopener,noreferrer');
      // Also record the outreach
      if (employerId && contactId && subject && body) {
        createMutation.mutate({ employerId, contactId, subject, body });
      }
    },
  });

  const wordCount = countWords(body);
  const isWordCountOk = wordCount <= 75;

  // Handle moving to variables step
  const handleSelectNext = () => {
    if (!contactId || !templateId) return;

    // Pre-fill variables with contact info
    const prefilled: Record<string, string> = {
      contactName: selectedContact?.name || '',
      employerName: employerName,
      jobTitle: selectedContact?.title || '',
    };
    setVariables(prefilled);
    setStep('variables');
  };

  // Generate email from template and move to edit step
  const handleGenerateEmail = () => {
    if (!selectedTemplate) return;

    let generatedSubject = selectedTemplate.subject;
    let generatedBody = selectedTemplate.body;

    // Replace all variables
    const allVars = { ...variables };
    for (const [key, value] of Object.entries(allVars)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      generatedSubject = generatedSubject.replace(regex, value);
      generatedBody = generatedBody.replace(regex, value);
    }

    setSubject(generatedSubject);
    setBody(generatedBody);
    setStep('edit');
  };

  // Copy to clipboard
  const handleCopy = async () => {
    const emailText = `Subject: ${subject}\n\n${body}`;
    await navigator.clipboard.writeText(emailText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Create Gmail draft
  const handleCreateDraft = () => {
    if (!selectedContact?.email) {
      alert('No email address for this contact. Please add their email first.');
      return;
    }
    createDraftMutation.mutate({
      to: selectedContact.email,
      subject,
      body,
    });
  };

  // Just record the outreach without sending
  const handleRecordOutreach = () => {
    if (!employerId || !contactId || !subject || !body) return;
    const data: any = { employerId, contactId, subject, body };
    if (sentAt) {
      data.sentAt = sentAt;
    }
    createMutation.mutate(data);
  };

  return (
    <div className="bg-card rounded-lg border border-border p-6">
      {/* Header with steps */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Compose 6-Point Email</h3>
          <div className="flex items-center gap-1 ml-4 text-sm text-muted-foreground">
            <span className={cn('px-2 py-0.5 rounded', step === 'select' ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
              1. Select
            </span>
            <ChevronRight className="w-4 h-4" />
            <span className={cn('px-2 py-0.5 rounded', step === 'variables' ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
              2. Fill
            </span>
            <ChevronRight className="w-4 h-4" />
            <span className={cn('px-2 py-0.5 rounded', step === 'edit' ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
              3. Edit & Send
            </span>
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">
          &times;
        </button>
      </div>

      {/* Step 1: Select contact and template */}
      {step === 'select' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Contact *</label>
            <select
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              className="w-full px-4 py-2 border border-border rounded-lg bg-background"
            >
              <option value="">Select a contact</option>
              {contactsByEmployer && Object.entries(contactsByEmployer)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([empName, contacts]) => (
                  <optgroup key={empName} label={empName}>
                    {contacts?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.title ? `- ${c.title}` : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Email Template *</label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full px-4 py-2 border border-border rounded-lg bg-background"
            >
              <option value="">Select a template</option>
              {templates?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.wordCount} words)
                </option>
              ))}
            </select>
            {selectedTemplate && (
              <div className="mt-2 p-3 bg-muted rounded-lg text-sm">
                <p className="font-medium mb-1">Preview:</p>
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {typeof selectedTemplate.body === 'string' ? selectedTemplate.body.substring(0, 150) : '(No preview available)'}...
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-border rounded-lg hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={handleSelectNext}
              disabled={!contactId || !templateId}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Fill in variables */}
      {step === 'variables' && (
        <div className="space-y-4">
          <div className="bg-muted/50 rounded-lg p-4 mb-4">
            <p className="text-sm">
              <span className="font-medium">Contact:</span> {selectedContact?.name} at {employerName}
            </p>
            <p className="text-sm">
              <span className="font-medium">Template:</span> {selectedTemplate?.name}
            </p>
          </div>

          {/* Retroactive date picker */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!sentAt}
                onChange={(e) => setSentAt(e.target.checked ? new Date().toISOString().split('T')[0] : '')}
                className="rounded"
              />
              <span className="font-medium">Retroactive outreach?</span>
            </label>
            <p className="text-xs text-muted-foreground mt-1">
              Check if this email was sent on a previous date (3B and 7B dates will be calculated from the sent date)
            </p>
            {sentAt && (
              <input
                type="date"
                value={sentAt}
                onChange={(e) => setSentAt(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="mt-2 px-3 py-2 border border-border rounded-lg bg-background text-sm"
              />
            )}
          </div>

          {/* Auto-filled variables (read-only) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Contact Name (auto)</label>
              <input
                type="text"
                value={variables.contactName || ''}
                onChange={(e) => setVariables({ ...variables, contactName: e.target.value })}
                className="w-full px-4 py-2 border border-border rounded-lg bg-muted"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Employer Name (auto)</label>
              <input
                type="text"
                value={variables.employerName || ''}
                onChange={(e) => setVariables({ ...variables, employerName: e.target.value })}
                className="w-full px-4 py-2 border border-border rounded-lg bg-muted"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Job Title (auto)</label>
              <input
                type="text"
                value={variables.jobTitle || ''}
                onChange={(e) => setVariables({ ...variables, jobTitle: e.target.value })}
                className="w-full px-4 py-2 border border-border rounded-lg bg-muted"
              />
            </div>
          </div>

          {/* User-provided variables */}
          {templateVariables.length > 0 && (
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
              {templateVariables.map((varName) => (
                <div key={varName}>
                  <label className="block text-sm font-medium mb-1 capitalize">
                    {varName.replace(/([A-Z])/g, ' $1').trim()} *
                  </label>
                  <input
                    type="text"
                    value={variables[varName] || ''}
                    onChange={(e) => setVariables({ ...variables, [varName]: e.target.value })}
                    placeholder={`Enter ${varName}`}
                    className="w-full px-4 py-2 border border-border rounded-lg bg-background"
                  />
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-between pt-4">
            <button
              onClick={() => setStep('select')}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-muted"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
            <button
              onClick={handleGenerateEmail}
              disabled={templateVariables.some((v) => !variables[v])}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              Generate Email
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Edit and send */}
      {step === 'edit' && (
        <div className="space-y-4">
          <div className="bg-muted/50 rounded-lg p-4 mb-4">
            <p className="text-sm">
              <span className="font-medium">To:</span> {selectedContact?.name} ({selectedContact?.email || 'No email'})
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-4 py-2 border border-border rounded-lg bg-background"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium">Body</label>
              <span
                className={cn(
                  'text-sm font-medium',
                  isWordCountOk ? 'text-green-600' : 'text-red-600'
                )}
              >
                {wordCount} / 75 words
              </span>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="w-full px-4 py-2 border border-border rounded-lg bg-background font-mono text-sm"
            />
            {!isWordCountOk && (
              <p className="text-sm text-red-600 mt-1">
                6-Point Emails should be under 75 words for best results.
              </p>
            )}
          </div>

          <div className="flex justify-between pt-4 border-t border-border">
            <button
              onClick={() => setStep('variables')}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-muted"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>

            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-muted"
              >
                <Copy className="w-4 h-4" />
                {copied ? 'Copied!' : 'Copy'}
              </button>

              {googleStatus?.isAuthenticated && (
                <button
                  onClick={handleCreateDraft}
                  disabled={!selectedContact?.email || createDraftMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  title={!selectedContact?.email ? 'Contact has no email address' : 'Create Gmail draft'}
                >
                  <Mail className="w-4 h-4" />
                  {createDraftMutation.isPending ? 'Creating...' : 'Create Gmail Draft'}
                </button>
              )}

              <button
                onClick={handleRecordOutreach}
                disabled={!subject || !body || createMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                <FileText className="w-4 h-4" />
                {createMutation.isPending ? 'Saving...' : 'Record Outreach'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
