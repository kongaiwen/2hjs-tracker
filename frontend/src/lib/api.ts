import axios, { type InternalAxiosRequestConfig, type AxiosResponse } from 'axios';
import type {
  Employer,
  Contact,
  Outreach,
  EmailTemplate,
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
import {
  encryptRecord,
  decryptRecord,
  decryptRecords,
  hasEncryptionKeys,
  getSensitiveFields,
  type EntityType,
} from '@/services/encryptionService';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── URL → EntityType mapping ────────────────────────────────────────────────

function urlToEntityType(url: string): EntityType | null {
  if (/\/api\/employers/.test(url)) return 'employer';
  if (/\/api\/contacts/.test(url)) return 'contact';
  if (/\/api\/outreach/.test(url)) return 'outreach';
  if (/\/api\/informationals/.test(url)) return 'informational';
  if (/\/api\/templates/.test(url)) return 'emailTemplate';
  if (/\/api\/settings/.test(url)) return 'settings';
  return null;
}

// Placeholder values for NOT NULL columns when data is encrypted
const NOT_NULL_PLACEHOLDERS: Partial<Record<EntityType, Record<string, any>>> = {
  employer: { name: '[encrypted]' },
  contact: { name: '[encrypted]' },
  outreach: { subject: '[encrypted]', body: '[encrypted]' },
  emailTemplate: { name: '[encrypted]', subject: '[encrypted]', body: '[encrypted]' },
};

// ─── Request interceptor: encrypt outgoing data ──────────────────────────────

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const method = config.method?.toLowerCase();
  if (!method || !['post', 'put', 'patch'].includes(method)) return config;
  if (!config.data || typeof config.data !== 'object') return config;

  const url = config.url || '';
  const entityType = urlToEntityType(url);
  if (!entityType) return config;

  // Skip non-data endpoints (reorder, resort, lock, response, etc.)
  if (/\/(reorder|resort|lock|response|follow-up|move-on|no-response|calendar-events|segment|import|generate|seed|revoke)/.test(url)) {
    return config;
  }

  const keysExist = await hasEncryptionKeys();
  if (!keysExist) return config;

  try {
    const encrypted = await encryptRecord(entityType, config.data);

    // Set placeholder values for NOT NULL fields so server validation passes
    const placeholders = NOT_NULL_PLACEHOLDERS[entityType];
    if (placeholders && encrypted.encryptedData) {
      const sensitiveFields = getSensitiveFields(entityType);
      for (const field of sensitiveFields) {
        if (field in placeholders) {
          encrypted[field] = placeholders[field];
        } else {
          // Null out other sensitive fields
          encrypted[field] = null;
        }
      }
    }

    config.data = encrypted;
  } catch {
    // Encryption failed — send plaintext rather than block the user
  }

  return config;
});

// ─── Response interceptor: decrypt incoming data ─────────────────────────────

api.interceptors.response.use(async (response: AxiosResponse) => {
  const url = response.config.url || '';

  const keysExist = await hasEncryptionKeys();
  if (!keysExist) return response;

  const data = response.data;
  if (!data || typeof data !== 'object') return response;

  // Special case: bulk export contains multiple entity types
  if (/\/api\/bulk\/export/.test(url)) {
    try {
      if (Array.isArray(data.employers)) data.employers = await decryptRecords('employer', data.employers);
      if (Array.isArray(data.contacts)) data.contacts = await decryptRecords('contact', data.contacts);
      if (Array.isArray(data.outreach)) data.outreach = await decryptRecords('outreach', data.outreach);
      if (Array.isArray(data.templates)) data.templates = await decryptRecords('emailTemplate', data.templates);
      if (Array.isArray(data.informationals)) data.informationals = await decryptRecords('informational', data.informationals);
    } catch { /* decryption failed — return as-is */ }
    return response;
  }

  const entityType = urlToEntityType(url);
  if (!entityType) return response;

  try {
    // Handle different response shapes per entity type
    // Wrapped single: { employer: {...} }, { contact: {...} }, etc.
    // Wrapped array:  { employers: [...] }, { contacts: [...] }, etc.
    // Direct array:   [...] (informationals)
    // Nested:         { threeBReminders: [...], sevenBReminders: [...] } (outreach/today)

    if (entityType === 'outreach' && url.includes('/today')) {
      // Special case: /outreach/today returns nested arrays
      for (const key of ['threeBReminders', 'sevenBReminders', 'overdueItems', 'upcomingItems']) {
        if (Array.isArray(data[key])) {
          const decrypted = await decryptRecords('outreach', data[key]);
          // Mark which records were decrypted from encryptedData for migration to skip
          data[key] = decrypted.map((r, i) => ({ ...r, _wasEncrypted: !!data[key][i].encryptedData }));
        }
      }
    } else if (Array.isArray(data)) {
      // Direct array response - track original encryption status before decrypting
      const originalEncryptedStatus = data.map(r => !!r.encryptedData);
      response.data = await decryptRecords(entityType, data);
      // Mark which records were decrypted from encryptedData for migration to skip
      response.data = response.data.map((r: any, i: number) => ({ ...r, _wasEncrypted: originalEncryptedStatus[i] }));
    } else {
      // Check for wrapped responses
      const singularKeys: Record<EntityType, string> = {
        employer: 'employer',
        contact: 'contact',
        outreach: 'outreach',
        informational: 'informational',
        emailTemplate: 'template',
        settings: 'settings',
      };
      const pluralKeys: Record<EntityType, string> = {
        employer: 'employers',
        contact: 'contacts',
        outreach: 'outreach',
        informational: 'informationals',
        emailTemplate: 'templates',
        settings: 'settings',
      };

      const pluralKey = pluralKeys[entityType];
      const singularKey = singularKeys[entityType];

      if (pluralKey && Array.isArray(data[pluralKey])) {
        const originalEncryptedStatus = data[pluralKey].map((r: any) => !!r.encryptedData);
        data[pluralKey] = await decryptRecords(entityType, data[pluralKey]);
        // Mark which records were decrypted from encryptedData for migration to skip
        data[pluralKey] = data[pluralKey].map((r: any, i: number) => ({ ...r, _wasEncrypted: originalEncryptedStatus[i] }));
      } else if (singularKey && data[singularKey] && typeof data[singularKey] === 'object' && !Array.isArray(data[singularKey])) {
        const wasEncrypted = !!data[singularKey].encryptedData;
        data[singularKey] = await decryptRecord(entityType, data[singularKey]);
        data[singularKey]._wasEncrypted = wasEncrypted;
      }
    }
  } catch {
    // Decryption failed — return response as-is
  }

  return response;
});

// Cloudflare Access handles authentication via CF-Access-User-Email header
// No JWT interceptor needed

// Auth API endpoints (simplified - only me endpoint needed for Cloudflare Access)
export const authApi = {
  me: () => api.get('/api/auth/me'),
  updateKeys: (publicKey: string, keyFingerprint?: string, encryptedData?: string, wrappedPrivateKey?: string) =>
    api.put('/api/auth/keys', { publicKey, keyFingerprint, encryptedData, wrappedPrivateKey }),
  updateWrappedKey: (wrappedPrivateKey: string) =>
    api.put('/api/auth/keys', { wrappedPrivateKey }),
  getWrappedKey: () =>
    api.get<{ wrappedPrivateKey: string | null }>('/api/auth/keys/wrapped').then((r) => r.data),
  deleteAllData: () => api.delete('/api/auth/data'),
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

// Informationals
export const informationalsApi = {
  getAll: (params?: { contactId?: string; employerId?: string; status?: string; from?: string; to?: string }) =>
    api.get<{ informationals: Informational[] }>('/api/informationals', { params }).then((r) => r.data.informationals),
  getUpcoming: (days?: number) =>
    api.get<{ informationals: Informational[] }>('/api/informationals/upcoming', { params: { days } }).then((r) => r.data.informationals),
  getDigest: () => api.get<InformationalDigest>('/api/informationals/digest').then((r) => r.data),
  getOne: (id: string) => api.get<{ informational: Informational }>(`/api/informationals/${id}`).then((r) => r.data.informational),
  create: (data: CreateInformationalInput) =>
    api.post<{ informational: Informational & { calendarHtmlLink?: string } }>('/api/informationals', data).then((r) => r.data.informational),
  update: (id: string, data: Partial<CreateInformationalInput> & { bigFourAnswers?: Record<string, string>; updateCalendar?: boolean }) =>
    api.put<{ informational: Informational }>(`/api/informationals/${id}`, data).then((r) => r.data.informational),
  complete: (id: string, data: CompleteInformationalInput) =>
    api.post<{ informational: Informational }>(`/api/informationals/${id}/complete`, data).then((r) => r.data.informational),
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
