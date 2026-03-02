import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { employersApi, contactsApi } from '@/lib/api';
import type { Employer, Contact, Outreach, Informational } from '@/types';

/**
 * Hook that fetches decrypted employers and contacts, then patches
 * records (outreach, informationals) with the resolved names.
 *
 * This works around the E2E encryption issue where server-side JOINs
 * return [encrypted] placeholders for sensitive fields.
 */
export function useDecryptedData() {
  // Fetch all employers and contacts (these will be decrypted by the response interceptor)
  const { data: employers, isLoading: loadingEmployers } = useQuery({
    queryKey: ['employers'],
    queryFn: employersApi.getAll,
  });

  const { data: contacts, isLoading: loadingContacts } = useQuery({
    queryKey: ['contacts'],
    queryFn: contactsApi.getAll,
  });

  // Create lookup maps
  const employerMap = useMemo(() => {
    if (!employers) return new Map();
    return new Map(employers.map((e: Employer) => [e.id, e]));
  }, [employers]);

  const contactMap = useMemo(() => {
    if (!contacts) return new Map();
    return new Map(contacts.map((c: Contact) => [c.id, c]));
  }, [contacts]);

  const isLoading = loadingEmployers || loadingContacts;

  return { employerMap, contactMap, employers, contacts, isLoading };
}

/**
 * Patch outreach records with decrypted employer and contact names
 */
export function usePatchedOutreach(outreach?: Outreach[]) {
  const { employerMap, contactMap, isLoading } = useDecryptedData();

  const patchedOutreach = useMemo(() => {
    if (!outreach || isLoading) return outreach;

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
  }, [outreach, employerMap, contactMap, isLoading]);

  return { patchedOutreach, isLoading };
}

/**
 * Patch informational records with decrypted employer and contact names
 */
export function usePatchedInformationals(informationals?: Informational[]) {
  const { employerMap, contactMap, isLoading } = useDecryptedData();

  const patchedInformationals = useMemo(() => {
    if (!informationals || isLoading) return informationals;

    return informationals.map((inf: Informational) => {
      const contact = contactMap.get(inf.contactId);
      const employer = employerMap.get(contact?.employerId || '');

      // Create a patched version with decrypted names
      return {
        ...inf,
        contact: contact ? {
          ...inf.contact,
          name: contact.name,
          employer: employer ? { id: employer.id, name: employer.name } : inf.contact?.employer,
        } : inf.contact,
      } as Informational;
    });
  }, [informationals, contactMap, employerMap, isLoading]);

  return { patchedInformationals, isLoading };
}
