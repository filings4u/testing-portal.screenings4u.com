# Refund Management — Integration Contract

Portal: `refunds.html`, `assets/js/refunds.js`, `assets/css/refunds.css`

This page is a **review-only calculator**. Its Process refund control is intentionally disabled. It does **not** write refunds to the database, mutate order state, or call a payment gateway. Order search and detail retrieval use the existing authenticated `testing-order-management` actions `list` and `get`.

## Required server-side refund implementation

Deploy a protected refund-management API/Edge Function only after confirming the production payment provider, associated capture/charge IDs, and the existing database schema. The browser must **never** receive payment secret keys. Implement at minimum:

- `list`: paginated refund request and gateway refund history with status, amount, staff actor, timestamps.
- `quote`: retrieve authoritative paid/captured balance from the gateway and refund ledger; validate selected items, taxes, discounts, prior refunds, pending refunds, payment disputes, currency, and amounts in integer cents; compute a policy-compliant gross/fee/net quote **on the server**.
- `create_request`: persist a draft requiring reason, associated order, item allocations, administrative/re-service fee basis, customer communication, staff identity, and approval policy. Enforce role-based access server-side.
- `approve`: require separate authorized approver where policy requires it; reject self-approval where needed.
- `execute`: require an approved quote and unique idempotency key; perform the gateway refund server-side and atomically record the transaction attempt. Prevent retries from issuing duplicate refunds, check remaining balance with a database lock, and handle partial gateway failures.
- `reconcile`: verify finalized gateway refunds via authenticated webhooks and update refund/order statuses, ledger entries, and notifications. Never treat a client-side button click as proof of successful money movement.

Additional safeguards: refunds to original payment method only unless a separate authorized process is implemented; approval limits, anti-fraud monitoring, no overdrafts, immutable event history, dispute/chargeback blocking, fee-policy version and explanatory reason, role-based visibility, and customer receipt containing net returned amount and fee breakdown.

The present frontend must only be switched from draft to live processing after these endpoints exist and have been tested with gateway sandbox cases: full, partial, multiple partial, fees greater than refund, no capture, duplicate idempotency keys, chargeback, provider failure, and concurrent approvals.
