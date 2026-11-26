Amader Bill Super Admin Support Numbers
=========================================

Included:
- routes/super-admin/support-numbers.routes.js
- views/admin/super-admin-support-numbers.html
- INSTALL-LOCAL.ps1

Install:
1. Extract this ZIP.
2. Open PowerShell.
3. Run:
   cd C:\xampp\htdocs\ispbilling-node
   powershell -ExecutionPolicy Bypass -File "<EXTRACTED_FOLDER>\INSTALL-LOCAL.ps1"
4. Then check:
   node --check app.js
   node --check routes\super-admin\support-numbers.routes.js
5. Restart the local Node app.

Page:
  /super-admin/support-numbers

API:
  /api/super-admin/support-numbers

All records are hard-scoped to support_numbers.company_id = 8.
The API additionally checks that the logged-in active user has role super_admin
and company_id 8. Existing public API remains unchanged and continues reading
company_id 8 for amaderbill.com.

No database migration is included; this uses the existing support_numbers table.
