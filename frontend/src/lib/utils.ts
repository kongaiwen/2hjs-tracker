import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function getSegmentColor(segment: string): string {
  switch (segment) {
    case 'BOOSTER':
      return 'segment-booster';
    case 'OBLIGATE':
      return 'segment-obligate';
    case 'CURMUDGEON':
      return 'segment-curmudgeon';
    default:
      return 'segment-unknown';
  }
}

export function getSegmentLabel(segment: string): string {
  switch (segment) {
    case 'BOOSTER':
      return 'Booster';
    case 'OBLIGATE':
      return 'Obligate';
    case 'CURMUDGEON':
      return 'Curmudgeon';
    default:
      return 'Unknown';
  }
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Draft',
    SENT: 'Sent',
    AWAITING_3B: 'Awaiting 3B',
    MOVED_ON: 'Moved On',
    AWAITING_7B: 'Awaiting 7B',
    FOLLOWED_UP: 'Followed Up',
    RESPONDED: 'Responded',
    SCHEDULED: 'Scheduled',
    COMPLETED: 'Completed',
    NO_RESPONSE: 'No Response',
  };
  return labels[status] || status;
}

export function countWords(text: string): number {
  return text
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
}

export function getLAMPScore(employer: { motivation: number; posting: number; advocacy: boolean }): number {
  // Simple weighted score for display purposes
  return employer.motivation * 100 + employer.posting * 10 + (employer.advocacy ? 1 : 0);
}

export function getMotivationLabel(score: number): string {
  switch (score) {
    case 3:
      return 'Dream Employer';
    case 2:
      return 'Interested';
    case 1:
      return 'Least Motivated';
    case 0:
      return 'Unfamiliar';
    default:
      return 'Unknown';
  }
}

export function getPostingLabel(score: number): string {
  switch (score) {
    case 3:
      return 'Very Relevant';
    case 2:
      return 'Somewhat Relevant';
    case 1:
      return 'No Relevant Postings';
    default:
      return 'Unknown';
  }
}

export function getContactMethodLabel(method: string | null): string {
  if (!method) return 'Not set';
  const labels: Record<string, string> = {
    LINKEDIN_GROUP: 'LinkedIn Group',
    DIRECT_EMAIL_ALUMNI: 'Direct Email (Alumni)',
    DIRECT_EMAIL_HUNTER: 'Direct Email (Hunter.io)',
    FAN_MAIL: 'Fan Mail',
    LINKEDIN_CONNECT: 'LinkedIn Connect',
    SOCIAL_MEDIA: 'Social Media',
    SECOND_DEGREE: 'Second Degree',
  };
  return labels[method] || method;
}
