# Screenings4u Testing Management Portal — Management Shell Reset

This package restarts `testing-portal.screenings4u.com` on the same management portal shell used by Training, DOT, and NON-DOT management.

## Rules
- Enterprise selector is the only login/entry path.
- Only `dashboard.html` is a dashboard.
- Every other page is a records or management page.
- No customer-portal shell or customer navigation is used.
- Management forms live on dedicated pages, not modals.
- Modals are reserved for confirmations/session security.

## Live backend boundaries
- `testing-management-context`
- `testing-management-read`
- `testing-operations-management`
- `testing-case-management`

## Implemented modules
1. Dashboard
2. Testing Operations
3. Cases


## Results module
- results.html
- result.html
- result-documents.html
- result-upload.html
- result-history.html
Backend: testing-result-management


## Donor Passes module
- donor-passes.html
- donor-pass-create.html
- donor-pass.html
- donor-pass-delivery.html
- donor-pass-history.html
Backend: testing-donor-pass-management


## Service Requests module
- service-requests.html
- service-request-create.html
- service-request.html
- service-request-customer.html
- service-request-assignment.html
- service-request-history.html
Backend: testing-service-request-management


## Work Orders module
- work-orders.html
- work-order-create.html
- work-order.html
- work-order-assignment.html
- work-order-services.html
- work-order-customer.html
- work-order-history.html
Backend: testing-work-order-management


## Customers & Portal Access module
- customers.html
- customer.html
- customer-portal-access.html
- customer-orders.html
- customer-cases.html
- customer-organizations.html
- customer-history.html
Backend: testing-customer-management


## Providers module
- providers.html
- provider-create.html
- provider.html
- provider-services.html
- provider-locations.html
- provider-contacts.html
- provider-history.html
Backend: testing-provider-management
Provider sources: compliance_collection_sites, compliance_laboratories, compliance_mros
Collector Network intentionally remains separate.


## Background Checks module
- background-checks.html
- background-check-create.html
- background-check.html
- background-check-candidate.html
- background-check-package.html
- background-check-events.html

Backend:
- testing-background-check-management
- checkr-webhook

Checkr credentials remain server-side. Expected secrets:
- CHECKR_API_KEY
- CHECKR_ENVIRONMENT (production or staging)
- CHECKR_WEBHOOK_SECRET (optional; falls back to CHECKR_CLIENT_SECRET or CHECKR_API_KEY for signature validation)

Hosted invitation flow is used so sensitive candidate PII and consent are collected by Checkr, not by this management portal.
