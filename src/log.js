
function format(o) {
    return o && o.stack ? o + "\n" + o.stack : o;
}

/**
 * @returns {Object} an object to perform logging, if/when the browser supports it.
 */
export default {
    debug: function(s) {
        if(console && console.log) console.log(format(s));
    },
    info: function(s) {
        if(console && console.info) console.info(format(s));
    },
    error: function(e) {
        if(console && console.error) console.error(format(e));
    },
    time: function(s) {
        if(console && console.time) console.time(format(s));
    },
    timeEnd: function(s) {
        if(console && console.timeEnd) console.timeEnd(format(s));
    }
};
