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
