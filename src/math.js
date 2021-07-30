/**
 * @returns {Number} returns remainder of floored division, i.e., floor(a / n). Useful for consistent modulo
 *          of negative numbers. See http://en.wikipedia.org/wiki/Modulo_operation.
 */
export function floorMod(a, n) {
    var f = a - n * Math.floor(a / n);
    // HACK: when a is extremely close to an n transition, f can be equal to n. This is bad because f must be
    //       within range [0, n). Check for this corner case. Example: a:=-1e-16, n:=10. What is the proper fix?
    return f === n ? 0 : f;
}

/**
 * @returns {Number} distance between two points having the form [x, y].
 */
export function distance(a, b) {
    const Δx = b[0] - a[0];
    const Δy = b[1] - a[1];
    return Math.sqrt(Δx * Δx + Δy * Δy);
}

/**
 * @returns {Number} the value x clamped to the range [low, high].
 */
export function clamp(x, low, high) {
    return Math.max(low, Math.min(x, high));
}

/**
 * @returns {number} the fraction of the bounds [low, high] covered by the value x, after clamping x to the
 *          bounds. For example, given bounds=[10, 20], this method returns 1 for x>=20, 0.5 for x=15 and 0
 *          for x<=10.
 */
export function proportion(x, low, high) {
    return (clamp(x, low, high) - low) / (high - low);
}

/**
 * @returns {number} the value p within the range [0, 1], scaled to the range [low, high].
 */
export function spread(p, low, high) {
    return p * (high - low) + low;
}

export function radiansToDegrees(radians) {
    return radians * (180 / Math.PI);
}

/**
 * Converts a degree value into an index on a grid, given the expected min/max degree values
 * and the amount of steps per degree we're using.
 *
 * Given that we have a value range of min 0degree to max 90degree and a grid that is 180 in
 * height (thus using 2 steps per degree), this function would convert a value of 10.5 degree
 * to 21.
 *
 * @param degree the degree value we want to convert
 * @param min the min degree value we're supporting
 * @param max the max degree value we're supporting
 * @param steps the amount of steps per degree
 * @returns {number} the index in the grid
 */
export function degreeToIndexWithStepCount(degree, min, max, steps) {
    const floored = Math.floor(degree);
    const difference = degree - floored;
    const base = floored - min;

    return Math.round(base * steps + (difference * steps));
}
