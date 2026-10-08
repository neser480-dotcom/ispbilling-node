# API contract

GET /api/customers?page=1&limit=100&search=&status=
GET /api/customers/summary
GET /api/customers/:id
POST /api/customers
PUT /api/customers/:id
DELETE /api/customers/:id
POST /api/customers/:id/recharge
POST /api/customers/:id/status
POST /api/customers/:id/package
POST /api/customers/:id/balance
POST /api/customers/:id/promise-date
POST /api/customers/:id/billing-cycle
POST /api/customers/:id/payment-status
POST /api/customers/:id/connection-on
POST /api/customers/:id/connection-off
POST /api/customers/:id/mikrotik

Bulk POST endpoints accept customer_ids[] and the action-specific fields.
