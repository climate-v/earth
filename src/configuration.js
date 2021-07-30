import Backbone from 'backbone';
import micro from "./micro";

const DEFAULT_CONFIG = "0/0/orthographic";
const TOPOLOGY = micro.isMobile() ? "/data/earth-topo-mobile.json?v2" : "/data/earth-topo.json?v2";
const OPTION_SEPARATOR = "|";

/**
 * Parses a URL hash fragment:
 *
 * example: "2013/11/14/0900Z/wind/isobaric/1000hPa/orthographic=26.50,-153.00,1430/overlay=off"
 * output: {date: "2013/11/14", hour: "0900", param: "wind", surface: "isobaric", level: "1000hPa",
 *          projection: "orthographic", orientation: "26.50,-153.00,1430", overlayType: "off"}
 *
 * grammar:
 *     hash   := timeIndex / param / heightIndex [ / option [ | option ... ] ]
 *     option := type [ "=" number [ "," number [ ... ] ] ]
 *
 * @param hash the hash fragment.
 * @param projectionNames the set of allowed projections.
 * @returns {Object} the result of the parse.
 */
function parse(hash, projectionNames) {
    let result = {};
    //                  1     2      3    4
    const tokens = /^(\d+)\/(\d+)([\/](.+))?/.exec(hash);
    if(tokens) {
        result = {
            timeIndex: parseInt(tokens[1]),
            heightIndex: parseInt(tokens[2]),
            projection: "orthographic",
            orientation: "",
            topology: TOPOLOGY,
            overlayType: "default",
            scale: 'linear',
            colorscale: 'sinebow',
            showGridPoints: false
        };
        micro.coalesce(tokens[4], "").split(OPTION_SEPARATOR).forEach(function(segment) {
            let optionName;
            let optionValue = null;
            if(segment.includes("=")) {
                let [name, ...values] = segment.split("=");
                optionName = name;
                optionValue = values.join("=");
            } else {
                optionName = segment;
            }

            switch(optionName) {
                case 'overlay':
                    result.overlayType = optionValue;
                    break;
                case 'scale':
                    result.scale = optionValue;
                    break;
                case 'grid':
                    if(optionValue === "on") {
                        result.showGridPoints = true;
                    }
                    break;
                case 'file':
                    result.file = optionValue;
                    break;
                case 'colorscale':
                    result.colorscale = optionValue;
                    break;
                default:
                    if(projectionNames.has(optionName) && (/^[\d\-.,]*$/.test(optionValue) || optionValue == null)) {
                        result.projection = optionName;
                        result.orientation = optionValue;
                    }
                    break;
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
    _projectionNames: null,

    /**
     * @returns {String} this configuration converted to a hash fragment.
     */
    toHash() {
        const attr = this.attributes;
        const time = attr.timeIndex + "";
        const height = attr.heightIndex + "";
        const proj = [attr.projection, attr.orientation].filter(micro.isTruthy).join("=");
        const ol = !micro.isValue(attr.overlayType) || attr.overlayType === "default" ? "" : "overlay=" + attr.overlayType;
        const grid = attr.showGridPoints ? "grid=on" : "";
        const filename = (attr.file && attr.file !== "" ? `file=${attr.file}` : "");
        const scale = (attr.scale != null ? `scale=${attr.scale}` : "");
        const colorscale = (attr.colorscale != null ? `colorscale=${attr.colorscale}` : "");
        const options = [ol, proj, grid, filename, scale, colorscale].filter(micro.isTruthy).join(OPTION_SEPARATOR);
        return [time, height, options].filter(micro.isTruthy).join("/");
    },

    /**
     * Synchronizes between the configuration model and the hash fragment in the URL bar. Invocations
     * caused by "hashchange" events must have the {trigger: "hashchange"} option specified.
     */
    sync(method, model, options) {
        switch(method) {
            case "read":
                let parsed = parse(window.location.hash.substr(1) || DEFAULT_CONFIG, model._projectionNames);
                model.set(parsed);
                break;
            case "update":
            case "create":
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
export function buildConfiguration(projectionNames) {
    const result = new Configuration();
    result._projectionNames = projectionNames;
    return result;
}
