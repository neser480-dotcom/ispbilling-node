
"use strict";

/*
 * ISP Billing - Read-only Security Audit
 * Run: node security-audit.js
 *
 * Does not modify application files or database.
 * Static checks may produce false positives and miss bugs.
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = __dirname;
const REPORT = path.join(ROOT, "security-audit-report.json");

const IGNORE_DIRS = new Set([
    "node_modules",
    ".git",
    ".vscode",
    "coverage",
    "dist",
    "build",
    "vendor"
]);

const EXTENSIONS = new Set([
    ".js", ".cjs", ".mjs",
    ".json", ".html", ".sql"
]);

const findings = [];
const summary = {
    filesScanned: 0,
    syntaxErrors: 0,
    findings: 0,
    npmAuditExitCode: null
};

function add(level, file, line, message) {
    findings.push({
        level,
        file: path.relative(ROOT, file),
        line,
        message
    });
}

function walk(dir) {
    let entries;

    try {
        entries = fs.readdirSync(dir, {
            withFileTypes: true
        });
    } catch (error) {
        console.error("Cannot read:", dir, error.message);
        return [];
    }

    const files = [];

    for (const entry of entries) {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            if (!IGNORE_DIRS.has(entry.name)) {
                files.push(...walk(full));
            }
        } else if (
            entry.isFile() &&
            EXTENSIONS.has(path.extname(entry.name).toLowerCase()) &&
            !entry.name.endsWith(".min.js")
        ) {
            files.push(full);
        }
    }

    return files;
}

function scanFile(file) {
    let content;

    try {
        content = fs.readFileSync(file, "utf8");
    } catch {
        return;
    }

    summary.filesScanned++;

    const lines = content.split(/\r?\n/);

    const rules = [
        {
            level: "HIGH",
            regex: /(?:SESSION_SECRET|JWT_SECRET)\s*[:=]\s*["'`](?!process\.env)[^"'`]{8,}["'`]/i,
            message: "সম্ভাব্য hardcoded session/JWT secret"
        },
        {
            level: "HIGH",
            regex: /(?:password|passwd|api[_-]?key|access[_-]?token)\s*[:=]\s*["'`][^"'`]{4,}["'`]/i,
            message: "সম্ভাব্য hardcoded credential বা API key"
        },
        {
            level: "HIGH",
            regex: /\beval\s*\(/,
            message: "eval() পাওয়া গেছে; input ও usage যাচাই করো"
        },
        {
            level: "HIGH",
            regex: /child_process.*\bexec\s*\(/,
            message: "Shell command execution-এর সম্ভাব্য ঝুঁকি"
        },
        {
            level: "MEDIUM",
            regex: /secure\s*:\s*false/i,
            message: "Cookie/transport secure=false; production configuration যাচাই করো"
        },
        {
            level: "MEDIUM",
            regex: /ispbilling_node_test_secret/i,
            message: "পরিচিত development session-secret fallback পাওয়া গেছে"
        },
        {
            level: "MEDIUM",
            regex: /\bSELECT\b[\s\S]{0,160}\+\s*(?:req\.|request\.|params\.|query\.|body\.)/i,
            message: "সম্ভাব্য concatenated SQL query; parameterized query যাচাই করো"
        },
        {
            level: "MEDIUM",
            regex: /\b(?:INSERT|UPDATE|DELETE)\b[\s\S]{0,180}\+\s*(?:req\.|request\.|params\.|query\.|body\.)/i,
            message: "সম্ভাব্য dynamic SQL; parameterized query যাচাই করো"
        },
        {
            level: "MEDIUM",
            regex: /Access-Control-Allow-Origin["']?\s*[:,]\s*["']\*["']/i,
            message: "সম্ভাব্য wildcard CORS policy"
        }
    ];

    lines.forEach((line, index) => {
        for (const rule of rules) {
            if (rule.regex.test(line)) {
                add(
                    rule.level,
                    file,
                    index + 1,
                    rule.message
                );
            }
        }
    });

    // Check JavaScript syntax without executing application code.
    if (/\.[cm]?js$/i.test(file)) {
        const result = spawnSync(
            process.execPath,
            ["--check", file],
            {
                cwd: ROOT,
                encoding: "utf8",
                timeout: 15000,
                windowsHide: true
            }
        );

        if (result.error || result.status !== 0) {
            summary.syntaxErrors++;

            add(
                "HIGH",
                file,
                null,
                "JavaScript syntax check failed: " +
                (
                    result.stderr ||
                    result.error?.message ||
                    "Unknown syntax error"
                ).trim()
            );
        }
    }
}

function runNpmAudit() {
    const packageFile = path.join(ROOT, "package.json");

    if (!fs.existsSync(packageFile)) {
        console.log("package.json পাওয়া যায়নি; npm audit বাদ।");
        return;
    }

    const result = spawnSync(
        "npm",
        ["audit", "--json"],
        {
            cwd: ROOT,
            encoding: "utf8",
            timeout: 120000,
            windowsHide: true,
            maxBuffer: 10 * 1024 * 1024
        }
    );

    summary.npmAuditExitCode =
        Number.isInteger(result.status) ? result.status : null;

    if (result.error) {
        add(
            "INFO",
            packageFile,
            null,
            "npm audit চালানো যায়নি: " + result.error.message
        );
        return;
    }

    try {
        const data = JSON.parse(result.stdout || "{}");
        const metadata = data.metadata?.vulnerabilities || {};

        for (const [severity, count] of Object.entries(metadata)) {
            if (Number(count) > 0) {
                add(
                    severity.toUpperCase(),
                    packageFile,
                    null,
                    `npm audit: ${severity} vulnerabilities = ${count}`
                );
            }
        }

        for (const [name, item] of Object.entries(
            data.vulnerabilities || {}
        )) {
            add(
                String(item.severity || "MEDIUM").toUpperCase(),
                packageFile,
                null,
                `Dependency ${name}: ${item.title || "vulnerability"}; ` +
                `direct=${Boolean(item.isDirect)}`
            );
        }
    } catch {
        add(
            "INFO",
            packageFile,
            null,
            "npm audit-এর JSON ফলাফল পড়া যায়নি; network/npm output যাচাই করো"
        );
    }
}

function main() {
    const files = walk(ROOT);

    for (const file of files) {
        scanFile(file);
    }

    runNpmAudit();

    summary.findings = findings.length;

    const report = {
        generatedAt: new Date().toISOString(),
        project: ROOT,
        mode: "read-only static audit",
        summary,
        findings
    };

    fs.writeFileSync(
        REPORT,
        JSON.stringify(report, null, 2),
        "utf8"
    );

    console.log("\n=== ISP BILLING AUDIT ===");
    console.log("Files scanned:", summary.filesScanned);
    console.log("Syntax errors:", summary.syntaxErrors);
    console.log("Findings:", summary.findings);
    console.log("Report:", REPORT);

    for (const item of findings) {
        console.log(
            `[${item.level}] ${item.file}` +
            (item.line ? `:${item.line}` : "") +
            ` - ${item.message}`
        );
    }

    console.log(
        "\nNote: Findings are leads for review, not proof of exploitability."
    );
}

main();
