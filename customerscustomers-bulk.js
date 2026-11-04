[1mdiff --git a/public/assets/js/customer.js b/public/assets/js/customer.js[m
[1mindex ce2892b..3c1b582 100644[m
[1m--- a/public/assets/js/customer.js[m
[1m+++ b/public/assets/js/customer.js[m
[36m@@ -1134,6 +1134,9 @@[m
                     summary.totalCustomers ??[m
                     0[m
                 ).toLocaleString();[m
[32m+[m
[32m+[m[32m            totalCustomers.dataset.total = totalCustomers.textContent;[m
[32m+[m[32m            updateSelectedCount();[m
         }[m
 [m
 [m
[36m@@ -1567,6 +1570,25 @@[m
             );[m
 [m
 [m
[32m+[m[32m        const totalPill =[m
[32m+[m[32m            document.getElementById([m
[32m+[m[32m                "totalCustomers"[m
[32m+[m[32m            );[m
[32m+[m
[32m+[m[32m        if (totalPill) {[m
[32m+[m
[32m+[m[32m            const total =[m
[32m+[m[32m                totalPill.dataset.total ||[m
[32m+[m[32m                String(totalPill.textContent).split("/")[0].trim();[m
[32m+[m
[32m+[m[32m            totalPill.dataset.total = total;[m
[32m+[m
[32m+[m[32m            totalPill.textContent =[m
[32m+[m[32m                count > 0[m
[32m+[m[32m                    ? total + " / " + count[m
[32m+[m[32m                    : total;[m
[32m+[m[32m        }[m
[32m+[m
         const toggle =[m
             document.getElementById([m
                 "bulkFloatingToggle"[m
[36m@@ -3511,7 +3533,7 @@[m [masync function initCustomerFilterOptions() {[m
 [m
                     await loadActionHtml([m
                         urlObject.toString(),[m
[31m-                        "Bulk Delete Customers"[m
[32m+[m[32m                        selectedIds.length + " Customer Delete"[m
                     );[m
 [m
                 } catch (error) {[m
[1mdiff --git a/views/customers/customers.html b/views/customers/customers.html[m
[1mindex b38e8fc..3647079 100644[m
[1m--- a/views/customers/customers.html[m
[1m+++ b/views/customers/customers.html[m
[36m@@ -71,17 +71,149 @@[m
 <link rel="stylesheet" href="/assets/css/customer-bill-history.css">[m
 <link rel="stylesheet" href="/assets/css/customer-list.css?v=20261030">[m
 <style>[m
[31m-/* Popup scroll: only the popup content scrolls, never the page behind it */[m
[32m+[m[32m/* Popup scroll: only the popup content scrolls, never the page behind it.[m
[32m+[m[32m   (#id.modal selectors are stronger than customer.css / customer-add.css /[m
[32m+[m[32m   customer-edit.css, so load order does not matter.) */[m
[32m+[m[32mhtml:has(#customerActionModal.show),[m
 body.modal-open { overflow: hidden !important; padding-right: 0 !important; }[m
[31m-#customerActionModal { overflow-y: hidden !important; }[m
[31m-#customerActionModal .modal-dialog { max-height: calc(100vh - 1.5rem); margin: .75rem auto; }[m
[31m-#customerActionModal .modal-content { max-height: calc(100vh - 1.5rem); display: flex !important; flex-direction: column; overflow: hidden !important; }[m
[31m-#customerActionModal .modal-body { flex: 1 1 auto; min-height: 0; overflow-y: auto !important; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }[m
[31m-#customerActionModalBody .cm-wrap,[m
[31m-#customerActionModalBody .cm-page,[m
[31m-#customerActionModalBody form { display: flex; flex-direction: column; min-height: 0; }[m
[31m-#customerActionModalBody .cm-body { overflow-y: auto; min-height: 0; max-height: calc(100vh - 12rem); }[m
[31m-#bulkFloatingPanel { max-height: calc(100vh - 90px); overflow-y: auto !important; overscroll-behavior: contain; }[m
[32m+[m
[32m+[m[32m#customerActionModal.modal { overflow-y: auto !important; overscroll-behavior: contain; }[m
[32m+[m
[32m+[m[32m#customerActionModal.modal .modal-dialog {[m
[32m+[m[32m    height: auto !important;[m
[32m+[m[32m    max-height: calc(100dvh - 1.5rem) !important;[m
[32m+[m[32m    margin: .75rem auto !important;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m#customerActionModal.modal .modal-content {[m
[32m+[m[32m    display: flex !important;[m
[32m+[m[32m    flex-direction: column;[m
[32m+[m[32m    height: auto !important;[m
[32m+[m[32m    max-height: calc(100dvh - 1.5rem) !important;[m
[32m+[m[32m    overflow: hidden !important;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m#customerActionModal.modal .modal-body {[m
[32m+[m[32m    flex: 1 1 auto;[m
[32m+[m[32m    min-height: 0;[m
[32m+[m[32m    max-height: none !important;[m
[32m+[m[32m    overflow-y: auto !important;[m
[32m+[m[32m    overscroll-behavior: contain;[m
[32m+[m[32m    -webkit-overflow-scrolling: touch;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m#customerActionModal.modal #customerActionModalBody .cm-body {[m
[32m+[m[32m    height: auto !important;[m
[32m+[m[32m    max-height: calc(100dvh - 10.5rem) !important;[m
[32m+[m[32m    overflow-y: auto !important;[m
[32m+[m[32m    overscroll-behavior: contain;[m
[32m+[m[32m}[m
[32m+[m[32m</style>[m
[32m+[m
[32m+[m[32m<style>[m
[32m+[m[32m/* Bulk panel: same look as the reference (coloured icon squares, scrollable) */[m
[32m+[m[32m#bulkFloatingPanel { max-height: calc(100vh - 90px); overflow-y: auto; }[m
[32m+[m[32m#bulkFloatingPanel .bulk-tile i {[m
[32m+[m[32m    display: inline-flex !important; align-items: center; justify-content: center;[m
[32m+[m[32m    width: 22px; height: 22px; margin-bottom: 4px; border-radius: 4px; font-size: 12px;[m
[32m+[m[32m    background: #fff !important; color: #2d86e5 !important;[m
[32m+[m[32m}[m
[32m+[m[32m#bulkFloatingPanel .bulk-tile:nth-child(4n+2) i { background: #17c1e8 !important; color: #fff !important; }[m
[32m+[m[32m#bulkFloatingPanel .bulk-tile:nth-child(4n+3) i,[m
[32m+[m[32m#bulkFloatingPanel .bulk-tile:nth-child(13) i { background: #fcc419 !important; color: #222 !important; }[m
[32m+[m[32m#bulkFloatingPanel .bulk-tile:nth-child(4n+4) i { background: #e5383b !important; color: #fff !important; }[m
[32m+[m[32m</style>[m
[32m+[m
[32m+[m[32m<style>[m
[32m+[m[32m/* Bulk gear tab + slide-out panel (reference design). Selected count shows in the Total Data pill. */[m
[32m+[m[32m#bulkFloatingToggle,[m
[32m+[m[32m.bulk-floating-toggle {[m
[32m+[m[32m    position: fixed !important; right: 0 !important; top: 50% !important;[m
[32m+[m[32m    transform: translateY(-50%) !important;[m
[32m+[m[32m    width: 34px !important; height: 46px !important; min-width: 34px !important;[m
[32m+[m[32m    border-radius: 23px 0 0 23px !important; background: #2d86e5 !important; color: #fff !important;[m
[32m+[m[32m    box-shadow: -2px 2px 6px rgba(0,0,0,.25) !important; font-size: 18px !important;[m
[32m+[m[32m    transition: right .25s ease; z-index: 99999 !important;[m
[32m+[m[32m}[m
[32m+[m[32m#bulkFloatingToggle .selected-count,[m
[32m+[m[32m#bulkFloatingToggle #selectedCount { display: none !important; }[m
[32m+[m[32mbody:has(#bulkFloatingPanel.show) #bulkFloatingToggle { right: 90px !important; }[m
[32m+[m
[32m+[m[32m#bulkFloatingPanel,[m
[32m+[m[32m.bulk-floating-panel {[m
[32m+[m[32m    position: fixed !important; right: 0 !important; top: 50% !important; width: 90px !important;[m
[32m+[m[32m    transform: translate(100%, -50%) !important;[m
[32m+[m[32m    opacity: 1 !important; visibility: hidden !important; pointer-events: none;[m
[32m+[m[32m    transition: transform .25s ease, visibility .25s;[m
[32m+[m[32m    background: #2d86e5 !important; border-radius: 8px 0 0 8px !important; padding: 2px 0 !important;[m
[32m+[m[32m    z-index: 99998 !important;[m
[32m+[m[32m}[m
[32m+[m[32m#bulkFloatingPanel.show,[m
[32m+[m[32m.bulk-floating-panel.show { transform: translate(0, -50%) !important; visibility: visible !important; pointer-events: auto; }[m
[32m+[m[32m#bulkFloatingPanel .bulk-tile {[m
[32m+[m[32m    display: flex !important; flex-direction: column; align-items: center; text-align: center;[m
[32m+[m[32m    color: #fff !important; font-weight: 700; font-size: 10px !important; line-height: 1.15;[m
[32m+[m[32m    padding: 8px 4px 7px !important; border: 0 !important;[m
[32m+[m[32m    border-bottom: 1px solid rgba(255,255,255,.35) !important;[m
[32m+[m[32m}[m
[32m+[m[32m#bulkFloatingPanel .bulk-tile:last-child { border-bottom: 0 !important; }[m
[32m+[m[32m#bulkFloatingPanel .bulk-tile span { color: #fff !important; }[m
[32m+[m[32m</style>[m
[32m+[m
[32m+[m[32m<style>[m
[32m+[m[32m/* Bulk panel: exact reference look (measured from the screenshot) */[m
[32m+[m[32m#bulkFloatingPanel,[m
[32m+[m[32m.bulk-floating-panel {[m
[32m+[m[32m    width: 77px !important; background: #2d86de !important;[m
[32m+[m[32m    border-radius: 12px 0 0 12px !important; padding: 0 !important;[m
[32m+[m[32m}[m
[32m+[m[32m#bulkFloatingToggle,[m
[32m+[m[32m.bulk-floating-toggle {[m
[32m+[m[32m    width: 26px !important; min-width: 26px !important; height: 52px !important;[m
[32m+[m[32m    border-radius: 0 !important; background: #2d86de !important; box-shadow: none !important;[m
[32m+[m[32m    clip-path: polygon(0 50%, 14% 36%, 100% 0, 100% 100%, 14% 64%) !important;[m
[32m+[m[32m    padding: 0 0 0 5px !important; font-size: 16px !important;[m
[32m+[m[32m}[m
[32m+[m[32mbody:has(#bulkFloatingPanel.show) #bulkFloatingToggle { right: 77px !important; }[m
[32m+[m
[32m+[m[32m#bulkFloatingPanel .bulk-tile {[m
[32m+[m[32m    padding: 7px 3px 6px !important; gap: 3px;[m
[32m+[m[32m    font-size: 11px !important; font-weight: 700 !important;[m
[32m+[m[32m    border-bottom: 1px solid #62a4e6 !important;[m
[32m+[m[32m}[m
[32m+[m[32m#bulkFloatingPanel .bulk-tile i {[m
[32m+[m[32m    width: 21px !important; height: 17px !important; margin: 0 0 3px !important;[m
[32m+[m[32m    border-radius: 3px !important; font-size: 10px !important;[m
[32m+[m[32m    background: #ffffff !important; color: #000000 !important;[m
[32m+[m[32m}[m
[32m+[m[32m#bulkFloatingPanel .bulk-tile:nth-child(4n+2) i { background: #0dcaf0 !important; color: #000 !important; }[m
[32m+[m[32m#bulkFloatingPanel .bulk-tile:nth-child(4n+3) i { background: #ffc107 !important; color: #000 !important; }[m
[32m+[m[32m#bulkFloatingPanel .bulk-tile:nth-child(4n+4) i { background: #dc3545 !important; color: #000 !important; }[m
[32m+[m[32m#bulkFloatingPanel .bulk-tile:nth-child(13) i { background: #ffc107 !important; color: #000 !important; }[m
[32m+[m[32m#bulkFloatingPanel .bulk-delete-btn i { color: #000 !important; }[m
[32m+[m[32m</style>[m
[32m+[m
[32m+[m[32m<style>[m
[32m+[m[32m/* Bulk panel: scrolls on its own when the screen is short (page stays still) */[m
[32m+[m[32m#bulkFloatingPanel,[m
[32m+[m[32m.bulk-floating-panel {[m
[32m+[m[32m    display: flex !important; flex-direction: column !important;[m
[32m+[m[32m    max-height: calc(100dvh - 24px) !important;[m
[32m+[m[32m    overflow-y: auto !important; overflow-x: hidden !important;[m
[32m+[m[32m    overscroll-behavior: contain; scrollbar-width: none; -ms-overflow-style: none;[m
[32m+[m[32m}[m
[32m+[m[32m#bulkFloatingPanel::-webkit-scrollbar { display: none; }[m
[32m+[m[32m#bulkFloatingPanel .bulk-tile { flex: 0 0 auto !important; min-height: 0 !important; width: 100% !important; }[m
[32m+[m
[32m+[m[32m/* Edit Status / Customer Delete / Bulk Recharge: same tile as the others */[m
[32m+[m[32m#bulkFloatingPanel .bulk-delete-btn,[m
[32m+[m[32m#bulkFloatingPanel .bulk-recharge-btn {[m
[32m+[m[32m    background: transparent !important; color: #fff !important;[m
[32m+[m[32m    border: 0 !important; border-bottom: 1px solid #62a4e6 !important; border-radius: 0 !important;[m
[32m+[m[32m}[m
[32m+[m[32m#bulkFloatingPanel .bulk-delete-btn:last-child,[m
[32m+[m[32m#bulkFloatingPanel .bulk-recharge-btn:last-child { border-bottom: 0 !important; }[m
[32m+[m[32m#bulkFloatingPanel .bulk-tile:hover { background: rgba(255,255,255,.14) !important; transform: none !important; filter: none !important; }[m
 </style>[m
 [m
 [m
[36m@@ -436,258 +568,71 @@[m [mbody.modal-open { overflow: hidden !important; padding-right: 0 !important; }[m
      BULK FLOATING PANEL[m
 ========================================================= -->[m
 [m
[31m-<div[m
[31m-    id="bulkFloatingPanel"[m
[31m-    class="bulk-floating-panel"[m
[31m->[m
[31m-[m
[31m-[m
[31m-    <!-- MESSAGE -->[m
[31m-[m
[31m-    <button[m
[31m-        type="button"[m
[31m-        class="bulk-action-popup bulk-tile"[m
[31m-        data-url="/api/customers/bulk/message"[m
[31m-        data-title="Bulk Message"[m
[31m-    >[m
[31m-[m
[31m-        <i class="fa fa-comment"></i>[m
[31m-[m
[31m-        <span>[m
[31m-            Bulk Message[m
[31m-        </span>[m
[32m+[m[32m<div id="bulkFloatingPanel" class="bulk-floating-panel">[m
 [m
[32m+[m[32m    <button type="button" class="bulk-action-popup bulk-tile" data-url="/api/customers/bulk/message" data-title="Bulk Message">[m
[32m+[m[32m        <i class="fa fa-envelope"></i>[m
[32m+[m[32m        <span>Bulk Message</span>[m
     </button>[m
 [m
[31m-[m
[31m-    <!-- PROMISE DATE -->[m
[31m-[m
[31m-    <button[m
[31m-        type="button"[m
[31m-        class="bulk-action-popup bulk-tile"[m
[31m-        data-url="/api/customers/bulk/promise_date"[m
[31m-        data-title="Promise Date"[m
[31m-    >[m
[31m-[m
[31m-        <i class="fa fa-calendar"></i>[m
[31m-[m
[31m-        <span>[m
[31m-            Edit Promise Date[m
[31m-        </span>[m
[31m-[m
[32m+[m[32m    <button type="button" class="bulk-action-popup bulk-tile" data-url="/api/customers/bulk/promise_date" data-title="Edit Promise Date">[m
[32m+[m[32m        <i class="fa fa-calendar-day"></i>[m
[32m+[m[32m        <span>Edit Promise Date</span>[m
     </button>[m
 [m
[31m-[m
[31m-    <!-- BILLING CYCLE -->[m
[31m-[m
[31m-    <button[m
[31m-        type="button"[m
[31m-        class="bulk-action-popup bulk-tile"[m
[31m-        data-url="/api/customers/bulk/billing_cycle"[m
[31m-        data-title="Billing Cycle"[m
[31m-    >[m
[31m-[m
[32m+[m[32m    <button type="button" class="bulk-action-popup bulk-tile" data-url="/api/customers/bulk/billing_cycle" data-title="Update Billing Cycle">[m
         <i class="fa fa-calendar-days"></i>[m
[31m-[m
[31m-        <span>[m
[31m-            Edit Billing Cycle[m
[31m-        </span>[m
[31m-[m
[31m-    </button>[m
[31m-[m
[31m-[m
[31m-    <!-- PAYMENT STATUS -->[m
[31m-[m
[31m-    <button[m
[31m-        type="button"[m
[31m-        class="bulk-action-popup bulk-tile"[m
[31m-        data-url="/api/customers/bulk/payment_status"[m
[31m-        data-title="Payment Status"[m
[31m-    >[m
[31m-[m
[31m-        <i class="fa fa-money-check"></i>[m
[31m-[m
[31m-        <span>[m
[31m-            Edit Payment Status[m
[31m-        </span>[m
[31m-[m
[32m+[m[32m        <span>Edit Billing Cycle</span>[m
     </button>[m
 [m
[31m-[m
[31m-    <!-- AREA -->[m
[31m-[m
[31m-    <button[m
[31m-        type="button"[m
[31m-        class="bulk-action-popup bulk-tile"[m
[31m-        data-url="/api/customers/bulk/area"[m
[31m-        data-title="Area"[m
[31m-    >[m
[31m-[m
[31m-        <i class="fa fa-location-dot"></i>[m
[31m-[m
[31m-        <span>[m
[31m-            Edit Area[m
[31m-        </span>[m
[31m-[m
[32m+[m[32m    <button type="button" class="bulk-action-popup bulk-tile" data-url="/api/customers/bulk/payment_status" data-title="Edit Payment Status">[m
[32m+[m[32m        <i class="fa fa-cash-register"></i>[m
[32m+[m[32m        <span>Edit Payment Status</span>[m
     </button>[m
 [m
[31m-[m
[31m-    <!-- STATUS -->[m
[31m-[m
[31m-    <button[m
[31m-        type="button"[m
[31m-        class="bulk-action-popup bulk-tile"[m
[31m-        data-url="/api/customers/bulk/status"[m
[31m-        data-title="Status"[m
[31m-    >[m
[31m-[m
[31m-        <i class="fa fa-toggle-on"></i>[m
[31m-[m
[31m-        <span>[m
[31m-            Edit Status[m
[31m-        </span>[m
[31m-[m
[32m+[m[32m    <button type="button" class="bulk-action-popup bulk-tile" data-url="/api/customers/bulk/area" data-title="Update Area">[m
[32m+[m[32m        <i class="fa fa-map-location-dot"></i>[m
[32m+[m[32m        <span>Edit Area</span>[m
     </button>[m
 [m
[31m-[m
[31m-    <!-- BALANCE -->[m
[31m-[m
[31m-    <button[m
[31m-        type="button"[m
[31m-        class="bulk-action-popup bulk-tile"[m
[31m-        data-url="/api/customers/bulk/balance"[m
[31m-        data-title="Balance"[m
[31m-    >[m
[31m-[m
[31m-        <i class="fa fa-wallet"></i>[m
[31m-[m
[31m-        <span>[m
[31m-            Edit Balance[m
[31m-        </span>[m
[31m-[m
[32m+[m[32m    <button type="button" class="bulk-action-popup bulk-tile" data-url="/api/customers/bulk/status" data-title="Update Status">[m
[32m+[m[32m        <i class="fa fa-pen-to-square"></i>[m
[32m+[m[32m        <span>Edit Status</span>[m
     </button>[m
 [m
[31m-[m
[31m-    <!-- RECHARGE -->[m
[31m-[m
[31m-    <button[m
[31m-        type="button"[m
[31m-        id="bulkRechargeBtn"[m
[31m-        class="bulk-recharge-btn bulk-tile"[m
[31m-    >[m
[31m-[m
[31m-        <i class="fa fa-credit-card"></i>[m
[31m-[m
[31m-        <span>[m
[31m-            Bulk Recharge[m
[31m-        </span>[m
[31m-[m
[32m+[m[32m    <button type="button" class="bulk-action-popup bulk-tile" data-url="/api/customers/bulk/balance" data-title="Update Balance">[m
[32m+[m[32m        <i class="fa fa-dollar-sign"></i>[m
[32m+[m[32m        <span>Edit Balance</span>[m
     </button>[m
 [m
[31m-[m
[31m-    <!-- RESELLER -->[m
[31m-[m
[31m-    <button[m
[31m-        type="button"[m
[31m-        class="bulk-action-popup bulk-tile"[m
[31m-        data-url="/api/customers/bulk/reseller"[m
[31m-        data-title="Reseller"[m
[31m-    >[m
[31m-[m
[31m-        <i class="fa fa-user-tie"></i>[m
[31m-[m
[31m-        <span>[m
[31m-            Transfer to Reseller[m
[31m-        </span>[m
[31m-[m
[32m+[m[32m    <button type="button" id="bulkRechargeBtn" class="bulk-recharge-btn bulk-tile">[m
[32m+[m[32m        <i class="fa fa-dollar-sign"></i>[m
[32m+[m[32m        <span>Bulk Recharge</span>[m
     </button>[m
 [m
[31m-[m
[31m-    <!-- PACKAGE -->[m
[31m-[m
[31m-    <button[m
[31m-        type="button"[m
[31m-        class="bulk-action-popup bulk-tile"[m
[31m-        data-url="/api/customers/bulk/package"[m
[31m-        data-title="Package"[m
[31m-    >[m
[31m-[m
[31m-        <i class="fa fa-box"></i>[m
[31m-[m
[31m-        <span>[m
[31m-            Package[m
[31m-        </span>[m
[31m-[m
[32m+[m[32m    <button type="button" class="bulk-action-popup bulk-tile" data-url="/api/customers/bulk/reseller" data-title="Transfer to Reseller">[m
[32m+[m[32m        <i class="fa fa-right-left"></i>[m
[32m+[m[32m        <span>Transfer to Reseller</span>[m
     </button>[m
 [m
[31m-[m
[31m-    <!-- CONNECTION ON -->[m
[31m-[m
[31m-    <button[m
[31m-        type="button"[m
[31m-        class="bulk-action-popup bulk-tile"[m
[31m-        data-url="/api/customers/bulk/connection_on"[m
[31m-        data-title="Connection ON"[m
[31m-    >[m
[31m-[m
[31m-        <i class="fa fa-power-off"></i>[m
[31m-[m
[31m-        <span>[m
[31m-            Connection ON[m
[31m-        </span>[m
[31m-[m
[32m+[m[32m    <button type="button" class="bulk-action-popup bulk-tile" data-url="/api/customers/bulk/package" data-title="Update Package">[m
[32m+[m[32m        <i class="fa fa-wifi"></i>[m
[32m+[m[32m        <span>Update Package</span>[m
     </button>[m
 [m
[31m-[m
[31m-    <!-- CONNECTION OFF -->[m
[31m-[m
[31m-    <button[m
[31m-        type="button"[m
[31m-        class="bulk-action-popup bulk-tile"[m
[31m-        data-url="/api/customers/bulk/connection_off"[m
[31m-        data-title="Connection OFF"[m
[31m-    >[m
[31m-[m
[32m+[m[32m    <button type="button" class="bulk-action-popup bulk-tile" data-url="/api/customers/bulk/connection_on" data-title="Automatic Connection On/Off">[m
         <i class="fa fa-power-off"></i>[m
[31m-[m
[31m-        <span>[m
[31m-            Connection OFF[m
[31m-        </span>[m
[31m-[m
[31m-    </button>[m
[31m-[m
[31m-[m
[31m-    <!-- MIKROTIK -->[m
[31m-[m
[31m-    <button[m
[31m-        type="button"[m
[31m-        class="bulk-action-popup bulk-tile"[m
[31m-        data-url="/api/customers/bulk/mikrotik"[m
[31m-        data-title="MikroTik"[m
[31m-    >[m
[31m-[m
[31m-        <i class="fa fa-server"></i>[m
[31m-[m
[31m-        <span>[m
[31m-            MikroTik[m
[31m-        </span>[m
[31m-[m
[32m+[m[32m        <span>Automatic Connection On/Off</span>[m
     </button>[m
 [m
[31m-[m
[31m-    <!-- DELETE -->[m
[31m-[m
[31m-    <button[m
[31m-        type="button"[m
[31m-        class="bulk-delete-btn bulk-tile"[m
[31m-    >[m
[31m-[m
[32m+[m[32m    <button type="button" class="bulk-delete-btn bulk-tile">[m
         <i class="fa fa-trash"></i>[m
[32m+[m[32m        <span>Customer Delete</span>[m
[32m+[m[32m    </button>[m
 [m
[31m-        <span>[m
[31m-            Delete[m
[31m-        </span>[m
[31m-[m
[32m+[m[32m    <button type="button" class="bulk-action-popup bulk-tile" data-url="/api/customers/bulk/mikrotik" data-title="Change Mikrotik">[m
[32m+[m[32m        <i class="fa fa-equals"></i>[m
[32m+[m[32m        <span>Change Mikrotik</span>[m
     </button>[m
 [m
 </div>[m
[36m@@ -1174,6 +1119,7 @@[m [mbody.modal-open { overflow: hidden !important; padding-right: 0 !important; }[m
 <script src="/assets/js/customer.js?v=20261030"></script>[m
 <script src="/assets/js/customer-add.js?v=20261025"></script>[m
 <script src="/assets/js/customer-actions.js?v=20261030"></script>[m
[32m+[m[32m<script src="/assets/js/customer-extras.js?v=20261103"></script>[m
 <script src="/assets/js/customer-edit.js?v=20261030"></script>[m
 <script src="/assets/js/bulk-recharge.js?v=20261009"></script>[m
 <script src="/assets/js/customer-bill-history.js"></script>[m
