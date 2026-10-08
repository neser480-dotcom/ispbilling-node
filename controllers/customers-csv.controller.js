"use strict";

const service = require("../services/customer-csv.service");

function stamp() {
    const d = new Date();
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function download(res, filename) {
    res.setHeader("Content-Type", "text/csv; charset=UTF-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
}

function template(req, res) {
    download(res, "customer_import_template.csv");
    return res.send(service.templateCsv());
}

async function exportAll(req, res) {
    try {
        download(res, `customers_${stamp()}.csv`);

        await service.exportCsv({
            user: req.session,
            search: req.query.search,
            status: req.query.status
        }, chunk => res.write(chunk));

        return res.end();

    } catch (error) {

        if (!(error instanceof service.CsvError)) console.error("CSV EXPORT ERROR:", error);

        if (res.headersSent) return res.end();

        return res.status(error instanceof service.CsvError ? error.httpCode : 500)
            .type("text")
            .send(error instanceof service.CsvError ? error.message : "Export failed.");
    }
}

async function importFile(req, res) {
    try {
        const report = await service.importCsv({
            user: req.session,
            file: req.files && req.files.csv_file
        });

        return res.json({
            success: report.errors === 0 || report.inserted > 0,
            message: report.summary,
            report
        });

    } catch (error) {

        if (!(error instanceof service.CsvError)) console.error("CSV IMPORT ERROR:", error);

        return res.status(error instanceof service.CsvError ? error.httpCode : 500).json({
            success: false,
            message: error instanceof service.CsvError ? error.message : "CSV import failed."
        });
    }
}

module.exports = { template, exportAll, importFile };
