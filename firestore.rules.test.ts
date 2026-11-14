/**
 * Security specification verification harness for Speakly Studio Firestore Rules.
 * Covers all 12 "Dirty Dozen" adversarial payloads defined in security_spec.md.
 */
export interface DirtyDozenCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expected: 'PERMISSION_DENIED';
  description: string;
}

export const DIRTY_DOZEN_SECURITY_CASES: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated PII Read',
    collectionPath: 'users/u1/private/info',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    description: 'Unauthenticated visitor attempting to read isolated user PII.',
  },
  {
    id: 2,
    name: 'Unverified Email Spoof',
    collectionPath: 'users/u1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    description: 'User token with email_verified == false attempting profile creation.',
  },
  {
    id: 3,
    name: 'Privilege & Credit Escalation',
    collectionPath: 'users/u1',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    description: 'Standard user modifying role or remainingCredits directly.',
  },
  {
    id: 4,
    name: 'Shadow Ghost Field Injection',
    collectionPath: 'users/u1',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    description: 'Update payload introducing unallowlisted key isVerified.',
  },
  {
    id: 5,
    name: 'Cross-Tenant Project Spoofing',
    collectionPath: 'projects/proj_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    description: 'Authenticated user creating a project with another userId.',
  },
  {
    id: 6,
    name: 'Direct Payment Pre-Approval',
    collectionPath: 'payment_requests/pay_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    description: 'User submitting a payment request with status == approved.',
  },
  {
    id: 7,
    name: 'User Self-Approval Update',
    collectionPath: 'payment_requests/pay_1',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    description: 'User attempting to transition pending payment to approved.',
  },
  {
    id: 8,
    name: 'Terminal State Mutation',
    collectionPath: 'payment_requests/pay_1',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    description: 'User modifying a rejected or approved payment record.',
  },
  {
    id: 9,
    name: 'Credit Ledger Forgery',
    collectionPath: 'credit_transactions/tx_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    description: 'Non-admin user creating a synthetic credit ledger row.',
  },
  {
    id: 10,
    name: 'Unscoped Collection Scrape',
    collectionPath: 'projects',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
    description: 'User querying projects without owner userId constraint.',
  },
  {
    id: 11,
    name: 'Resource Poisoning Oversized ID',
    collectionPath: 'projects/' + 'x'.repeat(200),
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    description: 'Document ID exceeding 128-character isValidId boundary.',
  },
  {
    id: 12,
    name: 'Locked Admin/Audit Collection Access',
    collectionPath: 'audit_logs/log_1',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    description: 'Client SDK attempting to read or mutate server-only audit_logs or api_integrations.',
  },
];
