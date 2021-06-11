import micro from './micro';

const DAY_IN_SECONDS = 24 * 60 * 60;

export function toUTCISO(date) {
    return date.getUTCFullYear() + "-" +
        micro.zeroPad(date.getUTCMonth() + 1, 2) + "-" +
        micro.zeroPad(date.getUTCDate(), 2) + " " +
        micro.zeroPad(date.getUTCHours(), 2) + ":00";
}

export function toLocalISO(date) {
    return date.getFullYear() + "-" +
        micro.zeroPad(date.getMonth() + 1, 2) + "-" +
        micro.zeroPad(date.getDate(), 2) + " " +
        micro.zeroPad(date.getHours(), 2) + ":00";
}

/**
 * @returns {String} the string yyyyfmmfdd as yyyytmmtdd, where f and t are the "from" and "to" delimiters. Either
 *          delimiter may be the empty string.
 */
export function ymdRedelimit(ymd, fromDelimiter, toDelimiter) {
    if(!fromDelimiter) {
        return ymd.substr(0, 4) + toDelimiter + ymd.substr(4, 2) + toDelimiter + ymd.substr(6, 2);
    }
    const parts = ymd.substr(0, 10).split(fromDelimiter);
    return [parts[0], parts[1], parts[2]].join(toDelimiter);
}

/**
 * @returns {String} the UTC year, month, and day of the specified date in yyyyfmmfdd format, where f is the
 *          delimiter (and may be the empty string).
 */
export function dateToUTCymd(date, delimiter) {
    return ymdRedelimit(date.toISOString(), "-", delimiter || "");
}

export function dateToConfig(date) {
    return { date: dateToUTCymd(date, "/"), hour: micro.zeroPad(date.getUTCHours(), 2) + "00" };
}

export function floatToDate(floatValue) {
    const valueWithoutTime = Math.floor(floatValue);
    const dayPercentage = floatValue - valueWithoutTime;
    const day = valueWithoutTime % 100;
    const month = ((valueWithoutTime - day) / 100) % 100;
    const year = (valueWithoutTime - (month * 100 + day)) / 10000;
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setSeconds(Math.floor(DAY_IN_SECONDS * dayPercentage));
    return date;
}
