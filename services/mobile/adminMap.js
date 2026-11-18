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
    return { potential: 0, collection: 0, percent: 0, total_customers: 0, new_customers: 0,
        connected_customers: 0, connected_new: 0, paid_customers: 0, paid_new: 0,
        connected_amount: 0, connected_new_amount: 0, paid_new_amount: 0 };
}

function mapDashboard(w) {
    const s = emptySummary();
    const c = w.customers, col = w.collection;
    if (c) {
        s.total_customers = n(c.counts?.total);
        s.new_customers = n(c.new_counts?.total);
        s.connected_customers = n(c.counts?.active);      // "connected" = Active
        s.connected_new = n(c.new_counts?.active);
        s.paid_customers = n(c.counts?.paid);
        s.paid_new = n(c.new_counts?.paid);
        s.connected_amount = n(c.amounts?.active);
        s.connected_new_amount = n(c.new_amounts?.active);
        s.paid_new_amount = n(c.new_amounts?.paid);
    }
    if (col) {
        s.potential = n(col.expected);
        s.collection = n(col.collection);
        s.percent = n(col.percent);
    }
    return s;
}

function daysIn(year, month) { return new Date(year, month, 0).getDate(); }

module.exports = { MEDIUMS, MEDIUM_DB_NAME, mapDashboard, emptySummary, daysIn, n };
