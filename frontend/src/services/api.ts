/**
 * API Client
 *
 * Simplified API client for Cloudflare Workers backend.
 * Authentication is handled by Cloudflare Access - no JWT needed.
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api';

interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: any;
  headers?: Record<string, string>;
}

/**
 * Make an authenticated API request
 * Note: No need to send Authorization header - Cloudflare Access handles it
 */
export async function apiRequest<T = any>(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const { method = 'GET', body, headers = {} } = options;

  const config: RequestInit = {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, config);

  // Handle 401 Unauthorized - Cloudflare Access session might have expired
  if (response.status === 401) {
    // Redirect to login page
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  // Handle other errors
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || error.message || 'Request failed');
  }

  return response.json();
}

/**
 * API endpoints
 */
export const api = {
  // Auth
  getMe: () => apiRequest('/auth/me'),
  updateKeys: (publicKey: string, keyFingerprint?: string, encryptedData?: string) =>
    apiRequest('/auth/keys', {
      method: 'PUT',
      body: { publicKey, keyFingerprint, encryptedData },
    }),

  // Employers
  getEmployers: () => apiRequest('/employers'),
  getEmployer: (id: string) => apiRequest(`/employers/${id}`),
  createEmployer: (data: any) => apiRequest('/employers', { method: 'POST', body: data }),
  updateEmployer: (id: string, data: any) =>
    apiRequest(`/employers/${id}`, { method: 'PUT', body: data }),
  deleteEmployer: (id: string) => apiRequest(`/employers/${id}`, { method: 'DELETE' }),

  // Contacts
  getContacts: (employerId?: string) =>
    apiRequest(`/contacts${employerId ? `?employerId=${employerId}` : ''}`),
  getContact: (id: string) => apiRequest(`/contacts/${id}`),
  createContact: (data: any) => apiRequest('/contacts', { method: 'POST', body: data }),
  updateContact: (id: string, data: any) =>
    apiRequest(`/contacts/${id}`, { method: 'PUT', body: data }),
  deleteContact: (id: string) => apiRequest(`/contacts/${id}`, { method: 'DELETE' }),

  // Outreach
  getOutreach: (employerId?: string, contactId?: string) => {
    const params = new URLSearchParams();
    if (employerId) params.set('employerId', employerId);
    if (contactId) params.set('contactId', contactId);
    return apiRequest(`/outreach?${params.toString()}`);
  },
  createOutreach: (data: any) => apiRequest('/outreach', { method: 'POST', body: data }),

  // Informationals
  getInformationals: () => apiRequest('/informationals'),
  createInformational: (data: any) =>
    apiRequest('/informationals', { method: 'POST', body: data }),

  // Templates
  getTemplates: () => apiRequest('/templates'),
  createTemplate: (data: any) => apiRequest('/templates', { method: 'POST', body: data }),

  // Settings
  getSettings: () => apiRequest('/settings'),
  updateSettings: (data: any) => apiRequest('/settings', { method: 'PUT', body: data }),

  // Chat
  getChatMessages: (limit = 50) => apiRequest(`/chat?limit=${limit}`),
  createChatMessage: (role: string, content: string, metadata?: any) =>
    apiRequest('/chat', { method: 'POST', body: { role, content, metadata } }),
  clearChat: () => apiRequest('/chat', { method: 'DELETE' }),

  // Admin
  getAdminStats: () => apiRequest('/admin/stats'),
  getAdminUsers: () => apiRequest('/admin/users'),
  getUserUsage: (userId: string) => apiRequest(`/admin/users/${userId}/usage`),
};

export default api;
