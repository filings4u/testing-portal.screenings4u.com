# Screenings4u unified Labcorp workflow

## Public interfaces (requested)
- **screenings4u.com**: public catalog, checkout, payment confirmation.
- **test-portal.screenings4u.com**: staff management of orders, donor assignments, Labcorp submissions, reconciliation and results.
- **customer.screenings4u.com**: customer purchases, donor assignment, donor passes, order tracking and results where authorized.
- **Labcorp OTS**: DEV certification account/panel registration and status/results.

**DNS note:** Repository `testing-portal.screenings4u.com` uses a different hostname from requested `test-portal.screenings4u.com`. Confirm DNS/hosting routing before cutover. Also verify the customer-portal repository and deployed site separately.

## Required end-to-end contract
1. Public checkout creates exactly one `orders` record with `order_items`; Stripe-confirmed payments are the only basis for marking paid.
2. Every purchased testing service is visible in the staff management portal under the same `order_id`, including order items and customer association.
3. A customer can assign donor details to an eligible purchased test; this must persist through the customer portal, management portal and Labcorp registration.
4. Admin-placed/phone orders can use the same model but remain unpaid until legitimate payment or an explicitly authorized non-payment disposition.
5. Labcorp DEV account and approved panel mapping are checked server-side. Manual and paid automation call the **same** registration engine, with different eligibility rules.
6. Registration is idempotently claimed. On uncertain responses/timeout, mark `manual_reconciliation_required`, reconcile via Labcorp lookup before any retry. Save returned registration number as an exact string.
7. Generate a branded donor pass only when registration and site/fulfillment details are sufficient. Do not imply a Labcorp registration exists for a draft.
8. Branded transactional email dispatch must be idempotent and connected to verified order/pass events; store delivery audit and avoid sensitive information in email/logs.
9. Customer access uses per-user authorization/RLS; admin access uses role checking. Service-role credentials and OTS credentials never appear in browser code.
10. Webhook signature verification, audit event history and safe retry boundaries apply to each transition.

## System of record
Supabase project: `elpbnytpciqnbexiaebp`.
Key records: `orders`, `order_items`, `testing_labcorp_orders`, `testing_cases`, `testing_donor_passes`.
Staff: `testing-order-management`, `testing-labcorp-order-management`, `testing-labcorp-register-shared`, `testing-labcorp-auto-preflight`, `testing-labcorp-auto-worker`. Payments: `stripe-webhook`.

## Deployment gates
- [ ] Confirm exact hosting/domain aliases for all three sites.
- [ ] Identify customer portal GitHub repository and actual API functions.
- [ ] Audit every public testing product checkout path into central orders.
- [ ] Audit paid-order to customer-portal donor assignment and management-order sync.
- [ ] Validate Labcorp SOAP request/response against supplied WSDL with mock test cases.
- [ ] Reconcile existing uncertain DEV submissions before retry.
- [ ] Validate branded email event trigger and delivery on test data.
- [ ] Perform one authorized DEV end-to-end order and donor pass test.
- [ ] Only then simplify navigation and deprecate unused pages, with safe redirects.
- [ ] Preserve production records, non-testing orders, payment/audit history until dependencies verified.

## Safe cleanup
Do not delete tables, edge functions, legacy website pages, or Stripe handlers just because they are not on the primary workflow list. First prove no remaining referenced dependencies, then stage deprecation in a separate PR.
