'use strict';

const path = require('path');

let geo = null;


/*
|--------------------------------------------------------------------------
| LOAD BD GEO
|--------------------------------------------------------------------------
*/

function loadGeo() {

    if (geo) {
        return geo;
    }

    const geoPath = path.join(
        process.cwd(),
        'node_modules',
        '@olism',
        'bd-geo',
        'dist',
        'index.js'
    );

    try {

        geo = require(geoPath);

        /*
        |--------------------------------------------------------------------------
        | Some package builds expose functions through default
        |--------------------------------------------------------------------------
        */

        if (
            geo &&
            geo.default &&
            typeof geo.default === 'object'
        ) {
            geo = {
                ...geo.default,
                ...geo
            };
        }

        return geo;

    } catch (error) {

        console.error(
            'bd-geo load error:',
            error
        );

        throw error;
    }
}


/*
|--------------------------------------------------------------------------
| NORMALIZE ID
|--------------------------------------------------------------------------
*/

function normalizeId(value) {

    const id =
        String(value ?? '').trim();

    return id;
}


/*
|--------------------------------------------------------------------------
| NORMALIZE ROWS
|--------------------------------------------------------------------------
*/

function normalizeRows(rows) {

    if (!Array.isArray(rows)) {
        return [];
    }

    return rows.map((row) => ({

        id: row.id,

        name:
            row.name ||
            row.nameBn ||
            row.bn_name ||
            row.name_bn ||
            '',

        name_bn:
            row.nameBn ||
            row.bn_name ||
            row.name_bn ||
            row.name ||
            ''

    }));
}


/*
|--------------------------------------------------------------------------
| GET DIVISIONS
|--------------------------------------------------------------------------
*/

async function getDivisions() {

    const data =
        loadGeo();

    const rows =
        typeof data.getDivisions === 'function'
            ? data.getDivisions()
            : [];

    return normalizeRows(rows);
}


/*
|--------------------------------------------------------------------------
| GET DISTRICTS
|--------------------------------------------------------------------------
*/

async function getDistricts(
    divisionId
) {

    const data =
        loadGeo();

    const rows =
        typeof data.getDistricts === 'function'
            ? data.getDistricts()
            : [];

    const selectedDivisionId =
        normalizeId(
            divisionId
        );

    return normalizeRows(
        rows.filter(
            (row) =>
                normalizeId(
                    row.divisionId
                ) === selectedDivisionId
        )
    );
}


/*
|--------------------------------------------------------------------------
| GET UPAZILAS
|--------------------------------------------------------------------------
*/

async function getUpazilas(
    districtId
) {

    const data =
        loadGeo();

    const rows =
        typeof data.getUpazilas === 'function'
            ? data.getUpazilas()
            : [];

    const selectedDistrictId =
        normalizeId(
            districtId
        );

    return normalizeRows(
        rows.filter(
            (row) =>
                normalizeId(
                    row.districtId
                ) === selectedDistrictId
        )
    );
}


/*
|--------------------------------------------------------------------------
| RESOLVE LOCATION
|--------------------------------------------------------------------------
|
| Validates:
|
| Division
|     ↓
| District
|     ↓
| Upazila
|
|--------------------------------------------------------------------------
*/

async function resolveLocation(
    divisionId,
    districtId,
    upazilaId
) {

    const data =
        loadGeo();


    const selectedDivisionId =
        normalizeId(
            divisionId
        );

    const selectedDistrictId =
        normalizeId(
            districtId
        );

    const selectedUpazilaId =
        normalizeId(
            upazilaId
        );


    /*
    |--------------------------------------------------------------------------
    | REQUIRED LOCATION IDS
    |--------------------------------------------------------------------------
    */

    if (
        !selectedDivisionId ||
        !selectedDistrictId ||
        !selectedUpazilaId
    ) {

        console.error(
            '[BD GEO INVALID INPUT]',
            {
                divisionId:
                    selectedDivisionId,

                districtId:
                    selectedDistrictId,

                upazilaId:
                    selectedUpazilaId
            }
        );

        throw new Error(
            'Invalid Bangladesh location selected.'
        );
    }


    /*
    |--------------------------------------------------------------------------
    | LOAD ALL DATA
    |--------------------------------------------------------------------------
    */

    const divisions =
        typeof data.getDivisions === 'function'
            ? data.getDivisions()
            : [];

    const districts =
        typeof data.getDistricts === 'function'
            ? data.getDistricts()
            : [];

    const upazilas =
        typeof data.getUpazilas === 'function'
            ? data.getUpazilas()
            : [];


    /*
    |--------------------------------------------------------------------------
    | FIND DIVISION
    |--------------------------------------------------------------------------
    */

    const division =
        divisions.find(
            (row) =>
                normalizeId(
                    row.id
                ) === selectedDivisionId
        );


    if (!division) {

        console.error(
            '[BD GEO DIVISION NOT FOUND]',
            {
                divisionId:
                    selectedDivisionId
            }
        );

        throw new Error(
            'Invalid Bangladesh division selected.'
        );
    }


    /*
    |--------------------------------------------------------------------------
    | FIND DISTRICT
    |--------------------------------------------------------------------------
    |
    | IMPORTANT:
    | District must belong to selected Division.
    |
    */

    const district =
        districts.find(
            (row) =>
                normalizeId(
                    row.id
                ) === selectedDistrictId &&
                normalizeId(
                    row.divisionId
                ) === selectedDivisionId
        );


    if (!district) {

        console.error(
            '[BD GEO DISTRICT NOT FOUND]',
            {
                divisionId:
                    selectedDivisionId,

                districtId:
                    selectedDistrictId
            }
        );

        throw new Error(
            'Selected district does not belong to selected division.'
        );
    }


    /*
    |--------------------------------------------------------------------------
    | FIND UPAZILA
    |--------------------------------------------------------------------------
    |
    | Upazila must belong to selected District.
    |
    */

    const upazila =
        upazilas.find(
            (row) =>
                normalizeId(
                    row.id
                ) === selectedUpazilaId &&
                normalizeId(
                    row.districtId
                ) === selectedDistrictId
        );


    if (!upazila) {

        console.error(
            '[BD GEO UPAZILA NOT FOUND]',
            {
                districtId:
                    selectedDistrictId,

                upazilaId:
                    selectedUpazilaId
            }
        );

        throw new Error(
            'Selected upazila does not belong to selected district.'
        );
    }


    /*
    |--------------------------------------------------------------------------
    | RETURN BANGLA LOCATION
    |--------------------------------------------------------------------------
    */

    return {

        division:
            division.nameBn ||
            division.name ||
            '',

        district:
            district.nameBn ||
            district.name ||
            '',

        upazila:
            upazila.nameBn ||
            upazila.name ||
            ''

    };
}


/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {

    getDivisions,

    getDistricts,

    getUpazilas,

    resolveLocation

};