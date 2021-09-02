/*
 * report - functionality for reporting messages to the user
 *
 * Copyright (c) 2014 Cameron Beccario
 * The MIT License - http://opensource.org/licenses/MIT
 *
 * https://github.com/cambecc/earth
 */
import * as d3 from "d3";
import log from "./log";

const REMAINING = "▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫";   // glyphs for remaining progress bar
const COMPLETED = "▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪";   // glyphs for completed progress bar

/**
 * An object to display various types of messages to the user.
 */
const s = d3.select("#status"), p = d3.select("#progress"), total = REMAINING.length;
export default {
    status(msg) {
        return s.classed("bad") ? s : s.text(msg);  // errors are sticky until reset
    },
    error(err) {
        let msg = err.status ? err.status + " " + err.message : err;
        switch(err.status) {
            case -1:
                msg = "Server Down";
                break;
            case 404:
                msg = "No Data";
                break;
        }
        log.error(err);
        return s.classed("bad", true).text(msg);
    },
    reset() {
        return s.classed("bad", false).text("");
    },
    progress(amount) {  // amount of progress to report in the range [0, 1]
        if(0 <= amount && amount < 1) {
            const i = Math.ceil(amount * total);
            const bar = COMPLETED.substr(0, i) + REMAINING.substr(0, total - i);
            return p.classed("invisible", false).text(bar);
        }
        return p.classed("invisible", true).text("");  // progress complete
    }
};
