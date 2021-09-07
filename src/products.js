/**
 * products - defines the behavior of weather data grids, including grid construction, interpolation, and color scales.
 *
 * Copyright (c) 2014 Cameron Beccario
 * The MIT License - http://opensource.org/licenses/MIT
 *
 * https://github.com/cambecc/earth
 */
import _ from 'underscore'
import { WIND_OVERLAY } from "./agents/metadata-agent";
import { ArrayGrid } from "./array-grid";
import { floatToDate } from "./date";
import { degreeToIndexWithStepCount, floorMod, radiansToDegrees } from "./math";
import µ from './micro';
import { findMatchingUnitConversions } from "./units";

function buildProduct(overrides) {
    return _.extend({
        description: "",
        async build(...args) {
            let builder = await this.builder.apply(this, args);
            return _.extend(this, buildGrid(builder));
        }
    }, overrides);
}

function describeSurface(attr, metadata) {
    const heightValue = metadata.dimensions.levitation.values[attr.heightIndex];
    return heightValue + " " + metadata.dimensions.levitation.unit;
}

/**
 * Returns a function f(langCode) that, given table:
 *     {foo: {en: "A", ja: "あ"}, bar: {en: "I", ja: "い"}}
 * will return the following when called with "en":
 *     {foo: "A", bar: "I"}
 * or when called with "ja":
 *     {foo: "あ", bar: "い"}
 */
function localize(table) {
    return function(langCode) {
        var result = {};
        _.each(table, function(value, key) {
            result[key] = value[langCode] || value.en || value;
        });
        return result;
    }
}

function createIrregularHeader(metadata, time, gridDescription) {
    const timeValue = metadata.dimensions.time.values[time];
    const date = floatToDate(timeValue);

    return {
        centerName: metadata.centerName,
        dx: 1 / gridDescription.stepping,
        dy: 1 / gridDescription.stepping,
        gridUnits: "degrees",
        refTime: date.toISOString(),
        forecastTime: 0, // maybe we should change this?
        la1: gridDescription.y.max,
        la2: gridDescription.y.min,
        flipped: true,
        lo1: gridDescription.x.min,
        lo2: gridDescription.x.max,
        nx: gridDescription.width,
        ny: gridDescription.height
    }
}

function createHeader(metadata, time) {
    const timeValue = metadata.dimensions.time.values[time];
    const date = floatToDate(timeValue);

    const lonValueRange = metadata.dimensions.longitude.range;
    const latValueRange = metadata.dimensions.latitude.range;

    const latitudeDimensionSize = metadata.dimensions.latitude.size;
    const longitudeDimensionSize = metadata.dimensions.longitude.size;

    const latMin = Math.min(...latValueRange);
    const latMax = Math.max(...latValueRange);
    const latTotalRange = Math.abs(latMax - latMin);

    const lonMin = Math.min(...lonValueRange);
    const lonMax = Math.max(...lonValueRange);
    const lonTotalRange = Math.abs(lonMax - lonMin);

    return {
        centerName: metadata.centerName,
        dx: lonTotalRange / longitudeDimensionSize,
        dy: latTotalRange / latitudeDimensionSize,
        gridUnits: "degrees",
        refTime: date.toISOString(),
        forecastTime: 0, // maybe we should change this?
        la1: latMax,
        la2: latMin,
        flipped: latValueRange[0] < latValueRange[1], // We need to set it 'flipped' if -90 is at the start
        lo1: lonMin,
        lo2: lonMax,
        nx: longitudeDimensionSize,
        ny: latitudeDimensionSize
    }
}

function fastArrayMin(arr) {
    let len = arr.length, min = Infinity;
    while(len--) {
        if(arr[len] != null && arr[len] < min) {
            min = arr[len];
        }
    }
    return min;
}

function fastArrayMax(arr) {
    let len = arr.length, max = -Infinity;
    while(len--) {
        if(arr[len] > max) {
            max = arr[len];
        }
    }
    return max;
}

function convertLonRadianArray(latValues) {
    return latValues.map(lat => (radiansToDegrees(lat)) % 360);
}

function convertLatRadianArray(lonValues) {
    return lonValues.map(lon => (radiansToDegrees(lon)) % 180);
}

function getIrregularGridDescription(latValues, lonValues) {
    const latMin = Math.round(fastArrayMin(latValues)), latMax = Math.round(fastArrayMax(latValues));
    const lonMin = Math.round(fastArrayMin(lonValues)), lonMax = Math.round(fastArrayMax(lonValues));

    const gridHeight = (latMax - latMin) + 1;
    const gridWidth = (lonMax - lonMin) + 1;
    const stepping = 2;

    return {
        x: {
            min: lonMin,
            max: lonMax
        },
        y: {
            min: latMin,
            max: latMax
        },
        width: gridWidth * stepping,
        height: gridHeight * stepping,
        stepping,
        createGrid() {
            return new ArrayGrid(this.width, this.height);
        },
        latToGridPos(lat) {
            return degreeToIndexWithStepCount(lat, latMin, latMax, this.stepping);
        },
        lonToGridPos(lon) {
            return degreeToIndexWithStepCount(lon, lonMin, lonMax, this.stepping);
        }
    }
}

/**
 * This fills the empty spots in a grid (where the value is null or undefined)
 * with average values. It will look through each cell of the grid and if the
 * cell is not filled, it will take the average of the surrounding cells to
 * fill in it's value. This will only happen if at least two of the four cells
 * adjacent to the cell are filled.
 *
 * This process works from center of the y axis of the grid (usually the equator)
 * outwards to the edges. Usually, a lot of the missing spots from the conversion
 * happen to be on the outside. By coming from the center, we have a higher chance
 * of filling even larger holes by creating an avalanche that hopefully progresses
 * far towards the edges.
 *
 * @param grid the grid to average
 */
function averageGrid(grid) {
    const averageAt = (x, y) => {
        const valuesAround = [
            grid.getAt({ x: x + 1, y }),
            grid.getAt({ x, y: y + 1 }),
            grid.getAt({ x: x - 1, y }),
            grid.getAt({ x, y: y - 1 })
        ].filter(va => va != null);

        if(valuesAround.length > 1) {
            const average = valuesAround.reduce((a, b) => a + b) / valuesAround.length;
            grid.setAt({ x, y }, average);
        }
    }

    for(let x = 0; x < grid.width; x++) {
        for(let y = Math.floor(grid.height / 2); y < grid.height; y++) {
            const value = grid.getAt({ x, y });
            if(value === null || value === undefined) {
                averageAt(x, y);
            }
        }

        for(let y = Math.floor(grid.height / 2) - 1; y >= 0; y--) {
            const value = grid.getAt({ x, y });
            if(value === null || value === undefined) {
                averageAt(x, y);
            }
        }
    }
}

/**
 * Factories for creating overlays for the given type. This currently includes `wind`, `temp`, `generic`
 * and `off`. All variables are generally displayed using `generic` as we do not really know what will
 * be inside them, but we have special cases for wind, because it's made up of two variables, and
 * temperature, so we can provide good unit conversions. These factories also contain a matching clause
 * which checks if they should be selected given the current configuration, which includes the selected
 * overlay, overlay types, projection, etc.
 */
const FACTORIES = {
    "wind": {
        matches({ availableOverlays }) {
            return availableOverlays.some(overlay => overlay.id === WIND_OVERLAY);
        },
        create: function(attr, metadata) {
            const height = attr.heightIndex;
            const time = attr.timeIndex;

            if(height === -1) {
                throw new Error(`Could not find matching index for selected height.`);
            }

            if(time === -1 || metadata.dimensions.time.size <= time) {
                throw new Error(`Could not find matching index for time.`);
            }

            return buildProduct({
                field: "vector",
                type: "wind",
                description: localize({
                    name: {en: "Wind", ja: "風速"},
                    qualifier: {en: " @ " + describeSurface(attr, metadata), ja: " @ " + describeSurface(attr, metadata)}
                }),
                builder: async function(worker) {
                    const windOverlay = metadata.availableOverlays.find(overlay => overlay.type === "wind");
                    let uValues, vValues;
                    let max = 0;
                    let header;
                    if(metadata.irregular != null) {
                        const lon = convertLonRadianArray(metadata.dimensions.longitude.values);
                        const lat = convertLatRadianArray(metadata.dimensions.latitude.values);
                        const cellCount = metadata.irregular.cellCount;

                        const uGridValues = await worker.getValues(windOverlay.u.name, time, height, 0);
                        const vGridValues = await worker.getValues(windOverlay.v.name, time, height, 0);

                        const gridDescription = getIrregularGridDescription(lat, lon);

                        const uGrid = gridDescription.createGrid();
                        const vGrid = gridDescription.createGrid();

                        for(let i = 0; i < cellCount; i++) {
                            const latIndex = gridDescription.latToGridPos(lat[i]);
                            const lonIndex = gridDescription.lonToGridPos(lon[i]);

                            const u = uGridValues[i];
                            const v = vGridValues[i];

                            const pos = {x: lonIndex, y: latIndex};
                            uGrid.setAt(pos, u);
                            vGrid.setAt(pos, v);

                            const value = Math.pow(u, 2) + Math.pow(v, 2);
                            if(value > max) {
                                max = value;
                            }
                        }

                        max = Math.sqrt(max);

                        averageGrid(uGrid);
                        averageGrid(vGrid);

                        uValues = uGrid.raw;
                        vValues = vGrid.raw;
                        header = createIrregularHeader(metadata, time, gridDescription);
                    } else {
                        try {
                            uValues = await worker.getValues(windOverlay.u.name, time, height, 0, 0);
                            vValues = await worker.getValues(windOverlay.v.name, time, height, 0, 0);
                        } catch(er) {
                            throw new Error(`Error while loading u/v values at time index '${time}' height index '${height}': ${er}`);
                        }

                        const combinedValues = vValues.map((value, index) => {
                            return Math.pow(value, 2) + Math.pow(uValues[index], 2);
                        });
                        const maxSquared = fastArrayMax(combinedValues);
                        max = Math.sqrt(maxSquared);
                        header = createHeader(metadata, time);
                    }

                    return {
                        header,
                        interpolate: bilinearInterpolateVector,
                        data: function(i) {
                            return [uValues[i], vValues[i]];
                        },
                        bounds: [0, max],
                    }
                },
                units: [
                    {label: "km/h", conversion: function(x) { return x * 3.6; },      precision: 0},
                    {label: "m/s",  conversion: function(x) { return x; },            precision: 1},
                    {label: "kn",   conversion: function(x) { return x * 1.943844; }, precision: 0},
                    {label: "mph",  conversion: function(x) { return x * 2.236936; }, precision: 0}
                ],
                particles: {velocityScale: 1/60000, maxIntensity: 17}
            });
        }
    },

    "temp": {
        matches: _.matches({ overlayType: "temp" }),
        create: function(attr, metadata) {
            const height = attr.heightIndex;
            const time = attr.timeIndex;

            if(height === -1) {
                throw new Error(`Could not find matching index for selected height.`);
            }

            if(time === -1 || metadata.dimensions.time.size <= time) {
                throw new Error(`Could not find matching index for time.`);
            }

            return buildProduct({
                field: "scalar",
                type: "temp",
                description: localize({
                    name: {en: "Temp", ja: "気温"},
                    qualifier: {en: " ", ja: " "}
                }),
                builder: async function(worker) {
                    const tempOverlay = metadata.availableOverlays.find(overlay => overlay.type === "temp");
                    let header;
                    let values;
                    if(metadata.irregular != null) {
                        const lon = convertLonRadianArray(metadata.dimensions.longitude.values);
                        const lat = convertLatRadianArray(metadata.dimensions.latitude.values);
                        const gridDescription = getIrregularGridDescription(lat, lon);

                        const tempGrid = gridDescription.createGrid();

                        const cellCount = metadata.irregular.cellCount;
                        const tempValues = await worker.getValues(tempOverlay.name, time, height, 0);

                        for(let i = 0; i < cellCount; i++) {
                            const latIndex = gridDescription.latToGridPos(lat[i]);
                            const lonIndex = gridDescription.lonToGridPos(lon[i]);

                            tempGrid.setAt({ x: lonIndex, y: latIndex }, tempValues[i]);
                        }

                        averageGrid(tempGrid);

                        values = tempGrid.raw;
                        header = createIrregularHeader(metadata, time, gridDescription);
                    } else {
                        values = await worker.getValues(tempOverlay.name, time, height, 0, 0);
                        header = createHeader(metadata, time);
                    }
                    let max = fastArrayMax(values);
                    let min = fastArrayMin(values);

                    return {
                        header,
                        interpolate: bilinearInterpolateScalar,
                        data: function(i) {
                            return values[i];
                        },
                        bounds: [min, max],
                    }
                },
                units: [
                    {label: "°C", conversion: function(x) { return x - 273.15; },       precision: 1},
                    {label: "°F", conversion: function(x) { return x * 9/5 - 459.67; }, precision: 1},
                    {label: "K",  conversion: function(x) { return x; },                precision: 1}
                ],
            });
        }
    },

    "generic": {
        matches(attr) {
            return !['off', 'temp', 'wind'].includes(attr.overlayType);
        },
        create: function(attr, metadata) {
            const overlayDef = metadata.availableOverlays.find(overlay => overlay.id === attr.overlayType);
            const indices = [];
            if(metadata.irregular != null) {
                indices.push(0); // Ncells
            } else {
                indices.push(0); // lat
                indices.push(0); // lon
            }

            if(overlayDef.definedDimensions.height) {
                if(attr.heightIndex === -1) {
                    throw new Error(`Could not find matching index for selected height.`);
                }

                indices.unshift(attr.heightIndex);
            }

            let time = 0;
            if(overlayDef.definedDimensions.time) {
                time = attr.timeIndex;
                if(time === -1 || metadata.dimensions.time.size <= time) {
                    throw new Error(`Could not find matching index for time.`);
                }

                indices.unshift(time);
            }
            // if the variable is not defined for the time dimension, we are currently using the time value at
            // index 0 for other stuff that needs time, such as the header.

            return buildProduct({
                field: "scalar",
                type: "temp",
                description: localize({
                    name: { en: attr.overlay, ja: "気温" },
                    qualifier: { en: " ", ja: " " }
                }),
                builder: async function(worker) {
                    const unit = overlayDef.unit;
                    let header;
                    let values;
                    let min = Number.POSITIVE_INFINITY, max = Number.NEGATIVE_INFINITY;
                    if(metadata.irregular != null) {
                        const lon = convertLonRadianArray(metadata.dimensions.longitude.values);
                        const lat = convertLatRadianArray(metadata.dimensions.latitude.values);
                        const gridDescription = getIrregularGridDescription(lat, lon);

                        const grid = gridDescription.createGrid();

                        const cellCount = metadata.irregular.cellCount;
                        const dataValues = await worker.getValues(overlayDef.name, ...indices);

                        for(let i = 0; i < cellCount; i++) {
                            const latIndex = gridDescription.latToGridPos(lat[i]);
                            const lonIndex = gridDescription.lonToGridPos(lon[i]);

                            const value = dataValues[i];
                            grid.setAt({ x: lonIndex, y: latIndex }, value);
                            if(value > max) {
                                max = value;
                            }

                            if(value < min) {
                                min = value;
                            }
                        }

                        averageGrid(grid);

                        values = grid.raw;
                        header = createIrregularHeader(metadata, time, gridDescription);
                    } else {
                        values = await worker.getValues(overlayDef.name, ...indices);
                        min = fastArrayMin(values);
                        max = fastArrayMax(values);
                        header = createHeader(metadata, time);
                    }

                    return {
                        header,
                        units: findMatchingUnitConversions(unit, min, max),
                        interpolate: bilinearInterpolateScalar,
                        data: function(i) {
                            return values[i];
                        },
                        bounds: [min, max],
                    }
                }
            });
        }
    },

    "off": {
        matches: _.matches({overlayType: "off"}),
        create: function() {
            return null;
        }
    }
};

function bilinearInterpolateScalar(x, y, g00, g10, g01, g11) {
    var rx = (1 - x);
    var ry = (1 - y);
    return g00 * rx * ry + g10 * x * ry + g01 * rx * y + g11 * x * y;
}

function bilinearInterpolateVector(x, y, g00, g10, g01, g11) {
    var rx = (1 - x);
    var ry = (1 - y);
    var a = rx * ry,  b = x * ry,  c = rx * y,  d = x * y;
    var u = g00[0] * a + g10[0] * b + g01[0] * c + g11[0] * d;
    var v = g00[1] * a + g10[1] * b + g01[1] * c + g11[1] * d;
    return [u, v, Math.sqrt(u * u + v * v)];
}

/**
 * Builds an interpolator for the specified data in the form of JSON-ified GRIB files. Example:
 *
 *     [
 *       {
 *         "header": {
 *           "refTime": "2013-11-30T18:00:00.000Z",
 *           "parameterCategory": 2,
 *           "parameterNumber": 2,
 *           "surface1Type": 100,
 *           "surface1Value": 100000.0,
 *           "forecastTime": 6,
 *           "scanMode": 0,
 *           "nx": 360,
 *           "ny": 181,
 *           "lo1": 0,
 *           "la1": 90,
 *           "lo2": 359,
 *           "la2": -90,
 *           "dx": 1,
 *           "dy": 1
 *         },
 *         "data": [3.42, 3.31, 3.19, 3.08, 2.96, 2.84, 2.72, 2.6, 2.47, ...]
 *       }
 *     ]
 *
 */
export function buildGrid(builder) {
    // var builder = createBuilder(data);

    const header = builder.header;
    var λ0 = header.lo1, φ0 = header.la1;  // the grid's origin (e.g., 0.0E, 90.0N)
    var λ1 = header.lo2, φ1 = header.la2;
    var Δλ = header.dx, Δφ = header.dy;    // distance between grid points (e.g., 2.5 deg lon, 2.5 deg lat)
    var ni = header.nx, nj = header.ny;    // number of grid points W-E and N-S (e.g., 144 x 73)
    const date = new Date(header.refTime);

    // Scan mode 0 assumed. Longitude increases from λ0, and latitude decreases from φ0.
    // http://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_table3-4.shtml
    let flipped = header.flipped || false;
    var grid = new Array(nj), p = 0;
    var isContinuous = Math.floor(ni * Δλ) >= 360;
    for (let j = 0; j < nj; j++) {
        var row = [];
        for (let i = 0; i < ni; i++, p++) {
            row[i] = builder.data(p);
        }
        if (isContinuous) {
            // For wrapped grids, duplicate first column as last column to simplify interpolation logic
            row.push(row[0]);
        }

        if(flipped) {
            grid[nj - j - 1] = row;
        } else {
            grid[j] = row;
        }
    }

    function interpolate(λ, φ) {
        if(λ < λ0 || λ > λ1) {
            return null;
        } else if(φ < φ1 || φ > φ0) {
            return null;
        }

        var i = floorMod(λ - λ0, 360) / Δλ;  // calculate longitude index in wrapped range [0, 360)
        var j = (φ0 - φ) / Δφ;                   // calculate latitude index in direction +90 to -90

        //         1      2           After converting λ and φ to fractional grid indexes i and j, we find the
        //        fi  i   ci          four points "G" that enclose point (i, j). These points are at the four
        //         | =1.4 |           corners specified by the floor and ceiling of i and j. For example, given
        //      ---G--|---G--- fj 8   i = 1.4 and j = 8.3, the four surrounding grid points are (1, 8), (2, 8),
        //    j ___|_ .   |           (1, 9) and (2, 9).
        //  =8.3   |      |
        //      ---G------G--- cj 9   Note that for wrapped grids, the first column is duplicated as the last
        //         |      |           column, so the index ci can be used without taking a modulo.

        var fi = Math.floor(i), ci = fi + 1;
        var fj = Math.floor(j), cj = fj + 1;

        var row;
        if ((row = grid[fj])) {
            var g00 = row[fi];
            var g10 = row[ci];
            if (µ.isValue(g00) && µ.isValue(g10) && (row = grid[cj % nj])) {
                var g01 = row[fi];
                var g11 = row[ci];
                if (µ.isValue(g01) && µ.isValue(g11)) {
                    // All four points found, so interpolate the value.
                    return builder.interpolate(i - fi, j - fj, g00, g10, g01, g11);
                }
            }
        }
        console.log("cannot interpolate: " + λ + "," + φ + ": " + fi + " " + ci + " " + fj + " " + cj);
        return null;
    }


    let result = {
        date,
        interpolate,
        forEachPoint: function(cb) {
            for (let j = 0; j < nj; j++) {
                const row = grid[j] || [];
                for (let i = 0; i < ni; i++) {
                    cb(floorMod(180 + λ0 + i * Δλ, 360) - 180, φ0 - j * Δφ, row[i]);
                }
            }
        }
    };
    if(builder.bounds) {
        result.bounds = builder.bounds;
    }
    if(builder.units) {
        result.units = builder.units;
    }

    return result;
}

export function productsFor(attributes, metadata) {
    const attr = _.clone(attributes);
    return _.values(FACTORIES)
        .filter(factory => factory.matches({ availableOverlays: metadata.availableOverlays, ...attr}))
        .map(factory => factory.create(attr, metadata))
        .filter(µ.isValue);
}
