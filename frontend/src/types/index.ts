// Employer types
export type EmployerStatus = 'ACTIVE' | 'ON_HOLD' | 'RULED_OUT' | 'OFFER_RECEIVED';

export interface Employer {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  location: string | null;
  notes: string | null;
  advocacy: boolean;
  motivation: number;
  posting: number;
  lampRank: number | null;
  status: EmployerStatus;
  isNetworkOrg: boolean;
  displayOrder: number;
  isLocked: boolean;
  contacts?: Contact[];
  outreach?: Outreach[];
  _count?: {
    contacts: number;
    outreach: number;
  };
  createdAt: string;
  updatedAt: string;
}

// Contact types
export type ContactMethod =
  | 'LINKEDIN_GROUP'
  | 'DIRECT_EMAIL_ALUMNI'
  | 'DIRECT_EMAIL_HUNTER'
  | 'FAN_MAIL'
  | 'LINKEDIN_CONNECT'
  | 'SOCIAL_MEDIA'
  | 'SECOND_DEGREE';

export type ContactSegment = 'UNKNOWN' | 'BOOSTER' | 'OBLIGATE' | 'CURMUDGEON';

export interface Contact {
  id: string;
  employerId: string;
  employer?: Employer;
  name: string;
  title: string | null;
  email: string | null;
  linkedInUrl: string | null;
  phone: string | null;
  isFunctionallyRelevant: boolean;
  isAlumni: boolean;
  levelAboveTarget: number;
  isInternallyPromoted: boolean;
  hasUniqueName: boolean;
  contactMethod: ContactMethod | null;
  segment: ContactSegment;
  priority: number;
  outreach?: Outreach[];
  informationals?: Informational[];
  _count?: {
    outreach: number;
    informationals: number;
  };
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// Outreach types
export type ResponseType =
  | 'POSITIVE'
  | 'NEGATIVE'
  | 'DELAYED_POSITIVE'
  | 'REFERRAL_ONLY'
  | 'OUT_OF_OFFICE';

export type OutreachStatus =
  | 'DRAFT'
  | 'SENT'
  | 'AWAITING_3B'
  | 'MOVED_ON'
  | 'AWAITING_7B'
  | 'FOLLOWED_UP'
  | 'RESPONDED'
  | 'SCHEDULED'
  | 'COMPLETED'
  | 'NO_RESPONSE';

export interface Outreach {
  id: string;
  employerId: string;
  employer?: { id: string; name: string };
  contactId: string;
  contact?: { id: string; name: string; segment?: ContactSegment };
  subject: string;
  body: string;
  wordCount: number;
  sentAt: string;
  threeB_Date: string;
  sevenB_Date: string;
  responseAt: string | null;
  responseType: ResponseType | null;
  followUpSentAt: string | null;
  followUpBody: string | null;
  status: OutreachStatus;
  gmailDraftId: string | null;
  gmailMessageId: string | null;
  calendarEventId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// Template types
export type TemplateType =
  | 'SIX_POINT_INITIAL'
  | 'SIX_POINT_NO_CONNECTION'
  | 'SIX_POINT_WITH_POSTING'
  | 'FOLLOW_UP_7B'
  | 'THANK_YOU'
  | 'REFERRAL_REQUEST';

export interface EmailTemplate {
  id: string;
  name: string;
  type: TemplateType;
  subject: string;
  body: string;
  variables: string[];
  wordCount: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

// Dashboard types
export interface TodayReminders {
  threeBReminders: Outreach[];
  sevenBReminders: Outreach[];
  overdue3B: Outreach[];
  overdue7B: Outreach[];
  summary: {
    today3B: number;
    today7B: number;
    overdue3B: number;
    overdue7B: number;
    totalActionRequired: number;
  };
}

export interface OutreachStats {
  totalSent: number;
  totalResponses: number;
  totalBoosters: number;
  responseRate: string;
  byStatus: Record<OutreachStatus, number>;
}

// Form types
export interface CreateEmployerInput {
  name: string;
  website?: string | null;
  industry?: string | null;
  location?: string | null;
  notes?: string | null;
  advocacy?: boolean;
  motivation?: number;
  posting?: number;
  isNetworkOrg?: boolean;
}

export interface CreateContactInput {
  employerId: string;
  name: string;
  title?: string | null;
  email?: string | null;
  linkedInUrl?: string | null;
  phone?: string | null;
  isFunctionallyRelevant?: boolean;
  isAlumni?: boolean;
  levelAboveTarget?: number;
  isInternallyPromoted?: boolean;
  hasUniqueName?: boolean;
  contactMethod?: ContactMethod | null;
  notes?: string | null;
}

export interface CreateOutreachInput {
  employerId: string;
  contactId: string;
  subject: string;
  body: string;
  sentAt?: string;
}

export interface GenerateEmailInput {
  contactName: string;
  employerName: string;
  connection?: string;
  jobTitle?: string;
  broadInterest?: string;
  postingTitle?: string;
}

// Informational types
export type MeetingMethod = 'PHONE' | 'VIDEO' | 'IN_PERSON';

export type InformationalOutcome =
  | 'REFERRAL_OFFERED'
  | 'NO_REFERRAL'
  | 'FOLLOW_UP_SCHEDULED'
  | 'DEAD_END';

export interface BigFourAnswers {
  tellMeAboutYourself?: string;
  whyOrg?: string;
  whyRole?: string;
  whyIndustry?: string;
}

export interface TiaraQuestions {
  trends?: string;
  insights?: string;
  advice?: string;
  resources?: string;
  assignments?: string;
}

export interface Informational {
  id: string;
  contactId: string;
  contact?: Contact;
  scheduledAt: string;
  duration: number;
  method: MeetingMethod;
  researchNotes: string | null;
  bigFourAnswers: BigFourAnswers | null;
  tiaraQuestions: TiaraQuestions | null;
  completedAt: string | null;
  outcome: InformationalOutcome | null;
  referralName: string | null;
  referralContact: string | null;
  nextSteps: string | null;
  calendarEventId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInformationalInput {
  contactId: string;
  scheduledAt: string;
  duration?: number;
  method?: MeetingMethod;
  researchNotes?: string;
  tiaraQuestions?: TiaraQuestions;
  createCalendarEvent?: boolean;
  notes?: string;
}

export interface CompleteInformationalInput {
  outcome: InformationalOutcome;
  referralName?: string;
  referralContact?: string;
  nextSteps?: string;
  notes?: string;
}

export interface InformationalDigest {
  today: Informational[];
  thisWeek: Informational[];
  overdue: Informational[];
  needsPreparation: Informational[];
  summary: {
    todayCount: number;
    weekCount: number;
    overdueCount: number;
    needsPrepCount: number;
  };
}

export interface TimeSlot {
  start: string;
  end: string;
}

export interface AvailabilityResponse {
  date: string;
  timezone: string;
  workHours: { start: string; end: string };
  duration: number;
  availableSlots: TimeSlot[];
  busyTimes: TimeSlot[];
}

// Calendar event types (for Google Calendar)
export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  htmlLink?: string;
}

export interface GoogleCalendar {
  id: string;
  name: string;
  primary: boolean;
  accessRole: string;
  backgroundColor: string;
}
