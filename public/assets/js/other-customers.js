(function () {
    "use strict";
    document.addEventListener("DOMContentLoaded", function () {
        const tabs = document.getElementById("otherCustomerTabs");
        const filter = document.getElementById("otherCustomerType");
        const label = document.getElementById("otherCustomerTabLabel");
        if (!tabs || !filter) return;

        const names = {
            new: "New Customer",
            inactive: "Inactive Customer",
            due: "Due Customers"
        };

        tabs.addEventListener("click", function (event) {
            const button = event.target.closest("[data-other-tab]");
            if (!button) return;

            const type = button.dataset.otherTab;
            if (!Object.prototype.hasOwnProperty.call(names, type)) return;

            filter.value = type;
            tabs.querySelectorAll("[data-other-tab]").forEach(function(tab) {
                tab.classList.toggle("active", tab === button);
            });
            if (label) label.textContent = names[type];

            if (window.CustomerList && typeof window.CustomerList.load === "function") {
                window.CustomerList.load();
            }
        });
    });
})();
document.addEventListener("DOMContentLoaded",function(){const b=document.getElementById("exportCustomersBtn");if(!b)return;b.addEventListener("click",async function(){const old=b.innerHTML;b.disabled=true;b.innerHTML="Exporting...";try{const p=new URLSearchParams({page:"1",limit:"all"});const s=document.getElementById("customerSearch");if(s&&s.value.trim())p.set("search",s.value.trim());document.querySelectorAll("[data-cf]").forEach(e=>{const k=e.dataset.cf,v=(e.value||"").trim();if(k&&v)p.set(k,v)});const r=await fetch("/api/customers?"+p.toString(),{credentials:"same-origin",headers:{"X-Requested-With":"XMLHttpRequest"}});const j=await r.json();if(!r.ok||!j.success)throw Error(j.message||"CSV export failed");const rows=j.data||j.customers||[];if(!rows.length){alert("No customer data to export");return}const cols=[["Customer ID","customer_id"],["Name","name"],["PPPoE","pppoe_username"],["Mobile","phone"],["Address","address"],["Package","display_package"],["Bill","display_bill"],["Balance","balance"],["Promise Date","promise_date"],["Day Left","day_left"],["Status","status"]];const q=String.fromCharCode(34),cell=v=>q+String(v==null?"":v).replace(/"/g,q+q)+q;const csv=[cols.map(c=>cell(c[0])).join(","),...rows.map(row=>cols.map(c=>cell(row[c[1]])).join(","))].join("\r\n");const url=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="other-customers-"+(document.getElementById("otherCustomerType")?.value||"all")+".csv";a.click();URL.revokeObjectURL(url)}catch(e){console.error(e);alert(e.message||"CSV export failed")}finally{b.disabled=false;b.innerHTML=old}})});
