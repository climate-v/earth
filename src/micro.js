/**
 * micro - a grab bag of somewhat useful utility functions and other stuff that requires unit testing
 *
 * Copyright (c) 2014 Cameron Beccario
 * The MIT License - http://opensource.org/licenses/MIT
 *
 * https://github.com/cambecc/earth
 */

import * as d3 from 'd3';

var τ = 2 * Math.PI;
var H = 0.0000360;  // 0.0000360°φ ~= 4m

/**
 * @returns {Boolean} true if the specified value is truthy.
 */
function isTruthy(x) {
    return !!x;
}

/**
 * @returns {Boolean} true if the specified value is not null and not undefined.
 */
function isValue(x) {
    return x !== null && x !== undefined;
}

/**
 * @returns {Object} the first argument if not null and not undefined, otherwise the second argument.
 */
function coalesce(a, b) {
    return isValue(a) ? a : b;
}

/**
 * Pad number with leading zeros. Does not support fractional or negative numbers.
 */
function zeroPad(n, width) {
    var s = n.toString();
    var i = Math.max(width - s.length, 0);
    return new Array(i + 1).join("0") + s;
}

/**
 * @returns {String} the specified string with the first letter capitalized.
 */
function capitalize(s) {
    return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.substr(1);
}

/**
 * @returns {Boolean} true if agent is probably firefox. Don't really care if this is accurate.
 */
function isFF() {
    return (/firefox/i).test(navigator.userAgent);
}

/**
 * @returns {Boolean} true if agent is probably a mobile device. Don't really care if this is accurate.
 */
function isMobile() {
    return (/android|blackberry|iemobile|ipad|iphone|ipod|opera mini|webos/i).test(navigator.userAgent);
}

function isEmbeddedInIFrame() {
    return window != window.top;
}

/**
 * @returns {width: (Number), height: (Number)} an object that describes the size of the browser's current view.
 */
function view() {
    var w = window;
    var d = document && document.documentElement;
    var b = document && document.getElementsByTagName("body")[0];
    var x = w.innerWidth || d.clientWidth || b.clientWidth;
    var y = w.innerHeight || d.clientHeight || b.clientHeight;
    return {width: x, height: y};
}

/**
 * Removes all children of the specified DOM element.
 */
function removeChildren(element) {
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
}

/**
 * @returns {Object} clears and returns the specified Canvas element's 2d context.
 */
function clearCanvas(canvas) {
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    return canvas;
}

function linearScale(min, max) {
    return d3.scaleLinear().domain([min, max]);
}

function symlogScale(min, max) {
    return d3.scaleSymlog().domain([min, max]);
}

function logScale(min, max) {
    // Log scale may not go through zero.
    if (min === 0) {
        min += 0.0000000001;
    }

    return d3.scaleLog().domain([min, max])
}

/**
 * Returns a human readable string for the provided coordinates.
 */
function formatCoordinates(λ, φ) {
    return Math.abs(φ).toFixed(2) + "° " + (φ >= 0 ? "N" : "S") + ", " +
        Math.abs(λ).toFixed(2) + "° " + (λ >= 0 ? "E" : "W");
}

/**
 * Returns a human readable string for the provided scalar in the given units.
 */
function formatScalar(value, units) {
    let convertedValue = units.conversion(value);
    if(Math.abs(convertedValue) < 0.001 ) {
        return convertedValue.toExponential(units.precision);
    } else {
        return convertedValue.toFixed(units.precision);
    }
}

/**
 * Returns a human readable string for the provided rectangular wind vector in the given units.
 * See http://mst.nerc.ac.uk/wind_vect_convs.html.
 */
function formatVector(wind, units) {
    var d = Math.atan2(-wind[0], -wind[1]) / τ * 360;  // calculate into-the-wind cardinal degrees
    var wd = Math.round((d + 360) % 360 / 5) * 5;  // shift [-180, 180] to [0, 360], and round to nearest 5.
    return wd.toFixed(0) + "° @ " + formatScalar(wind[2], units);
}

/**
 * Returns a promise for a JSON resource (URL) fetched via XHR. If the load fails, the promise rejects with an
 * object describing the reason: {status: http-status-code, message: http-status-text, resource:}.
 */
function loadJson(resource) {
    return fetchResource(resource).then(res => res.json());
}

function fetchResource(resource) {
    return fetch(resource).then(response => {
        if(!response.ok) {
            throw {
                status: response.status,
                message: "Cannot load resource: " + response.statusText,
                resource: resource
            }
        }
        return response;
    });
}

/**
 * Returns the distortion introduced by the specified projection at the given point.
 *
 * This method uses finite difference estimates to calculate warping by adding a very small amount (h) to
 * both the longitude and latitude to create two lines. These lines are then projected to pixel space, where
 * they become diagonals of triangles that represent how much the projection warps longitude and latitude at
 * that location.
 *
 * <pre>
 *        (λ, φ+h)                  (xλ, yλ)
 *           .                         .
 *           |               ==>        \
 *           |                           \   __. (xφ, yφ)
 *    (λ, φ) .____. (λ+h, φ)       (x, y) .--
 * </pre>
 *
 * See:
 *     Map Projections: A Working Manual, Snyder, John P: pubs.er.usgs.gov/publication/pp1395
 *     gis.stackexchange.com/questions/5068/how-to-create-an-accurate-tissot-indicatrix
 *     www.jasondavies.com/maps/tissot
 *
 * @returns {Array} array of scaled derivatives [dx/dλ, dy/dλ, dx/dφ, dy/dφ]
 */
function distortion(projection, λ, φ, x, y) {
    var hλ = λ < 0 ? H : -H;
    var hφ = φ < 0 ? H : -H;
    var pλ = projection([λ + hλ, φ]);
    var pφ = projection([λ, φ + hφ]);

    // Meridian scale factor (see Snyder, equation 4-3), where R = 1. This handles issue where length of 1° λ
    // changes depending on φ. Without this, there is a pinching effect at the poles.
    var k = Math.cos(φ / 360 * τ);

    return [
        (pλ[0] - x) / hλ / k,
        (pλ[1] - y) / hλ / k,
        (pφ[0] - x) / hφ,
        (pφ[1] - y) / hφ
    ];
}

function scaled(value, min, max) {
    return Math.abs((value - min) / (max - min));
}

export default {
    isTruthy: isTruthy,
    isValue: isValue,
    coalesce: coalesce,
    zeroPad: zeroPad,
    isFF: isFF,
    isMobile: isMobile,
    isEmbeddedInIFrame: isEmbeddedInIFrame,
    view: view,
    removeChildren: removeChildren,
    clearCanvas: clearCanvas,
    formatCoordinates: formatCoordinates,
    formatScalar: formatScalar,
    formatVector: formatVector,
    loadJson,
    fetchResource,
    distortion: distortion,
    linearScale,
    logScale,
    symlogScale
};
