import micro from "./micro";
import Backbone from 'backbone';

const DEFAULT_CONFIG = "0/wind/0/orthographic";
const TOPOLOGY = micro.isMobile() ? "/data/earth-topo-mobile.json?v2" : "/data/earth-topo.json?v2";

/**
 * Parses a URL hash fragment:
 *
 * example: "2013/11/14/0900Z/wind/isobaric/1000hPa/orthographic=26.50,-153.00,1430/overlay=off"
 * output: {date: "2013/11/14", hour: "0900", param: "wind", surface: "isobaric", level: "1000hPa",
 *          projection: "orthographic", orientation: "26.50,-153.00,1430", overlayType: "off"}
 *
 * grammar:
 *     hash   := ( "current" | yyyy / mm / dd / hhhh "Z" ) / param / surface / level [ / option [ / option ... ] ]
 *     option := type [ "=" number [ "," number [ ... ] ] ]
 *
 * @param hash the hash fragment.
 * @param projectionNames the set of allowed projections.
 * @param overlayTypes the set of allowed overlays.
 * @returns {Object} the result of the parse.
 */
function parse(hash, projectionNames, overlayTypes) {
    var option, result = {};
    //                  1     2      3      4
    const tokens = /^(\d+)\/(\w+)\/(\d+)([\/].+)?/.exec(hash);
    if(tokens) {
        result = {
            timeIndex: parseInt(tokens[1]),
            param: tokens[2],                   // non-empty alphanumeric _
            heightIndex: parseInt(tokens[3]),   // non-empty alphanumeric _
            projection: "orthographic",
            orientation: "",
            topology: TOPOLOGY,
            overlayType: "default",
            showGridPoints: false
        };
        micro.coalesce(tokens[4], "").split("/").forEach(function(segment) {
            if((option = /^(\w+)(=([\d\-.,]*))?$/.exec(segment))) {
                if(projectionNames.has(option[1])) {
                    result.projection = option[1];                 // non-empty alphanumeric _
                    result.orientation = micro.coalesce(option[3], "");  // comma delimited string of numbers, or ""
                }
            } else if((option = /^(\w+)=([^/]+)$/.exec(segment))) {
                const name = option[1];
                const value = option[2];
                switch(name) {
                    case 'overlay':
                        if(overlayTypes.has(value) || value === "default") {
                            result.overlayType = value;
                        }
                        break;
                    case 'grid':
                        if(value === "on") {
                            result.showGridPoints = true;
                        }
                        break;
                    case 'filename':
                        result.file = value;
                        break;
                }
            }
        });
    }
    return result;
}


/**
 * A Backbone.js Model that persists its attributes as a human readable URL hash fragment. Loading from and
 * storing to the hash fragment is handled by the sync method.
 */
const Configuration = Backbone.Model.extend({
    id: 0,
    _ignoreNextHashChangeEvent: false,
    _projectionNames: null,
    _overlayTypes: null,

    /**
     * @returns {String} this configuration converted to a hash fragment.
     */
    toHash: function() {
        const attr = this.attributes;
        const dir = attr.timeIndex;
        const proj = [attr.projection, attr.orientation].filter(micro.isTruthy).join("=");
        const ol = !micro.isValue(attr.overlayType) || attr.overlayType === "default" ? "" : "overlay=" + attr.overlayType;
        const grid = attr.showGridPoints ? "grid=on" : "";
        const filename = (attr.file && attr.file !== "" ? `filename=${attr.file}` : "");
        return [dir + "", attr.param, attr.heightIndex + "", ol, proj, grid, filename].filter(micro.isTruthy).join("/");
    },

    /**
     * Synchronizes between the configuration model and the hash fragment in the URL bar. Invocations
     * caused by "hashchange" events must have the {trigger: "hashchange"} option specified.
     */
    sync: function(method, model, options) {
        switch(method) {
            case "read":
                if(options.trigger === "hashchange" && model._ignoreNextHashChangeEvent) {
                    model._ignoreNextHashChangeEvent = false;
                    return;
                }
                model.set(parse(
                    window.location.hash.substr(1) || DEFAULT_CONFIG,
                    model._projectionNames,
                    model._overlayTypes));
                break;
            case "update":
            case "create":
                // Ugh. Setting the hash fires a hashchange event during the next event loop turn. Ignore it.
                model._ignoreNextHashChangeEvent = true;
                window.location.hash = model.toHash();
                break;
        }
    }
});


/**
 * A Backbone.js Model to hold the page's configuration as a set of attributes: date, layer, projection,
 * orientation, etc. Changes to the configuration fire events which the page's components react to. For
 * example, configuration.save({projection: "orthographic"}) fires an event which causes the globe to be
 * re-rendered with an orthographic projection.
 *
 * All configuration attributes are persisted in a human readable form to the page's hash fragment (and
 * vice versa). This allows deep linking and back-button navigation.
 *
 * @returns {Configuration} Model to represent the hash fragment, using the specified set of allowed projections.
 */
export function buildConfiguration(projectionNames, overlayTypes) {
    const result = new Configuration();
    result._projectionNames = projectionNames;
    result._overlayTypes = overlayTypes;
    return result;
}
