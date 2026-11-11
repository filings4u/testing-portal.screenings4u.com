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
3. Deploy updated `lab-account-supplies` Edge Function from the Workforce repo so administrative supply emails link to the Testing Portal.
4. Customer-submitted supply-request review still links to the existing `app.screenings4u.com/ic-supply-management.html` workflow. This needs its own complete management migration, with staff access checks, before removing the old endpoint.
5. Test full integration with the six consumer portals for entitlement-based reads, role boundaries, new orders, shipment status, customer notices, and results release. These integrations have **not** been verified end to end in this migration.
6. Do not migrate backend secrets into front-end JS or duplicate customer tables. Preserve authoritative identities and server-side access control.
