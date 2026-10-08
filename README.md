# Screenings4u Testing Management — Foundation

Target host: testing-portal.screenings4u.com
Managed surfaces:
- screenings4u.com
- customers.screenings4u.com

Security:
- No direct local management login.
- Entry is issued only by enterprise.screenings4u.com Portal Selector.
- management-portal-handoff validates the Testing portal session on protected pages.

Backend boundary:
- testing-management-context
- testing-management-read

Existing Testing workflow services remain authoritative until migrated module-by-module.

This foundation intentionally contains only dashboard.html. No placeholder management pages or dead navigation links are included.
