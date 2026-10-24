# Customer Module Rebuild

This package is a clean Node/Express customer-module backend + frontend API layer designed for the existing customer HTML/popup UI.

## Install
1. Copy `routes/customers.js` to `routes/customers.js`.
2. Copy `controllers/customers.controller.js` to `controllers/customers.controller.js`.
3. Copy `services/customer.service.js` and `services/mikrotik.service.js` to `services/`.
4. Copy `public/assets/js/customer.js` to the customer JS location.
5. Ensure `app.js` has:
   `app.use("/api/customers", requireSoftwareBilling, customerRoutes);`
6. Ensure `node-routeros` is installed if real MikroTik operations are enabled.

## Important
- Existing popup HTML is intentionally not redesigned.
- Bulk IDs are normalized from `customer_ids[]`, `ids`, or comma-separated IDs.
- Every customer query is company scoped except super_admin.
- Payment history blocks customer deletion.
- `mikrotik_packages.profile_id` is used by schema design.
- CSV import is intentionally left as a 501 until the project's actual multipart upload middleware is connected; this prevents silently accepting malformed uploads.

## Validation
Run `node --check` on all JS files after copying. Then test list, summary, single update, bulk delete, recharge, package, connection, and MikroTik endpoints in that order.
