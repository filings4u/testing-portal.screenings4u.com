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
