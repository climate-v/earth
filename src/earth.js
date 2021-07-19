/**
 * earth - a project to visualize global air data.
 *
 * Copyright (c) 2014 Cameron Beccario
 * The MIT License - http://opensource.org/licenses/MIT
 *
 * https://github.com/cambecc/earth
 */
import 'underscore'; // Import these atop here so that backbone has access to them
import 'jquery';

import Backbone from 'backbone';
import * as d3 from 'd3';
import * as topojson from "topojson-client";
import * as _ from 'underscore';
import { newLoggedAgent } from "./agents/agents";
import fileAgent, { downloadFile, loadFile } from "./agents/file-agent";
import metadataAgent, { buildMetadata } from "./agents/metadata-agent";
import gridAgent, { buildGrids } from "./agents/grid-agent";
import { createApi } from "./api";
import { buildConfiguration } from "./configuration";
import globes from "./globes";
import log from './log';
import { clamp, distance, spread } from "./math";
import µ from './micro';
import report from "./report";
import { DateView, HeightModel, HeightView, OverlayModel, OverlayView, TimeModel, TimeNavigationView } from "./ui";
import { getSurfaceIndexForUnit } from "./units";

const MAX_TASK_TIME = 100;                  // amount of time before a task yields control (millis)
const MIN_SLEEP_TIME = 25;                  // amount of time a task waits before resuming (millis)
const MIN_MOVE = 4;                         // slack before a drag operation beings (pixels)
const MOVE_END_WAIT = 1000;                 // time to wait for a move operation to be considered done (millis)

const OVERLAY_ALPHA = Math.floor(0.4 * 255);  // overlay transparency (on scale [0, 255])
const INTENSITY_SCALE_STEP = 10;            // step size of particle intensity color scale
const MAX_PARTICLE_AGE = 100;               // max number of frames a particle is drawn before regeneration
const PARTICLE_LINE_WIDTH = 1.0;            // line width of a drawn particle
const PARTICLE_MULTIPLIER = 7;              // particle count scalar (completely arbitrary--this values looks nice)
const PARTICLE_REDUCTION = 0.75;            // reduce particle count to this much of normal for mobile devices
const FRAME_RATE = 40;                      // desired milliseconds per frame

const NULL_WIND_VECTOR = [NaN, NaN, null];  // singleton for undefined location outside the vector field [u, v, mag]
const HOLE_VECTOR = [NaN, NaN, null];       // singleton that signifies a hole in the vector field
const TRANSPARENT_BLACK = [0, 0, 0, 0];     // singleton 0 rgba

let view = µ.view();

let api = null;

// Construct the page's main internal components:

const configuration = buildConfiguration(globes);  // holds the page's current configuration settings
const inputController = buildInputController();             // interprets drag/zoom operations
const meshAgent = newLoggedAgent();      // map data for the earth
const globeAgent = newLoggedAgent();     // the model of the globe
const rendererAgent = newLoggedAgent();  // the globe SVG renderer
const fieldAgent = newLoggedAgent();     // the interpolated wind vector field
const animatorAgent = newLoggedAgent();  // the wind animator
const overlayAgent = newLoggedAgent();   // color overlay over the animation
const heightModel = new HeightModel();
const heightView = new HeightView({ model: heightModel });
const timeModel = new TimeModel();
const timeView = new DateView({ model: timeModel });
const timeControlView = new TimeNavigationView({ model: timeModel });
const overlayModel = new OverlayModel();
const overlayView = new OverlayView({ model: overlayModel });
overlayView.render();
heightView.render();
timeView.render();
timeControlView.render();

/**
 * The input controller is an object that translates move operations (drag and/or zoom) into mutations of the
 * current globe's projection, and emits events so other page components can react to these move operations.
 *
 * D3's built-in Zoom behavior is used to bind to the document's drag/zoom events, and the input controller
 * interprets D3's events as move operations on the globe. This method is complicated due to the complex
 * event behavior that occurs during drag and zoom.
 *
 * D3 move operations usually occur as "zoomstart" -> ("zoom")* -> "zoomend" event chain. During "zoom" events
 * the scale and mouse may change, implying a zoom or drag operation accordingly. These operations are quite
 * noisy. What should otherwise be one smooth continuous zoom is usually comprised of several "zoomstart" ->
 * "zoom" -> "zoomend" event chains. A debouncer is used to eliminate the noise by waiting a short period of
 * time to ensure the user has finished the move operation.
 *
 * The "zoom" events may not occur; a simple click operation occurs as: "zoomstart" -> "zoomend". There is
 * additional logic for other corner cases, such as spurious drags which move the globe just a few pixels
 * (most likely unintentional), and the tendency for some touch devices to issue events out of order:
 * "zoom" -> "zoomstart" -> "zoomend".
 *
 * This object emits clean "moveStart" -> ("move")* -> "moveEnd" events for move operations, and "click" events
 * for normal clicks. Spurious moves emit no events.
 */
function buildInputController() {
    var globe, op = null;

    /**
     * @returns {Object} an object to represent the state for one move operation.
     */
    function newOp(startMouse, startScale) {
        return {
            type: "click",  // initially assumed to be a click operation
            startMouse: startMouse,
            startScale: startScale,
            manipulator: globe.manipulator(startMouse, startScale)
        };
    }

    let ignoreZoom = false; // TODO this is ugly and prevents first interaction

    const zoom = d3.zoom()
        .on("start", function(ev) {
            if(ignoreZoom) {
                return;
            }
            op = op || newOp(d3.pointer(ev, this), d3.zoomTransform(this).k);  // a new operation begins
        })
        .on("zoom", function(ev) {
            if(ignoreZoom) {
                return;
            }
            const currentMouse = d3.pointer(ev, this), currentScale = ev.transform.k;
            op = op || newOp(currentMouse, 1);  // Fix bug on some browsers where zoomstart fires out of order.
            if(op.type === "click" || op.type === "spurious") {
                const distanceMoved = distance(currentMouse, op.startMouse);
                if(currentScale === op.startScale && distanceMoved < MIN_MOVE) {
                    // to reduce annoyance, ignore op if mouse has barely moved and no zoom is occurring
                    op.type = distanceMoved > 0 ? "click" : "spurious";
                    return;
                }
                dispatch.trigger("moveStart");
                op.type = "drag";
            }
            if(currentScale !== op.startScale) {
                op.type = "zoom";  // whenever a scale change is detected, (stickily) switch to a zoom operation
            }

            // when zooming, ignore whatever the mouse is doing--really cleans up behavior on touch devices
            op.manipulator.move(op.type === "zoom" ? null : currentMouse, currentScale);
            dispatch.trigger("move");
        })
        .on("end", function() {
            if(ignoreZoom) {
                return;
            }

            op.manipulator.end();
            if(op.type === "click") {
                dispatch.trigger("click", op.startMouse, globe.projection.invert(op.startMouse) || []);
            } else if(op.type !== "spurious") {
                signalEnd();
            }
            op = null;  // the drag/zoom/click operation is over
        });

    const signalEnd = _.debounce(function() {
        if(!op || op.type !== "drag" && op.type !== "zoom") {
            configuration.save({ orientation: globe.orientation() }, { source: "moveEnd" });
            dispatch.trigger("moveEnd");
        }
    }, MOVE_END_WAIT);  // wait for a bit to decide if user has stopped moving the globe

    const display = d3.select("#display");
    display.call(zoom);
    d3.select("#show-location").on("click", function() {
        if(navigator.geolocation) {
            report.status("Finding current position...");
            navigator.geolocation.getCurrentPosition(function(pos) {
                report.status("");
                var coord = [pos.coords.longitude, pos.coords.latitude], rotate = globe.locate(coord);
                if(rotate) {
                    globe.projection.rotate(rotate);
                    configuration.save({ orientation: globe.orientation() });  // triggers reorientation
                }
                dispatch.trigger("click", globe.projection(coord), coord);
            }, log.error);
        }
    });

    function reorient() {
        const options = arguments[3] || {};
        if(!globe || options.source === "moveEnd") {
            // reorientation occurred because the user just finished a move operation, so globe is already
            // oriented correctly.
            return;
        }
        dispatch.trigger("moveStart");
        globe.orientation(configuration.get("orientation"), view);
        ignoreZoom = true;
        zoom.scaleTo(display, globe.projection.scale());
        ignoreZoom = false;
        dispatch.trigger("moveEnd");
    }

    const dispatch = _.extend({
        globe: function(_) {
            if(_) {
                globe = _;
                zoom.scaleExtent(globe.scaleExtent());
                reorient();
            }
            return _ ? this : globe;
        }
    }, Backbone.Events);
    return dispatch.listenTo(configuration, "change:orientation", reorient);
}

/**
 * @param resource the GeoJSON resource's URL
 * @returns {Object} a promise for GeoJSON topology features: {boundaryLo:, boundaryHi:}
 */
function buildMesh(resource) {
    const cancel = this.cancel;
    report.status("Downloading...");
    return µ.loadJson(resource).then(function(topo) {
        if(cancel.requested) return null;
        log.time("building meshes");
        const o = topo.objects;
        const coastLo = topojson.feature(topo, µ.isMobile() ? o.coastline_tiny : o.coastline_110m);
        const coastHi = topojson.feature(topo, µ.isMobile() ? o.coastline_110m : o.coastline_50m);
        const lakesLo = topojson.feature(topo, µ.isMobile() ? o.lakes_tiny : o.lakes_110m);
        const lakesHi = topojson.feature(topo, µ.isMobile() ? o.lakes_110m : o.lakes_50m);
        log.timeEnd("building meshes");
        return {
            coastLo: coastLo,
            coastHi: coastHi,
            lakesLo: lakesLo,
            lakesHi: lakesHi
        };
    });
}

/**
 * @param {String} projectionName the desired projection's name.
 * @returns {Object} a promise for a globe object.
 */
function buildGlobe(projectionName) {
    const builder = globes.get(projectionName);
    if(!builder) {
        return Promise.reject("Unknown projection: " + projectionName);
    }
    return Promise.resolve().then(() => builder(view));
}

function buildRenderer(mesh, globe) {
    if(!mesh || !globe) return null;

    report.status("Rendering Globe...");
    log.time("rendering map");

    // UNDONE: better way to do the following?
    const dispatch = _.clone(Backbone.Events);
    if(rendererAgent._previous) {
        rendererAgent._previous.stopListening();
    }
    rendererAgent._previous = dispatch;

    // First clear map and foreground svg contents.
    µ.removeChildren(d3.select("#map").node());
    µ.removeChildren(d3.select("#foreground").node());
    // Create new map svg elements.
    globe.defineMap(d3.select("#map"), d3.select("#foreground"));

    const path = d3.geoPath(globe.projection).pointRadius(7);
    const coastline = d3.select(".coastline");
    const lakes = d3.select(".lakes");
    d3.selectAll("path").attr("d", path);  // do an initial draw -- fixes issue with safari

    function drawLocationMark(point, coord) {
        // show the location on the map if defined
        if(fieldAgent.value() && !fieldAgent.value().isInsideBoundary(point[0], point[1])) {
            // UNDONE: Sometimes this is invoked on an old, released field, because new one has not been
            //         built yet, causing the mark to not get drawn.
            return;  // outside the field boundary, so ignore.
        }
        if(coord && _.isFinite(coord[0]) && _.isFinite(coord[1])) {
            let mark = d3.select(".location-mark");
            if(!mark.node()) {
                mark = d3.select("#foreground").append("path").attr("class", "location-mark");
            }
            mark.datum({ type: "Point", coordinates: coord }).attr("d", path);
        }
    }

    // Draw the location mark if one is currently visible.
    if(activeLocation.point && activeLocation.coord) {
        drawLocationMark(activeLocation.point, activeLocation.coord);
    }

    // Throttled draw method helps with slow devices that would get overwhelmed by too many redraw events.
    const REDRAW_WAIT = 5;  // milliseconds
    let doDraw_throttled = _.throttle(doDraw, REDRAW_WAIT, { leading: false });

    function doDraw() {
        d3.selectAll("path").attr("d", path);
        rendererAgent.trigger("redraw");
        doDraw_throttled = _.throttle(doDraw, REDRAW_WAIT, { leading: false });
    }

    // Attach to map rendering events on input controller.
    dispatch.listenTo(
        inputController, {
            moveStart: function() {
                coastline.datum(mesh.coastLo);
                lakes.datum(mesh.lakesLo);
                rendererAgent.trigger("start");
            },
            move: function() {
                doDraw_throttled();
            },
            moveEnd: function() {
                coastline.datum(mesh.coastHi);
                lakes.datum(mesh.lakesHi);
                d3.selectAll("path").attr("d", path);
                rendererAgent.trigger("render");
            },
            click: drawLocationMark
        });

    // Finally, inject the globe model into the input controller. Do it on the next event turn to ensure
    // renderer is fully set up before events start flowing.
    Promise.resolve().then(function() {
        inputController.globe(globe);
    });

    log.timeEnd("rendering map");
    return "ready";
}

function createMask(globe) {
    if(!globe) return null;

    log.time("render mask");

    // Create a detached canvas, ask the model to define the mask polygon, then fill with an opaque color.
    var width = view.width, height = view.height;
    var canvas = d3.select(document.createElement("canvas")).attr("width", width).attr("height", height).node();
    var context = globe.defineMask(canvas.getContext("2d"));
    context.fillStyle = "rgba(255, 0, 0, 1)";
    context.fill();
    // d3.select("#display").node().appendChild(canvas);  // make mask visible for debugging

    var imageData = context.getImageData(0, 0, width, height);
    var data = imageData.data;  // layout: [r, g, b, a, r, g, b, a, ...]
    log.timeEnd("render mask");
    return {
        imageData: imageData,
        isVisible: function(x, y) {
            const i = (y * width + x) * 4;
            return data[i + 3] > 0;  // non-zero alpha means pixel is visible
        },
        set: function(x, y, rgba) {
            const i = (y * width + x) * 4;
            data[i] = rgba[0];
            data[i + 1] = rgba[1];
            data[i + 2] = rgba[2];
            data[i + 3] = rgba[3];
            return this;
        }
    };
}

function createField(columns, bounds, mask) {

    /**
     * @returns {Array} wind vector [u, v, magnitude] at the point (x, y), or [NaN, NaN, null] if wind
     *          is undefined at that point.
     */
    function field(x, y) {
        const column = columns[Math.round(x)];
        return column && column[Math.round(y)] || NULL_WIND_VECTOR;
    }

    /**
     * @returns {boolean} true if the field is valid at the point (x, y)
     */
    field.isDefined = function(x, y) {
        return field(x, y)[2] !== null;
    };

    /**
     * @returns {boolean} true if the point (x, y) lies inside the outer boundary of the vector field, even if
     *          the vector field has a hole (is undefined) at that point, such as at an island in a field of
     *          ocean currents.
     */
    field.isInsideBoundary = function(x, y) {
        return field(x, y) !== NULL_WIND_VECTOR;
    };

    // Frees the massive "columns" array for GC. Without this, the array is leaked (in Chrome) each time a new
    // field is interpolated because the field closure's context is leaked, for reasons that defy explanation.
    field.release = function() {
        columns = [];
    };

    field.randomize = function(o) {  // UNDONE: this method is terrible
        let x, y;
        let safetyNet = 0;
        do {
            x = Math.round(_.random(bounds.x, bounds.xMax));
            y = Math.round(_.random(bounds.y, bounds.yMax));
        } while(!field.isDefined(x, y) && safetyNet++ < 30);
        o.x = x;
        o.y = y;
        return o;
    };

    field.overlay = mask.imageData;

    return field;
}

/**
 * Calculate distortion of the wind vector caused by the shape of the projection at point (x, y). The wind
 * vector is modified in place and returned by this function.
 */
function distort(projection, λ, φ, x, y, scale, wind) {
    var u = wind[0] * scale;
    var v = wind[1] * scale;
    var d = µ.distortion(projection, λ, φ, x, y);

    // Scale distortion vectors by u and v, then add.
    wind[0] = d[0] * u + d[2] * v;
    wind[1] = d[1] * u + d[3] * v;
    return wind;
}

function interpolateField(globe, grids) {
    if(!globe || !grids) return null;

    const mask = createMask(globe);
    const primaryGrid = grids.primaryGrid;
    const overlayGrid = grids.overlayGrid;

    const hasDistinctOverlay = grids.hasOverlay();
    const hasVectorField = grids.hasVectorField();
    const scale = grids.scale;

    log.time("interpolating field");
    const cancel = this.cancel;

    const projection = globe.projection;
    const bounds = globe.bounds(view);
    // How fast particles move on the screen (arbitrary value chosen for aesthetics).
    const velocityScale = bounds.height * (hasVectorField ? primaryGrid.particles.velocityScale : 1);

    const columns = [];
    let x = bounds.x;

    function interpolateColumn(x) {
        const column = [];
        for(let y = bounds.y; y <= bounds.yMax; y += 2) {
            if(mask.isVisible(x, y)) {
                const point = [x, y];
                const coord = projection.invert(point);
                let color = TRANSPARENT_BLACK;
                let wind = null;
                if(coord) {
                    const λ = coord[0], φ = coord[1];
                    if(isFinite(λ) && primaryGrid != null) {
                        const primaryValues = primaryGrid.interpolate(λ, φ);
                        let scalar = null;
                        if(Array.isArray(primaryValues)) {
                            wind = distort(projection, λ, φ, x, y, velocityScale, primaryValues);
                            scalar = wind[2];
                        } else {
                            scalar = primaryValues;
                        }

                        if(hasDistinctOverlay) {
                            scalar = overlayGrid.interpolate(λ, φ);
                        }

                        if(µ.isValue(scalar)) {
                            color = scale.gradient(scalar, OVERLAY_ALPHA);
                        }
                    }
                }
                column[y + 1] = column[y] = wind || HOLE_VECTOR;
                mask.set(x, y, color).set(x + 1, y, color).set(x, y + 1, color).set(x + 1, y + 1, color);
            }
        }
        columns[x + 1] = columns[x] = column;
    }

    report.status("");

    return new Promise((resolve, reject) => {
        (function batchInterpolate() {
            try {
                if(!cancel.requested) {
                    var start = Date.now();
                    while(x < bounds.xMax) {
                        interpolateColumn(x);
                        x += 2;
                        if((Date.now() - start) > MAX_TASK_TIME) {
                            // Interpolation is taking too long. Schedule the next batch for later and yield.
                            report.progress((x - bounds.x) / (bounds.xMax - bounds.x));
                            setTimeout(batchInterpolate, MIN_SLEEP_TIME);
                            return;
                        }
                    }
                }
                resolve(createField(columns, bounds, mask));
            } catch(e) {
                reject(e);
            }
            report.progress(1);  // 100% complete
            log.timeEnd("interpolating field");
        })();
    });
}

function animate(globe, field, grids) {
    if(!globe || !field || !grids || !grids.hasVectorField()) return;

    var cancel = this.cancel;
    var bounds = globe.bounds(view);
    // maxIntensity is the velocity at which particle color intensity is maximum
    var colorStyles = µ.windIntensityColorScale(INTENSITY_SCALE_STEP, grids.primaryGrid.particles.maxIntensity);
    var buckets = colorStyles.map(function() {
        return [];
    });
    var particleCount = Math.round(bounds.width * PARTICLE_MULTIPLIER);
    if(µ.isMobile()) {
        particleCount *= PARTICLE_REDUCTION;
    }
    var fadeFillStyle = µ.isFF() ? "rgba(0, 0, 0, 0.95)" : "rgba(0, 0, 0, 0.97)";  // FF Mac alpha behaves oddly

    log.debug("particle count: " + particleCount);
    const particles = [];
    for(let i = 0; i < particleCount; i++) {
        particles.push(field.randomize({ age: _.random(0, MAX_PARTICLE_AGE) }));
    }

    function evolve() {
        buckets.forEach(function(bucket) {
            bucket.length = 0;
        });
        particles.forEach(function(particle) {
            if(particle.age > MAX_PARTICLE_AGE) {
                field.randomize(particle).age = 0;
            }
            var x = particle.x;
            var y = particle.y;
            var v = field(x, y);  // vector at current position
            var m = v[2];
            if(m === null) {
                particle.age = MAX_PARTICLE_AGE;  // particle has escaped the grid, never to return...
            } else {
                var xt = x + v[0];
                var yt = y + v[1];
                if(field.isDefined(xt, yt)) {
                    // Path from (x,y) to (xt,yt) is visible, so add this particle to the appropriate draw bucket.
                    particle.xt = xt;
                    particle.yt = yt;
                    buckets[colorStyles.indexFor(m)].push(particle);
                } else {
                    // Particle isn't visible, but it still moves through the field.
                    particle.x = xt;
                    particle.y = yt;
                }
            }
            particle.age += 1;
        });
    }

    const g = d3.select("#animation").node().getContext("2d");
    g.lineWidth = PARTICLE_LINE_WIDTH;
    g.fillStyle = fadeFillStyle;

    function draw() {
        // Fade existing particle trails.
        const prev = g.globalCompositeOperation;
        g.globalCompositeOperation = "destination-in";
        g.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
        g.globalCompositeOperation = prev;

        // Draw new particle trails.
        buckets.forEach(function(bucket, i) {
            if(bucket.length > 0) {
                g.beginPath();
                g.strokeStyle = colorStyles[i];
                bucket.forEach(function(particle) {
                    g.moveTo(particle.x, particle.y);
                    g.lineTo(particle.xt, particle.yt);
                    particle.x = particle.xt;
                    particle.y = particle.yt;
                });
                g.stroke();
            }
        });
    }

    (function frame() {
        try {
            if(cancel.requested) {
                field.release();
                return;
            }
            evolve();
            draw();
            setTimeout(frame, FRAME_RATE);
        } catch(e) {
            report.error(e);
        }
    })();
}

function drawGridPoints(ctx, grid, globe) {
    if(!grid || !globe || !configuration.get("showGridPoints")) return;

    ctx.fillStyle = "rgba(255, 255, 255, 1)";
    // Use the clipping behavior of a projection stream to quickly draw visible points.
    var stream = globe.projection.stream({
        point: function(x, y) {
            ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
        }
    });
    grid.forEachPoint(function(λ, φ, d) {
        if(µ.isValue(d)) {
            stream.point(λ, φ);
        }
    });
}

function drawOverlay(field, overlayType) {
    if(!field) return;

    const ctx = d3.select("#overlay").node().getContext("2d");
    const grids = gridAgent.value();
    const grid = grids.overlayGrid || grids.primaryGrid;

    µ.clearCanvas(d3.select("#overlay").node());
    µ.clearCanvas(d3.select("#scale").node());
    if(overlayType) {
        if(overlayType !== "off") {
            ctx.putImageData(field.overlay, 0, 0);
        }
        drawGridPoints(ctx, grids.overlayGrid, globeAgent.value());
    }

    if(grid) {
        // Draw color bar for reference.
        var colorBar = d3.select("#scale"), scale = grid.scale, bounds = scale.bounds;
        var c = colorBar.node(), g = c.getContext("2d"), n = c.width - 1;
        for(let i = 0; i <= n; i++) {
            const rgb = scale.gradient(spread(i / n, bounds[0], bounds[1]), 1);
            g.fillStyle = "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";
            g.fillRect(i, 0, 1, c.height);
        }

        // Show tooltip on hover.
        colorBar.on("mousemove", function(ev) {
            var x = d3.pointer(ev, this)[0];
            var pct = clamp((Math.round(x) - 2) / (n - 2), 0, 1);
            var value = spread(pct, bounds[0], bounds[1]);
            var elementId = grid.type === "wind" ? "#location-wind-units" : "#location-value-units";
            var units = createUnitToggle(elementId, grid).value();
            colorBar.attr("title", µ.formatScalar(value, units) + " " + units.label);
        });
    }
}

/**
 * Display the grids' types in the menu.
 */
function showGridDetails(grids) {
    const metadata = metadataAgent.value();
    const mainTitle = metadata.title;
    const center = metadata.centerName;
    let description = "";
    if(grids && grids.primaryGrid) {
        var langCode = d3.select("body").attr("data-lang") || "en";
        const pd = grids.primaryGrid.description(langCode)
        description = mainTitle + pd.qualifier;
        if(grids.hasOverlay()) {
            const od = grids.overlayGrid.description(langCode);
            description += " + " + od.qualifier;
        }
    }
    d3.select("#data-layer").text(description);
    d3.select("#data-center").text(center);
}

/**
 * Constructs a toggler for the specified product's units, storing the toggle state on the element having
 * the specified id. For example, given a product having units ["m/s", "mph"], the object returned by this
 * method sets the element's "data-index" attribute to 0 for m/s and 1 for mph. Calling value() returns the
 * currently active units object. Calling next() increments the index.
 */
function createUnitToggle(id, product) {
    var units = product.units, size = units.length;
    var index = +(d3.select(id).attr("data-index") || 0) % size;
    return {
        value: function() {
            return units[index];
        },
        next: function() {
            d3.select(id).attr("data-index", index = ((index + 1) % size));
        }
    };
}

/**
 * Display the specified wind value. Allow toggling between the different types of wind units.
 */
function showWindAtLocation(wind, product) {
    var unitToggle = createUnitToggle("#location-wind-units", product), units = unitToggle.value();
    d3.select("#location-wind").text(µ.formatVector(wind, units));
    d3.select("#location-wind-units").text(units.label).on("click", function() {
        unitToggle.next();
        showWindAtLocation(wind, product);
    });
}

/**
 * Display the specified overlay value. Allow toggling between the different types of supported units.
 */
function showOverlayValueAtLocation(value, product) {
    var unitToggle = createUnitToggle("#location-value-units", product), units = unitToggle.value();
    d3.select("#location-value").text(µ.formatScalar(value, units));
    d3.select("#location-value-units").text(units.label).on("click", function() {
        unitToggle.next();
        showOverlayValueAtLocation(value, product);
    });
}

// Stores the point and coordinate of the currently visible location. This is used to update the location
// details when the field changes.
var activeLocation = {};

/**
 * Display a local data callout at the given [x, y] point and its corresponding [lon, lat] coordinates.
 * The location may not be valid, in which case no callout is displayed. Display location data for both
 * the primary grid and overlay grid, performing interpolation when necessary.
 */
function showLocationDetails(point, coord) {
    point = point || [];
    coord = coord || [];
    const grids = gridAgent.value(), field = fieldAgent.value(), λ = coord[0], φ = coord[1];
    if(!field || !field.isInsideBoundary(point[0], point[1])) {
        return;
    }

    clearLocationDetails(false);  // clean the slate
    activeLocation = { point: point, coord: coord };  // remember where the current location is

    if(_.isFinite(λ) && _.isFinite(φ)) {
        d3.select("#location-coord").text(µ.formatCoordinates(λ, φ));
        d3.select("#location-close").classed("invisible", false);
    }

    if(grids && grids.primaryGrid) {
        if(grids.hasVectorField()) {
            if(field.isDefined(point[0], point[1])) {
                const wind = grids.primaryGrid.interpolate(λ, φ);
                if(µ.isValue(wind)) {
                    showWindAtLocation(wind, grids.primaryGrid);
                }
            }
        } else {
            const value = grids.primaryGrid.interpolate(λ, φ);
            showOverlayValueAtLocation(value, grids.primaryGrid);
        }

        if(grids.hasOverlay()) {
            const value = grids.overlayGrid.interpolate(λ, φ);
            if(µ.isValue(value)) {
                showOverlayValueAtLocation(value, grids.overlayGrid);
            }
        }
    }
}

function updateLocationDetails() {
    showLocationDetails(activeLocation.point, activeLocation.coord);
}

function clearLocationDetails(clearEverything) {
    d3.select("#location-coord").text("");
    d3.select("#location-close").classed("invisible", true);
    d3.select("#location-wind").text("");
    d3.select("#location-wind-units").text("");
    d3.select("#location-value").text("");
    d3.select("#location-value-units").text("");
    if(clearEverything) {
        activeLocation = {};
        d3.select(".location-mark").remove();
    }
}

function stopCurrentAnimation(alsoClearCanvas) {
    animatorAgent.cancel();
    if(alsoClearCanvas) {
        µ.clearCanvas(d3.select("#animation").node());
    }
}

/**
 * Registers a click event handler for the specified DOM element which modifies the configuration to have
 * the attributes represented by newAttr. An event listener is also registered for configuration change events,
 * so when a change occurs the button becomes highlighted (i.e., class ".highlighted" is assigned or removed) if
 * the configuration matches the attributes for this button. The set of attributes used for the matching is taken
 * from newAttr, unless a custom set of keys is provided.
 */
function bindButtonToConfiguration(elementId, newAttr, keys) {
    keys = keys || _.keys(newAttr);
    d3.select(elementId).on("click", function() {
        if(d3.select(elementId).classed("disabled")) return;
        configuration.save(newAttr);
    });
    configuration.on("change", function(model) {
        const attr = model.attributes;
        d3.select(elementId).classed("highlighted", _.isEqual(_.pick(attr, keys), _.pick(newAttr, keys)));
    });
}

function isUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch(e) {
        return false;
    }
}

function collectAllFilesFromDrop(dropEvent) {
    const allFiles = [];

    if(dropEvent.dataTransfer.items) {
        for(let i = 0; i < dropEvent.dataTransfer.items.length; i++) {
            const item = dropEvent.dataTransfer.items[i];
            if(item.kind === 'file') {
                const file = item.getAsFile();
                allFiles.push(file);
            } else if(item.kind === 'string' && item.type === 'text/uri-list') {
                allFiles.push(new Promise(resolve => {
                    item.getAsString(resolve);
                }));
            } else if(item.kind === 'string' && item.type === 'text/plain') {
                let urlCheck = new Promise(resolve => {
                    item.getAsString(resolve);
                }).then(urlCandidate => {
                    if(isUrl(urlCandidate)) {
                        return urlCandidate;
                    } else {
                        return null;
                    }
                });
                allFiles.push(urlCheck);
            }
        }
    } else {
        for(let i = 0; i < dropEvent.dataTransfer.files.length; i++) {
            allFiles.push(dropEvent.dataTransfer.files[i]);
        }
    }

    // We need to do a non-null filter because of the URL check
    // and we also filter for duplicates because dropping a URL can result in multiple
    // dataTransfer items, e.g. one with text/plain and one with text/uri-list.
    return Promise.all(allFiles)
        .then(results => results.filter(elem => elem != null))
        .then(results => [...new Set(results)]);
}

/**
 * Registers all event handlers to bind components and page elements together. There must be a cleaner
 * way to accomplish this...
 */
function init() {
    report.status("Initializing...");

    const display = document.getElementById("display");
    display.addEventListener("dragover", (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
    });

    display.addEventListener("drop", async (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        const allFiles = await collectAllFilesFromDrop(ev);

        if(allFiles.length > 1) {
            report.error("Too many files dropped, please only drop one.");
            return;
        }

        if(allFiles.length === 1) {
            const file = allFiles[0];
            if(typeof file === 'string') {
                configuration.save({ file });
            } else {
                if(!file.name.endsWith(".nc")) {
                    report.error("Did not detect a NetCDF file.");
                    return;
                }

                fileAgent.submit(loadFile, api, file);
            }
        }
    });

    d3.select("#sponsor-hide").on("click", function() {
        d3.select("#sponsor").classed("invisible", true);
    });

    d3.selectAll(".fill-screen").attr("width", view.width).attr("height", view.height);
    // Adjust size of the scale canvas to fill the width of the menu to the right of the label.
    const label = d3.select("#scale-label").node();
    d3.select("#scale")
        .attr("width", (d3.select("#menu").node().offsetWidth - label.offsetWidth) * 0.97)
        .attr("height", label.offsetHeight / 2);

    d3.select("#show-menu").on("click", function() {
        if(µ.isEmbeddedInIFrame()) {
            window.open("http://earth.nullschool.net/" + window.location.hash, "_blank");
        } else {
            d3.select("#menu").classed("invisible", !d3.select("#menu").classed("invisible"));
        }
    });

    if(µ.isFF()) {
        // Workaround FF performance issue of slow click behavior on map having thick coastlines.
        d3.select("#display").classed("firefox", true);
    }

    // Tweak document to distinguish CSS styling between touch and non-touch environments. Hacky hack.
    if("ontouchstart" in document.documentElement) {
        d3.select(document).on("touchstart", function() {
        });  // this hack enables :active pseudoclass
    } else {
        d3.select(document.documentElement).classed("no-touch", true);  // to filter styles problematic for touch
    }

    // Bind configuration to URL bar changes.
    window.addEventListener("hashchange", function() {
        log.debug("hashchange");
        configuration.fetch({ trigger: "hashchange" });
    });

    configuration.on("change", report.reset);

    meshAgent.listenTo(configuration, "change:topology", function(context, attr) {
        meshAgent.submit(buildMesh, attr);
    });

    globeAgent.listenTo(configuration, "change:projection", function(source, attr) {
        globeAgent.submit(buildGlobe, attr);
    });

    fileAgent.listenTo(configuration, "change:file", (source, attr) => {
        if(attr != null && attr !== "") {
            fileAgent.submit(downloadFile, api, attr);
        }
    });

    configuration.listenTo(metadataAgent, "update", () => {
        const heightValues = metadataAgent.value().dimensions.levitation.values;
        const unit = metadataAgent.value().dimensions.levitation.unit;
        let indexToUse = getSurfaceIndexForUnit(heightValues, unit);
        const currentHeightIndex = configuration.get("heightIndex");
        if(currentHeightIndex != null) {
            if(currentHeightIndex >= heightValues.length) {
                log.info("Resetting height index, since it does not exist in loaded file.");
                configuration.save({ heightIndex: indexToUse });
            }
        }

        const timeValues = metadataAgent.value().dimensions.time.values;
        const currentTimeIndex = configuration.get("timeIndex");
        let indexToSelect = 0;
        if(currentTimeIndex != null) {
            if(currentTimeIndex >= timeValues.length) {
                log.info("Resetting time index, since it does not exist in loaded file.");
                configuration.save({ timeIndex: indexToSelect });
            }
        }

        const overlays = metadataAgent.value().availableOverlays;
        const selectedOverlay = configuration.get("overlayType");
        if(!overlays.some(overlay => overlay.id === selectedOverlay)) {
            configuration.save({ overlayType: 'off' });
        }
    });

    configuration.listenTo(fileAgent, "update", (_, agent) => {
        const value = agent.value();
        if(value.source.type === "local") {
            configuration.save({ file: null });
        } else {
            configuration.save({ file: value.source.path });
        }
    });

    heightModel.listenTo(metadataAgent, "update", () => {
        const values = metadataAgent.value().dimensions.levitation.values;
        const unit = metadataAgent.value().dimensions.levitation.unit;
        const direction = metadataAgent.value().dimensions.levitation.direction;

        heightModel.set({
            values,
            unit,
            direction
        });
    });

    timeModel.listenTo(metadataAgent, "update", () => {
        const values = metadataAgent.value().dimensions.time.values;
        timeModel.set({ values });
    });

    configuration.listenTo(heightModel, "change:selected", () => {
        const currentConfigurationValue = configuration.get("heightIndex");
        const newHeightIndex = heightModel.get("selected");
        if(currentConfigurationValue !== newHeightIndex) {
            configuration.save({ heightIndex: newHeightIndex });
        }
    });

    heightModel.listenTo(configuration, "change:heightIndex", () => {
        heightModel.set({
            selected: configuration.get("heightIndex")
        });
    });

    configuration.listenTo(timeModel, "change:selected", () => {
        const currentConfigurationValue = configuration.get("timeIndex");
        const newTimeIndex = timeModel.get("selected");
        if(currentConfigurationValue !== newTimeIndex) {
            configuration.save({ timeIndex: timeModel.get("selected") });
        }
    });

    timeModel.listenTo(configuration, "change:timeIndex", () => {
        timeModel.set({
            selected: configuration.get("timeIndex")
        });
    });

    overlayModel.listenTo(metadataAgent, "update", () => {
        overlayModel.set({ overlays: metadataAgent.value().availableOverlays });
    });

    overlayModel.listenTo(configuration, "change:overlayType", () => {
        overlayModel.set({ currentOverlay: configuration.get("overlayType") });
    });

    configuration.listenTo(overlayModel, "change:currentOverlay", () => {
        configuration.save({ overlayType: overlayModel.get("currentOverlay") });
    });

    metadataAgent.listenTo(fileAgent, "update", () => {
        stopCurrentAnimation(true);
        metadataAgent.submit(buildMetadata, api);
    });

    gridAgent.listenTo(metadataAgent, "update", () => {
        gridAgent.submit(buildGrids, configuration, api);
    });

    gridAgent.listenTo(configuration, "change", function() {
        const changed = _.keys(configuration.changedAttributes());
        // Ignore building grid for now if we don't have a file yet or if the file got changed (and needs redownloading)
        if(changed.includes("file") || fileAgent.value() == null) {
            return;
        }
        let rebuildRequired = false;

        // Build a new grid if any layer-related attributes have changed.
        if(_.intersection(changed, ["timeIndex", "param", "heightIndex", "levitation", "u", "v"]).length > 0) {
            rebuildRequired = true;
        }
        // Build a new grid if the new overlay type is different from the current one.
        const overlayType = configuration.get("overlayType") || "default";
        if(changed.includes("overlayType") && overlayType !== "off") {
            const grids = (gridAgent.value() || {}), primary = grids.primaryGrid, overlay = grids.overlayGrid;
            if(!overlay) {
                // Do a rebuild if we have no overlay grid.
                rebuildRequired = true;
            } else if(overlay.type !== overlayType && !(overlayType === "default" && primary === overlay)) {
                // Do a rebuild if the types are different.
                rebuildRequired = true;
            }
        }

        if(rebuildRequired) {
            gridAgent.submit(buildGrids, configuration, api);
        }
    });
    gridAgent.on("submit", function() {
        showGridDetails(null);
    });
    gridAgent.on("update", function(grids) {
        showGridDetails(grids);
    });

    function startRendering() {
        rendererAgent.submit(buildRenderer, meshAgent.value(), globeAgent.value());
    }

    rendererAgent.listenTo(meshAgent, "update", startRendering);
    rendererAgent.listenTo(globeAgent, "update", startRendering);

    function startInterpolation() {
        fieldAgent.submit(interpolateField, globeAgent.value(), gridAgent.value());
    }

    function cancelInterpolation() {
        fieldAgent.cancel();
    }

    fieldAgent.listenTo(gridAgent, "update", startInterpolation);
    fieldAgent.listenTo(rendererAgent, "render", startInterpolation);
    fieldAgent.listenTo(rendererAgent, "start", cancelInterpolation);
    fieldAgent.listenTo(rendererAgent, "redraw", cancelInterpolation);

    animatorAgent.listenTo(fieldAgent, "update", function(field) {
        animatorAgent.submit(animate, globeAgent.value(), field, gridAgent.value());
    });
    animatorAgent.listenTo(rendererAgent, "start", stopCurrentAnimation.bind(null, true));
    animatorAgent.listenTo(gridAgent, "submit", stopCurrentAnimation.bind(null, false));
    animatorAgent.listenTo(fieldAgent, "submit", stopCurrentAnimation.bind(null, false));

    overlayAgent.listenTo(fieldAgent, "update", function() {
        overlayAgent.submit(drawOverlay, fieldAgent.value(), configuration.get("overlayType"));
    });
    overlayAgent.listenTo(rendererAgent, "start", function() {
        overlayAgent.submit(drawOverlay, fieldAgent.value(), null);
    });
    overlayAgent.listenTo(configuration, "change", function() {
        var changed = _.keys(configuration.changedAttributes())
        // if only overlay relevant flags have changed...
        if(_.intersection(changed, ["overlayType", "showGridPoints"]).length > 0) {
            overlayAgent.submit(drawOverlay, fieldAgent.value(), configuration.get("overlayType"));
        }
    });

    // Add event handlers for showing, updating, and removing location details.
    inputController.on("click", showLocationDetails);
    fieldAgent.on("update", updateLocationDetails);
    d3.select("#location-close").on("click", _.partial(clearLocationDetails, true));

    // Add handlers for mode buttons.
    d3.select("#wind-mode-enable").on("click", function() {
        if(configuration.get("param") !== "wind") {
            configuration.save({ param: "wind", surface: "surface", level: "level", overlayType: "default" });
        }
    });
    configuration.on("change:param", function(x, param) {
        d3.select("#wind-mode-enable").classed("highlighted", param === "wind");
    });
    d3.select("#ocean-mode-enable").on("click", function() {
        if(configuration.get("param") !== "ocean") {
            // When switching between modes, there may be no associated data for the current date. So we need
            // find the closest available according to the catalog. This is not necessary if date is "current".
            // UNDONE: this code is annoying. should be easier to get date for closest ocean product.
            var ocean = { param: "ocean", surface: "surface", level: "currents", overlayType: "default" };
            var attr = _.clone(configuration.attributes);
            if(attr.date === "current") {
                configuration.save(ocean);
            } else {
                try {
                    // This is broken due to not having the date in the header anymore
                    // if we need this again, this needs to be adapted to that change
                    // const matchedProducts = products.productsFor(_.extend(attr, ocean));
                    // const firstProduct = matchedProducts[0];
                    // if(firstProduct.date) {
                    //     configuration.save(_.extend(ocean, dateToConfig(firstProduct.date)));
                    // }
                } catch(ex) {
                    report.error(ex);
                }
            }
            stopCurrentAnimation(true);  // cleanup particle artifacts over continents
        }
    });
    configuration.on("change:param", function(x, param) {
        d3.select("#ocean-mode-enable").classed("highlighted", param === "ocean");
    });

    d3.select("#option-show-grid").on("click", function() {
        configuration.save({ showGridPoints: !configuration.get("showGridPoints") });
    });
    configuration.on("change:showGridPoints", function(x, showGridPoints) {
        d3.select("#option-show-grid").classed("highlighted", showGridPoints);
    });

    // Add handlers for ocean animation types.
    bindButtonToConfiguration("#animate-currents", { param: "ocean", surface: "surface", level: "currents" });

    // Add handlers for all projection buttons.
    for(let projection of globes.keys()) {
        bindButtonToConfiguration("#" + projection, { projection: projection, orientation: "" }, ["projection"]);
    }

    // When touch device changes between portrait and landscape, rebuild globe using the new view size.
    d3.select(window).on("orientationchange", function() {
        view = µ.view();
        globeAgent.submit(buildGlobe, configuration.get("projection"));
    });

    d3.select(window).on("resize", () => {
        view = µ.view();
        globeAgent.submit(buildGlobe, configuration.get("projection"));
        d3.selectAll(".fill-screen").attr("width", view.width).attr("height", view.height);
    });
}

function start(createdApi) {
    // Everything is now set up, so load configuration from the hash fragment and kick off change events.
    api = createdApi;
    configuration.fetch();
}

Promise.resolve().then(init).then(createApi).then(start).catch(report.error);

window.addEventListener("unload", () => {
    const currentFile = fileAgent.value();
    if(currentFile != null) {
        currentFile.file.close();
    }
});
