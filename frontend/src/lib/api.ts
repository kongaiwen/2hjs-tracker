import axios from 'axios';
import type {
  Employer,
  Contact,
  Outreach,
  EmailTemplate,
  ChatMessage,
  TodayReminders,
  OutreachStats,
  CreateEmployerInput,
  CreateContactInput,
  CreateOutreachInput,
  GenerateEmailInput,
  ContactSegment,
  ResponseType,
  Informational,
  InformationalDigest,
  CreateInformationalInput,
  CompleteInformationalInput,
  AvailabilityResponse,
  CalendarEvent,
  GoogleCalendar,
} from '@/types';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Cloudflare Access handles authentication via CF-Access-User-Email header
// No JWT interceptor needed

// Auth API endpoints (simplified - only me endpoint needed for Cloudflare Access)
export const authApi = {
  me: () => api.get('/api/auth/me'),
  updateKeys: (publicKey: string, keyFingerprint?: string, encryptedData?: string) =>
    api.put('/api/auth/keys', { publicKey, keyFingerprint, encryptedData }),
};

// Employers
export const employersApi = {
  getAll: () => api.get<{ employers: Employer[] }>('/api/employers').then((r) => r.data.employers),
  getOne: (id: string) => api.get<{ employer: Employer }>(`/api/employers/${id}`).then((r) => r.data.employer),
  getTopFive: () => api.get<{ employers: Employer[] }>('/api/employers/top/five').then((r) => r.data.employers),
  create: (data: CreateEmployerInput) =>
    api.post<{ employer: Employer }>('/api/employers', data).then((r) => r.data.employer),
  update: (id: string, data: Partial<CreateEmployerInput>) =>
    api.put<{ employer: Employer }>(`/api/employers/${id}`, data).then((r) => r.data.employer),
  delete: (id: string) => api.delete(`/api/employers/${id}`),
  import: (employers: CreateEmployerInput[]) =>
    api.post<{ created: number }>('/api/employers/import', { employers }).then((r) => r.data),
  reorder: (employerIds: string[]) =>
    api.post('/api/employers/reorder', { employerIds }).then((r) => r.data),
  resort: () =>
    api.post('/api/employers/resort').then((r) => r.data),
  toggleLock: (id: string, isLocked: boolean) =>
    api.patch(`/api/employers/${id}/lock`, { isLocked }).then((r) => r.data),
};

// Contacts
export const contactsApi = {
  getAll: () => api.get<{ contacts: Contact[] }>('/api/contacts').then((r) => r.data.contacts),
  getByEmployer: (employerId: string) =>
    api.get<{ contacts: Contact[] }>(`/api/contacts/employer/${employerId}`).then((r) => r.data.contacts),
  getOne: (id: string) => api.get<{ contact: Contact }>(`/api/contacts/${id}`).then((r) => r.data.contact),
  create: (data: CreateContactInput) =>
    api.post<{ contact: Contact }>('/api/contacts', data).then((r) => r.data.contact),
  update: (id: string, data: Partial<CreateContactInput>) =>
    api.put<{ contact: Contact }>(`/api/contacts/${id}`, data).then((r) => r.data.contact),
  updateSegment: (id: string, segment: ContactSegment) =>
    api.put<Contact>(`/api/contacts/${id}/segment`, { segment }).then((r) => r.data),
  delete: (id: string) => api.delete(`/api/contacts/${id}`),
  reorder: (contactIds: string[]) =>
    api.post('/api/contacts/reorder', { contactIds }).then((r) => r.data),
};

// Outreach
export const outreachApi = {
  getAll: () => api.get<{ outreach: Outreach[] }>('/api/outreach').then((r) => r.data.outreach),
  getToday: () => api.get<TodayReminders>('/api/outreach/today').then((r) => r.data),
  getOne: (id: string) => api.get<{ outreach: Outreach }>(`/api/outreach/${id}`).then((r) => r.data.outreach),
  getStats: () => api.get<OutreachStats>('/api/outreach/stats/summary').then((r) => r.data),
  create: (data: CreateOutreachInput) =>
    api.post<{ outreach: Outreach }>('/api/outreach', data).then((r) => r.data.outreach),
  recordResponse: (
    id: string,
    data: { responseAt: string; responseType: ResponseType; notes?: string }
  ) =>
    api
      .post<{ outreach: Outreach; segment: ContactSegment; isBooster: boolean }>(
        `/api/outreach/${id}/response`,
        data
      )
      .then((r) => r.data),
  recordFollowUp: (id: string, body: string) =>
    api.post<Outreach>(`/api/outreach/${id}/follow-up`, { body }).then((r) => r.data),
  markMovedOn: (id: string) =>
    api.post<Outreach>(`/api/outreach/${id}/move-on`).then((r) => r.data),
  markNoResponse: (id: string) =>
    api.post<Outreach>(`/api/outreach/${id}/no-response`).then((r) => r.data),
  createCalendarEvents: (id: string) =>
    api
      .post<{ success: boolean; calendarEvents: { threeB: string | null; sevenB: string | null } }>(
        `/api/outreach/${id}/calendar-events`
      )
      .then((r) => r.data),
};

// Templates
export const templatesApi = {
  getAll: () => api.get<{ templates: EmailTemplate[] }>('/api/templates').then((r) => r.data.templates),
  getByType: (type: string) =>
    api.get<{ templates: EmailTemplate[] }>(`/api/templates/type/${type}`).then((r) => r.data.templates),
  getOne: (id: string) => api.get<{ template: EmailTemplate }>(`/api/templates/${id}`).then((r) => r.data.template),
  create: (data: Partial<EmailTemplate>) =>
    api.post<{ template: EmailTemplate }>('/api/templates', data).then((r) => r.data.template),
  update: (id: string, data: Partial<EmailTemplate>) =>
    api.put<{ template: EmailTemplate }>(`/api/templates/${id}`, data).then((r) => r.data.template),
  delete: (id: string) => api.delete(`/api/templates/${id}`),
  generate: (id: string, data: GenerateEmailInput) =>
    api
      .post<{ subject: string; body: string; wordCount: number; warnings: string[]; meetsGuidelines: boolean }>(
        `/api/templates/${id}/generate`,
        data
      )
      .then((r) => r.data),
  seed: () => api.post<{ success: boolean; seeded: number }>('/api/templates/seed').then((r) => r.data),
};

// Google
export const googleApi = {
  getAuthUrl: () => api.get<{ authUrl: string }>('/api/google/auth').then((r) => r.data),
  getStatus: () =>
    api.get<{ isAuthenticated: boolean; isExpired: boolean | null }>('/api/google/status').then((r) => r.data),
  createDraft: (data: { to: string; subject: string; body: string }) =>
    api.post<{ draftId: string; messageId: string }>('/api/google/gmail/draft', data).then((r) => r.data),
  getDrafts: () => api.get('/api/google/gmail/drafts').then((r) => r.data),
  createCalendarEvent: (data: { summary: string; description?: string; startTime: string; endTime?: string }) =>
    api.post<{ eventId: string; htmlLink: string }>('/api/google/calendar/event', data).then((r) => r.data),
  getCalendarEvents: () => api.get('/api/google/calendar/events').then((r) => r.data),
  deleteCalendarEvent: (eventId: string) => api.delete(`/api/google/calendar/event/${eventId}`),
  getCalendarList: () => api.get<GoogleCalendar[]>('/api/google/calendar/list').then((r) => r.data),
  getPreferredCalendar: () =>
    api.get<{ calendarId: string | null }>('/api/google/calendar/preferred').then((r) => r.data),
  setPreferredCalendar: (calendarId: string | null) =>
    api.put('/api/google/calendar/preferred', { calendarId }).then((r) => r.data),
  revoke: () => api.post('/api/google/revoke').then((r) => r.data),
};

// Claude
export const claudeApi = {
  chat: (data: { message: string; includeContext?: boolean }) =>
    api
      .post<{ message: string; usage: { input_tokens: number; output_tokens: number } }>('/api/claude/chat', data)
      .then((r) => r.data),
  getHistory: (limit?: number) =>
    api.get<ChatMessage[]>('/api/claude/history', { params: { limit } }).then((r) => r.data),
  clearHistory: () => api.delete('/api/claude/history').then((r) => r.data),
  reviewEmail: (data: { subject?: string; body: string; contactName?: string; employerName?: string }) =>
    api
      .post<{ review: string; wordCount: number; meetsWordLimit: boolean }>('/api/claude/review-email', data)
      .then((r) => r.data),
  generateTiaraQuestions: (data: {
    employerName?: string;
    contactTitle?: string;
    industry?: string;
    yourBackground?: string;
  }) => api.post<{ questions: unknown }>('/api/claude/tiara-questions', data).then((r) => r.data),
};

// Informationals
export const informationalsApi = {
  getAll: (params?: { contactId?: string; employerId?: string; status?: string; from?: string; to?: string }) =>
    api.get<Informational[]>('/api/informationals', { params }).then((r) => r.data),
  getUpcoming: (days?: number) =>
    api.get<Informational[]>('/api/informationals/upcoming', { params: { days } }).then((r) => r.data),
  getDigest: () => api.get<InformationalDigest>('/api/informationals/digest').then((r) => r.data),
  getOne: (id: string) => api.get<Informational>(`/api/informationals/${id}`).then((r) => r.data),
  create: (data: CreateInformationalInput) =>
    api.post<Informational & { calendarHtmlLink?: string }>('/api/informationals', data).then((r) => r.data),
  update: (id: string, data: Partial<CreateInformationalInput> & { bigFourAnswers?: Record<string, string>; updateCalendar?: boolean }) =>
    api.put<Informational>(`/api/informationals/${id}`, data).then((r) => r.data),
  complete: (id: string, data: CompleteInformationalInput) =>
    api.post<Informational>(`/api/informationals/${id}/complete`, data).then((r) => r.data),
  delete: (id: string, deleteCalendarEvent?: boolean) =>
    api.delete(`/api/informationals/${id}`, { params: { deleteCalendarEvent } }),
  getAvailability: (date: string, duration?: number) =>
    api.get<AvailabilityResponse>('/api/informationals/availability/slots', { params: { date, duration } }).then((r) => r.data),
  syncCalendar: (days?: number) =>
    api.post('/api/informationals/calendar/sync', { days }).then((r) => r.data),
};

// Extended Google API for calendar
export const calendarApi = {
  getEvents: (params?: { timeMin?: string; timeMax?: string }) =>
    api.get<CalendarEvent[]>('/api/google/calendar/events', { params }).then((r) => r.data),
  createEvent: (data: { summary: string; description?: string; startTime: string; endTime?: string }) =>
    api.post<{ eventId: string; htmlLink: string }>('/api/google/calendar/event', data).then((r) => r.data),
  deleteEvent: (eventId: string) => api.delete(`/api/google/calendar/event/${eventId}`),
};

export default api;
