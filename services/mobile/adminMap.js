"use strict";
/* Web Dashboard JSON -> Admin Flutter App-এর DashboardSummary (শুধু আকার বদল, নতুন হিসাব নয়) */

const MEDIUMS = [
    { id: "all", name: "সব" },
    { id: "cash", name: "Hand Cash" },
    { id: "bkash", name: "Bkash" },
    { id: "nagad", name: "Nagad" },
    { id: "bank", name: "Bank" }
];
const MEDIUM_DB_NAME = { cash: "Hand Cash", bkash: "Bkash", nagad: "Nagad", bank: "Bank" };

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function emptySummary() {
 return {type:'company',role:'',permissions:{},has_customers:false,has_collection:false,has_finance:false,has_admin:false,has_collector:false,has_mikrotik:false,potential:0,collection:0,percent:0,bill_and_fee:0,today_collection:0,total_customers:0,active_customers:0,paid_customers:0,unpaid_customers:0,expired_customers:0,inactive_customers:0,free_customers:0,new_customers:0,active_new:0,paid_new:0,unpaid_new:0,expired_new:0,inactive_new:0,active_amount:0,paid_amount:0,unpaid_amount:0,expired_amount:0,inactive_amount:0,active_new_amount:0,paid_new_amount:0,unpaid_new_amount:0,expired_new_amount:0,inactive_new_amount:0,paid_count:0,new_paid_count:0,new_paid_amount:0,connected_customers:0,connected_new:0,connected_amount:0,connected_new_amount:0,connection_fee:0,today_connection_fee:0,discount:0,today_discount:0,expenditure:0,today_expenditure:0,salary:0,balance:0,admin:null,collector:null,mikrotik:null,super_admin:null};
}
function mapDashboard(w) {
 const s=emptySummary(),c=w.customers,col=w.collection,f=w.finance;
 s.type=w.type||'company'; s.role=w.role||''; s.permissions=w.permissions||{};
 s.has_customers=!!c; s.has_collection=!!col; s.has_finance=!!f;
 s.has_admin=!!w.admin; s.has_collector=!!w.collector; s.has_mikrotik=!!w.mikrotik;
 if(c){const a=c.counts||{},b=c.new_counts||{},x=c.amounts||{},y=c.new_amounts||{};
 for(const k of ['total','active','paid','unpaid','expired','inactive']){s[k==='total'?'total_customers':k+'_customers']=n(a[k]);if(k!=='total'){s[k+'_new']=n(b[k]);s[k+'_amount']=n(x[k]);s[k+'_new_amount']=n(y[k]);}}
 s.free_customers=n(a.free);s.new_customers=n(b.total);
 s.connected_customers=s.active_customers;s.connected_new=s.active_new;s.connected_amount=s.active_amount;s.connected_new_amount=s.active_new_amount;}
 if(col){for(const [a,b] of Object.entries({potential:'expected',collection:'collection',percent:'percent',bill_and_fee:'bill_and_fee',today_collection:'today',paid_count:'paid_count',new_paid_count:'new_paid_count',new_paid_amount:'new_paid_amount'}))s[a]=n(col[b]);}
 if(f){for(const k of ['connection_fee','today_connection_fee','discount','today_discount','expenditure','today_expenditure','salary','balance'])s[k]=n(f[k]);}
 s.admin=w.admin||null;s.collector=w.collector||null;s.mikrotik=w.mikrotik||null;return s;
}
function daysIn(year, month) { return new Date(year, month, 0).getDate(); }
module.exports = { MEDIUMS, MEDIUM_DB_NAME, mapDashboard, emptySummary, daysIn, n };