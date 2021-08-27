import { proportion } from "./math";

const BOUNDARY = 0.45;
const τ = 2 * Math.PI;
const fadeToWhite = colorInterpolator(sinebowColor(1.0, 0), [255, 255, 255]);


function colorInterpolator(start, end) {
    var r = start[0], g = start[1], b = start[2];
    var Δr = end[0] - r, Δg = end[1] - g, Δb = end[2] - b;
    return function(i, a) {
        return [Math.floor(r + i * Δr), Math.floor(g + i * Δg), Math.floor(b + i * Δb), a];
    };
}

/**
 * Produces a color style in a rainbow-like trefoil color space. Not quite HSV, but produces a nice
 * spectrum. See http://krazydad.com/tutorials/makecolors.php.
 *
 * @param hue the hue rotation in the range [0, 1]
 * @param a the alpha value in the range [0, 255]
 * @returns {Array} [r, g, b, a]
 */
function sinebowColor(hue, a) {
    // Map hue [0, 1] to radians [0, 5/6τ]. Don't allow a full rotation because that keeps hue == 0 and
    // hue == 1 from mapping to the same color.
    var rad = hue * τ * 5 / 6;
    rad *= 0.75;  // increase frequency to 2/3 cycle per rad

    var s = Math.sin(rad);
    var c = Math.cos(rad);
    var r = Math.floor(Math.max(0, -c) * 255);
    var g = Math.floor(Math.max(s, 0) * 255);
    var b = Math.floor(Math.max(c, 0, -s) * 255);
    return [r, g, b, a];
}

/**
 * Interpolates a sinebow color where 0 <= i <= j, then fades to white where j < i <= 1.
 *
 * @param i number in the range [0, 1]
 * @param a alpha value in range [0, 255]
 * @returns {Array} [r, g, b, a]
 */
function extendedSinebowColor(i, a) {
    return i <= BOUNDARY ?
        sinebowColor(i / BOUNDARY, a) :
        fadeToWhite((i - BOUNDARY) / (1 - BOUNDARY), a);
}

export function extendedSinebowColorScale() {
    return extendedSinebowColor;
}

/**
 * Creates a color scale composed of the specified segments. Segments is an array of two-element arrays of the
 * form [value, color], where value is the point along the scale and color is the [r, g, b] color at that point.
 * For example, the following creates a scale that smoothly transitions from red to green to blue along the
 * points 0.5, 1.0, and 3.5:
 *
 *     [ [ 0.5, [255, 0, 0] ],
 *       [ 1.0, [0, 255, 0] ],
 *       [ 3.5, [0, 0, 255] ] ]
 *
 * @param segments array of color segments
 * @returns {Function} a function(point, alpha) that returns the color [r, g, b, alpha] for the given point.
 */
export function segmentedColorScale(segments) {
    var points = [], interpolators = [], ranges = [];
    for(let i = 0; i < segments.length - 1; i++) {
        points.push(segments[i + 1][0]);
        interpolators.push(colorInterpolator(segments[i][1], segments[i + 1][1]));
        ranges.push([segments[i][0], segments[i + 1][0]]);
    }

    return function(point, alpha) {
        let i;
        for(i = 0; i < points.length - 1; i++) {
            if(point <= points[i]) {
                break;
            }
        }
        const range = ranges[i];
        return interpolators[i](proportion(point, range[0], range[1]), alpha);
    };
}

function asColorStyle(r, g, b, a) {
    return "rgba(" + r + ", " + g + ", " + b + ", " + a + ")";
}

/**
 * @returns {Array} of wind colors and a method, indexFor, that maps wind magnitude to an index on the color scale.
 */
export function windIntensityColorScale(step, maxWind) {
    const result = [];
    for(let j = 85; j <= 255; j += step) {
        result.push(asColorStyle(j, j, j, 1.0));
    }
    result.indexFor = function(m) {  // map wind speed to a style
        return Math.floor(Math.min(m, maxWind) / maxWind * (result.length - 1));
    };
    return result;
}

function hexToRGB(hex) {
    if(hex.startsWith('#')) {
        hex = hex.substr(1);
    }

    const match = hex.match(/.{1,2}/g);
    return [
        parseInt(match[0], 16),
        parseInt(match[1], 16),
        parseInt(match[2], 16)
    ];
}

export function colorAccordingToScale(name, value, alpha) {
    return COLORSCALES.find(entry => entry.name === name).scale(value, alpha);
}

/**
 * List of color scales available in the application.
 * Each object in this list represents a color scale with a `name` and
 * `scale`, describing its name and a color conversion function respectively.
 *
 * The `scale` function converts a given value and alpha to the corresponding
 * color in this scale (`(value, alpha) -> [r, g, b, a]`). The value will
 * always be between 0.0 and 1.0. How exactly a value is mapped to a color can
 * be anything, but there's a wrapper function `segmentedColorScale` that
 * allows providing a few colors at specific values and it will interpolate
 * between them to create a continuous scale.
 *
 * A new scale can simply be added by creating a new object in the list with
 * those properties. It will then also be picked up by the UI for users to
 * select. An example could look like
 * {
 *      name: "blackwhite",
 *      scale: segmentedColorScale([
 *          [0, hexToRGB("#00000")],
 *          [1, hexToRGB("#FFFFFF")]
 *      ]);
 * }
 */
export const COLORSCALES = [
    {
        name: 'sinebow',
        scale: extendedSinebowColorScale()
    },
    {
        name: 'blue',
        scale: segmentedColorScale([
            [0, hexToRGB("#004c6d")],
            [1 / 8, hexToRGB("#1d607f")],
            [2 / 8, hexToRGB("#337591")],
            [3 / 8, hexToRGB("#488aa3")],
            [4 / 8, hexToRGB("#5da0b5")],
            [5 / 8, hexToRGB("#73b6c7")],
            [6 / 8, hexToRGB("#8acdda")],
            [7 / 8, hexToRGB("#a1e4ec")],
            [8 / 8, hexToRGB("#bafbff")]
        ])
    },
    {
        name: 'sunrise',
        scale: segmentedColorScale([
            [0, hexToRGB("#003f5c")],
            [1 / 7, hexToRGB("#2f4b7c")],
            [2 / 7, hexToRGB("#665191")],
            [3 / 7, hexToRGB("#a05195")],
            [4 / 7, hexToRGB("#d45087")],
            [5 / 7, hexToRGB("#f95d6a")],
            [6 / 7, hexToRGB("#ff7c43")],
            [7 / 7, hexToRGB("#ffa600")]
        ])
    },
    {
        name: 'heat',
        scale: segmentedColorScale([
            [0, hexToRGB("#ffffcc")],
            [1 / 8, hexToRGB("#ffeda0")],
            [2 / 8, hexToRGB("#fed976")],
            [3 / 8, hexToRGB("#feb24c")],
            [4 / 8, hexToRGB("#fd8d3c")],
            [5 / 8, hexToRGB("#fc4e2a")],
            [6 / 8, hexToRGB("#e31a1c")],
            [7 / 8, hexToRGB("#bd0026")],
            [8 / 8, hexToRGB("#800026")]
        ])
    },
    {
        name: 'diverging',
        scale: segmentedColorScale([
            [0, hexToRGB("#b35806")],
            [1 / 8, hexToRGB("#e08214")],
            [2 / 8, hexToRGB("#fdb863")],
            [3 / 8, hexToRGB("#fee0b6")],
            [4 / 8, hexToRGB("#f7f7f7")],
            [5 / 8, hexToRGB("#d8daeb")],
            [6 / 8, hexToRGB("#b2abd2")],
            [7 / 8, hexToRGB("#8073ac")],
            [8 / 8, hexToRGB("#542788")]
        ])
    }
];
