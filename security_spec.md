# Speakly Studio Firestore Security Specification

## 1. Data Invariants
1. Default-deny catch-all rule (`allow read, write: if false;`) protects every unmapped path.
2. All user PII (`email`) is strictly isolated in `/users/{userId}/private/{docId}` and readable/writable only by the verified owner (`request.auth.uid == userId && email_verified == true`) or verified Admin (`isAdmin()`).
3. Users cannot self-assign elevated roles (`role == 'user'`), modify their own `remainingCredits` / `planId`, or tamper with `credit_transactions`, `pricing_plans`, `voice_overrides`, or `platform_public`.
4. Users may create a `payment_requests` document strictly in `status == 'pending'` for their own `userId`, and may cancel a `pending` request (`status: 'pending' -> 'cancelled'`), but cannot approve or reject payments or alter `creditsToGrant` / `amountUsd`.
5. Terminal payment states (`approved`, `rejected`, `cancelled`) are locked against user modification.
6. Sensitive collections (`admins`, `admin_accounts`, `api_integrations`, `audit_logs`) are completely inaccessible (`allow read, write: if false`) from client SDKs.
7. Every `allow list` rule enforces explicit `resource.data.userId == request.auth.uid` or `isAdmin()` without `get()`/`exists()` inside list evaluation where avoidable.
8. Timestamps (`createdAt`, `updatedAt`) on client writes must match `request.time`.

## 2. "Dirty Dozen" Adversarial Payloads
1. Unauthenticated read of `/users/u1/private/info` -> `PERMISSION_DENIED`.
2. Unverified email (`email_verified: false`) writing `/users/u1` even with matching `uid` -> `PERMISSION_DENIED`.
3. User creating `/users/u1` with `{ role: "admin" }` or `{ remainingCredits: 999999 }` on update -> `PERMISSION_DENIED`.
4. User updating `/users/u1` with a ghost field `{ isVerified: true }` -> `PERMISSION_DENIED`.
5. User spoofing another user's `userId` when creating `/projects/p1` -> `PERMISSION_DENIED`.
6. User submitting `/payment_requests/pay1` with `status: "approved"` directly -> `PERMISSION_DENIED`.
7. User updating `/payment_requests/pay1` from `pending` to `approved` -> `PERMISSION_DENIED`.
8. User updating `/payment_requests/pay1` after it is `rejected` -> `PERMISSION_DENIED`.
9. User writing directly to `/credit_transactions/tx1` -> `PERMISSION_DENIED`.
10. User querying `/projects` without `where('userId', '==', uid)` -> `PERMISSION_DENIED`.
11. User injecting a 2KB oversized ID or 100KB script title -> `PERMISSION_DENIED`.
12. Any client attempting to read or write `/audit_logs/log1` or `/api_integrations/int1` -> `PERMISSION_DENIED`.
