"use strict";

const service =
    require("../../services/customers/customer-csv.service");


/*
|--------------------------------------------------------------------------
| TIMESTAMP
|--------------------------------------------------------------------------
*/

function stamp() {

    const d = new Date();

    const p =
        n => String(n).padStart(2, "0");

    return (
        `${d.getFullYear()}-` +
        `${p(d.getMonth() + 1)}-` +
        `${p(d.getDate())}_` +
        `${p(d.getHours())}-` +
        `${p(d.getMinutes())}-` +
        `${p(d.getSeconds())}`
    );
}


/*
|--------------------------------------------------------------------------
| CSV DOWNLOAD HEADERS
|--------------------------------------------------------------------------
*/

function download(
    res,
    filename
) {

    res.setHeader(
        "Content-Type",
        "text/csv; charset=UTF-8"
    );

    res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
    );

    res.setHeader(
        "Pragma",
        "no-cache"
    );

    res.setHeader(
        "Expires",
        "0"
    );
}


/*
|--------------------------------------------------------------------------
| TEMPLATE
|--------------------------------------------------------------------------
*/

function template(
    req,
    res
) {

    download(
        res,
        "customer_import_template.csv"
    );

    return res.send(
        service.templateCsv()
    );
}


/*
|--------------------------------------------------------------------------
| EXPORT
|--------------------------------------------------------------------------
*/

async function exportAll(
    req,
    res
) {

    try {

        download(
            res,
            `customers_${stamp()}.csv`
        );

        await service.exportCsv(
            {
                user: req.session,
                search: req.query.search,
                status: req.query.status
            },
            chunk => res.write(chunk)
        );

        return res.end();

    } catch (error) {

        if (
            !(error instanceof service.CsvError)
        ) {

            console.error(
                "CSV EXPORT ERROR:",
                error
            );
        }

        if (res.headersSent) {
            return res.end();
        }

        return res
            .status(
                error instanceof service.CsvError
                    ? error.httpCode
                    : 500
            )
            .type("text")
            .send(
                error instanceof service.CsvError
                    ? error.message
                    : "Export failed."
            );
    }
}


/*
|--------------------------------------------------------------------------
| IMPORT
|--------------------------------------------------------------------------
*/

async function importFile(
    req,
    res
) {

    console.log("");
    console.log(
        "======================================"
    );
    console.log(
        "        CSV IMPORT DEBUG"
    );
    console.log(
        "======================================"
    );

    console.log(
        "METHOD:",
        req.method
    );

    console.log(
        "URL:",
        req.originalUrl
    );

    console.log(
        "CONTENT-TYPE:",
        req.headers["content-type"]
    );

    console.log(
        "REQ.FILES EXISTS:",
        !!req.files
    );

    console.log(
        "REQ.FILES:",
        req.files
            ? Object.keys(req.files)
            : []
    );


    const uploadedFile =
        req.files &&
        req.files.csv_file;


    console.log(
        "CSV_FILE EXISTS:",
        !!uploadedFile
    );


    if (uploadedFile) {

        console.log(
            "FILE NAME:",
            uploadedFile.name
        );

        console.log(
            "FILE MIME:",
            uploadedFile.mimetype
        );

        console.log(
            "FILE SIZE:",
            uploadedFile.size
        );

        console.log(
            "FILE TRUNCATED:",
            uploadedFile.truncated
        );

        console.log(
            "FILE DATA BUFFER:",
            Buffer.isBuffer(
                uploadedFile.data
            )
        );
    }


    console.log(
        "======================================"
    );


    try {

        if (!uploadedFile) {

            return res
                .status(400)
                .json({

                    success: false,

                    message:
                        "CSV file not received. Field name must be csv_file."

                });
        }


        /*
        |--------------------------------------------------------------------------
        | IMPORTANT
        |--------------------------------------------------------------------------
        | express-fileupload uses:
        |
        | req.files.csv_file.data
        |
        | NOT:
        |
        | req.files.csv_file.buffer
        |
        */

        const file = {

            ...uploadedFile,

            /*
            | Compatibility with service
            */

            buffer:
                uploadedFile.data,

            filename:
                uploadedFile.name,

            name:
                uploadedFile.name

        };


        const report =
            await service.importCsv({

                user:
                    req.session,

                file:
                    file

            });


        return res.json({

            success:
                report.errors === 0 ||
                report.inserted > 0,

            message:
                report.summary,

            report

        });


    } catch (error) {

        console.error(
            "CSV IMPORT ERROR:",
            error
        );


        return res
            .status(
                error instanceof service.CsvError
                    ? error.httpCode
                    : 500
            )
            .json({

                success: false,

                message:
                    error instanceof service.CsvError
                        ? error.message
                        : "CSV import failed."

            });
    }
}


/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {

    template,

    exportAll,

    importFile

};