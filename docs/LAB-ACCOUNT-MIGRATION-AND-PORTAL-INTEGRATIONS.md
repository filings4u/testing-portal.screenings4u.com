# Workforce Testing Portal — management ownership and integration map
Updated: 2026-11-10

## Ownership
`testing-portal.screenings4u.com` is the management workspace for drug/alcohol testing, cases, results, collection/laboratory operations, and laboratory account administration.

The following administrative pages were migrated from `app.screenings4u.com`:
- `lab-companies.html` — purchased company profiles and company links
- `lab-supplies.html` — lab supply shipments and fulfillment
- `lab-tracking.html` and `lab-tracking-number.html` — carrier and shipment tracking
- `lab-account-numbers.html` — assigned lab numbers
- `lab-onboarding.html` — intake and account activation

These screens share `assets/js/lab-module.js` and `assets/css/lab-account-admin.css`; they authenticate through the Testing Portal guard and Testing staff context. All data calls still target the existing Supabase project `elpbnytpciqnbexiaebp`; no database or customer records were cloned.

`app.screenings4u.com/lab-overview.html` is the Workforce view-only front-end. The original five management paths now redirect to that overview. The overview contains no save/edit/create forms and is not the administrative source of truth.

## Connected consumer applications
| Repository | Consumer role | Testing Portal authoritative area |
|---|---|---|
| `app.screenings4u.com` | Workforce oversight only | Lab metrics / cross-business status |
| `ctpa.screenings4u.com` | C/TPA testing and customers | Testing operations, results, lab accounts |
| `owner-operator.screenings4u.com` | Owner-operator testing workflows | Testing orders, status, results |
| `employer-non-dot.screenings4u.com` | NON-DOT employer testing | Testing orders, status, results |
| `customers.screenings4u.com` | Customer testing portal | Testing customer portal and cases |
| `lab-account.screenings4u.com` | Lab customer portal and requests | Lab accounts, fulfillment, tracking |

## Existing API boundaries
- Testing Portal management: `testing-management-context`, `testing-management-read`, `testing-operations-management`, `testing-case-management`, `testing-customer-management`, `testing-result-management`.
- Lab administration: `enterprise-forms-management`, `lab-account-management`, `house-lab-fulfillment-management`, `house-lab-ctpa-provision`.
- Customer applications: existing testing and lab-account functions retain their customer entitlement gates; customer data must remain scoped by user/organization and only released testing results may be customer visible.
- Lab management and fulfillment functions verify active testing business access on the server.

## Deployment and validation requirements
1. Confirm that the authenticated Testing Portal staff session is authorized for all four lab management functions, including form submission updates, lab account saves, fulfillment, and provisioning.
2. Confirm that Workforce Management can load view-only purchase data; optional cross-business metrics should be unavailable rather than expose unauthorized sensitive records.
3. **Deployed:** updated `lab-account-supplies` Edge Function version 20 links staff to Testing Portal.
4. **Deployed:** customer-submitted Lab Account supply-request review is available at `testing-portal.screenings4u.com/lab-supply-requests.html` with testing-staff authorization. Independent Contractor supply operations remain separate.
5. Test full integration with the six consumer portals for entitlement-based reads, role boundaries, new orders, shipment status, customer notices, and results release. These integrations have **not** been verified end to end in this migration.
6. Do not migrate backend secrets into front-end JS or duplicate customer tables. Preserve authoritative identities and server-side access control.

## November 10 implementation update
- Workforce branding replaces visible "Management" labels in the shared Testing and Workforce portal shells. Browser titles are normalized at runtime; legacy file names, route names and Supabase function slugs remain unchanged for compatibility.
- The customer-request review screen is now `lab-supply-requests.html`. It uses the dedicated `testing-lab-supply-requests` Edge Function; this function is deployed and active. The function checks authenticated active staff, an active testing-business grant, and edit-level grants before transitions, scopes requests to Lab Account users, requires carrier/tracking when shipping, and records customer notification delivery attempts.
- `lab-account-supplies` Edge Function was deployed as version 20 with its administrative email link pointing at Testing Portal. Customer-facing email links continue to use the Lab Account site.
- Live database consistency audit: 2 supply requests and 2 lab shipments; 3 Lab Account purchases; 30 testing cases. No orphaned supply lines, lab shipments, or case-to-`orders` references. The 16 case order IDs initially absent from `testing_orders` reference `orders`, the actual declared foreign-key target, and were not orphaned.
- All six repositories were located and checked; each uses the same Supabase project, including `lab-account` via its root-level `config.js`. This confirms a shared backing database, not end-to-end portal behavior.
- **Outstanding authenticated verification:** staff create/edit/approve and save operations across migrated lab pages; unauthorized staff denial behavior; customer order submission and notification receipt; customer visibility of only released results; C/TPA, owner-operator, NON-DOT employer, customers, and Lab Account complete journeys.
- The existing independent-contractor supply workflow is intentionally preserved, because it also serves non-lab contractor operations. Only lab customer request review was transferred to the Testing Portal.

## Paid Lab Account upgrade checkout (November 11, 2026)

**Workflow:** Lab Account Store `lab-account.screenings4u.com/store.html` → authenticated `lab-portal-store` action `begin_checkout` → expiring, one-time upgrade token → `screenings4u.com/checkout.html?service=lab-upgrade-...&upgrade_token=...` → `lab-upgrade-checkout-preview` → website `create-payment-intent` validates token, customer identity, current/target plan and price difference → Stripe webhook updates paid order and finalizes `lab_portal_upgrade_requests` → `lab-account-entitlement` verifies the paid upgrade → order confirmation returns user to the existing Lab Account store.

- Eligible one-time upgrade charges are authoritative differences between active `service_prices`: Lab→Consortium **$175**, Lab→Consortium+Docs **$230**, Consortium→+Docs **$55**. A mismatch between current setup prices and upgrade prices blocks checkout rather than silently changing charge amounts.
- Automatic paid activation replaces staff approval. All three `lab_portal_upgrade_paths.checkout_enabled` flags are enabled; upgrade requests permit only `checkout_pending`, `completed`, `cancelled`. The Testing Portal upgrade page is payment activity/history only.
- The Stripe webhook matches paid PaymentIntent + `orders` + `order_items` + the owner's upgrade request, updates the existing commercial Lab Account tier and marks the request completed, retaining all existing lab account records, supply history and results.
- Existing checkout confirmation/receipt emails continue. The paid Lab upgrade email does not generate another customer password invitation.
- Three commercial package SKUs remain unchanged. The service catalog includes canonical `lab_package_level`, `lab_consortium_included`, and `lab_consortium_addon_eligible` metadata. The storefront only offers the **$125/month** consortium add-on to the **$286.30 Lab Account** tier; higher packages include consortium access, so the add-on is hidden for them.
- **Not yet live:** the separate recurring $125/month consortium add-on remains in draft state without a verified Stripe recurring price, subscription checkout and renewal webhook mapping. Do not advertise it as buyable or mark it live prematurely. Existing DOT C/TPA Essential $125, Professional $225 and Enterprise $375 monthly plan billing is a separate catalog and was not modified.
- Existing platform features marked `planned` in `lab_portal_feature_catalog` are not promised as functioning screens. Authenticated end-to-end Stripe payment, webhook, portal feature validation and recurring-billing regression tests remain pending before declaring the overall workflow fully tested.

## Purchased plan-specific workspaces (November 11, 2026)

- **Customer Workforce Lab Account:** `/consortium.html` and `/compliance-center.html`. Navigation and route content are based on the authenticated `lab-account-entitlement` response; no self-asserted plan or query-string permission is trusted.
- **Consortium customers:** The Consortium workspace supports enrollment requests, participant addition/removal requests, selection scheduling, and certificate requests. The verified organization's existing C/TPA random-pool status, schedule and aggregate active membership counts are also shown (from tenant- and C/TPA-scoped backend reads). The staff-owned random selection and eligibility decisions remain in the original testing operations system.
- **Consortium + Docs customers:** The Compliance Center supports compliance document requests, Clearinghouse setup assistance, document templates and audit readiness packages, with customer-side status tracking and PDF delivery.
- **Customer function:** `lab-plan-services` verifies current paid-plan features via `lab-account-entitlement`, maps request actions to canonical feature codes, scopes all requests to the authenticated user and produces temporary signed URLs for privately issued PDFs.
- **Testing staff:** `/lab-plan-services.html` and deployed `testing-lab-plan-services` function manage requests, update statuses and issue a private PDF to the correct customer. Testing staff must have active staff status, a role assignment, a testing grant and full-customer access; edit actions require admin, manager or editor grants.
- **Database:** `lab_plan_service_requests` has RLS enabled; no direct anonymous or authenticated table access is granted. All writes require verified server-side authorization and the service-role client. Private documents use `testing-private-documents` storage with a customer- and request-scoped storage path.
- **Feature catalog:** Four consortium features and four compliance features now advertise available **staff-assisted service workflows**, not fully automatic processing. The main website and store read the same catalog. Five remaining advanced features (client directory, CCF archive, automatic result delivery, supply reorder alerts, analytics) are still marked planned.
- **No fabricated test pass:** Successful authenticated higher-tier customer submissions, staff processing, PDF download and real random-pool linkage must be exercised with appropriate authorized test accounts. There were no existing commercial Consortium/+ Docs intake records at the time of development; none were modified or fabricated. No random selection or Clearinghouse changes were executed automatically by these customer request forms.

## Five additional Lab Account features (November 11, 2026)

The Lab Account customer navigation now includes:
- `client-directory.html`: private editable client/employer directory, scoped to the paid customer's account.
- `ccf-archive.html`: lists only customer-visible CCF documents attached to released customer-owned testing cases. Staff issue CCF PDFs from `testing-portal.screenings4u.com/lab-advanced-services.html` into private storage. No existing CCF records were fabricated.
- `result-delivery.html`: customers request sharing a released result with an authorized recipient and see review/delivery status. Testing staff check authorization and can deliver released customer-visible MRO documents into an *existing verified and active* recipient's Testing Customer Portal. The report is not attached to email. Recipients must have customer portal access; otherwise staff must set it up first.
- `supply-alerts.html`: customers set estimated inventory and low-stock thresholds, view shipment information, and receive a branded Resend reminder when configured and low stock is reported, rate-limited to one reminder per supply per 24 hours. Testing Portal staff see low-stock signals and fulfill via the existing supply workflow. This is *not* a laboratory inventory feed or autonomous supply purchasing.
- `analytics.html`: aggregate only the signed-in customer's testing cases, statuses, DOT/NON-DOT counts, release turnaround, monthly trends and CSV export. The most recent 1,000 cases are counted; the UI discloses the limit.

**Supabase:** `lab_portal_clients`, `lab_portal_supply_alerts`, `lab_portal_result_deliveries` have row-level security and direct anon/authenticated privileges revoked. Customer API: `lab-advanced-features`. Testing staff API: `testing-lab-advanced`. No shared or placeholder customer records were created. Feature access is checked server-side against the verified paid plan and `lab_portal_plan_features`; the preview workflow test does not confer access.

**Result distribution:** Staff must have current Testing Portal authorization, reviewed recipient authorization notes, a released case owned by the requesting customer, a released customer-visible MRO PDF, and a verified recipient with active `testing_customer_portal_access`. Delivery uses `testing_private_documents` and `testing_document_deliveries`, with `source_type=private_document`, `portal_status=sent`. The existing `testing-customer-portal` function was updated to allow authorized shared PDFs to remain visible/downloadable after the first view. Any notification email contains only a link to the authenticated customer portal. Recipient authorization notes are never copied into recipient-visible metadata.

**Marketing catalog:** The five previously planned feature codes now have status `available` with precise descriptions. They are *staff-reviewed* delivery requests and *user-entered* stock alerts, not unconditional automatic PHI emailing or realtime laboratory inventory. Plan inclusion counts: basic 9, Consortium 14, Consortium + Docs 18.

**Validation remaining:** Run authenticated end-to-end purchase, entitlements, customer create/edit, staff CCF upload, staff-approved recipient portal delivery, document re-download, and Resend receipt/alert tests with authorized test users and safe non-medical test documents. The API and JavaScript were deployed/syntax-checked, but no real customer data or results were sent for testing.
