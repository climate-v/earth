import Backbone from 'backbone';
import * as _ from "underscore";
import * as d3 from 'd3';
import { colorAccordingToScale, COLORSCALES } from "../colorscales";

const TEMPLATE = `
<div class="menu-row">
    <div id="scale-label">Scale</div>
    <div class="multi-row-column">
        <div class="menu-content-row">
            <input id="bounds-min" type="number" class="menu-input" title="Bounds Minimum" value="<%= scaleBounds != null ? scaleBounds[0].toFixed(3) : '' %>" />
            <span style="padding-left: 5px; padding-right: 5px">-</span>
            <input id="bounds-max" type="number" class="menu-input" title="Bounds Maximum" value="<%= scaleBounds != null ? scaleBounds[1].toFixed(3) : '' %>" />
            <span style="padding-left: 10px; padding-right: 10px">|</span>
            <span id="select-linear" class="<%= (scaleType == 'linear' || scaleType == null ? '' : 'text-button') %>">Linear</span> - 
            <span id="select-log" class="<%= (scaleType === 'logarithmic' ? '' : 'text-button') %>">Log</span>
        </div>    
        <div class="menu-content-row">
            <canvas id="scale"></canvas>
        </div>
    </div>
</div>
<div class="menu-row">
    <div>Color Scale</div>
    <% for(let [i, scale] of scales.entries()) { %>
        <span data-name="<%= scale.name %>" class="display-scale <%= (colorScale == scale.name ? '' : 'text-button') %>"><%= scale.name %></span>
        <%= (i < scales.length - 1 ? " - " : "") %>
    <% } %>
</div>
`;

function scaleFuncFor(name, bounds) {
    let lowerBound = (bounds || [0, 0])[0];
    switch(name) {
        case "linear": return d3.scaleLinear()
        case "logarithmic": {
            if(lowerBound < 0.00001) {
                return d3.scaleSymlog();
            } else {
                return d3.scaleLog();
            }
        }
    }
}

export const ScaleConfigurationView = Backbone.View.extend({
    el: '#scale-config',
    template: _.template(TEMPLATE),
    data: {
        hover: () => {},
        colorBarScale: d3.scaleLinear(),
    },
    events: {
        'click span.display-scale': 'handleColorSelect',
        'click #select-linear': "useLinear",
        'click #select-log': "useLog",
        "change #bounds-min": "updateBoundsMin",
        "change #bounds-max": "updateBoundsMax",
        "mouseover #scale": "handleMouseOverScale"
    },
    initialize() {
        this.listenTo(this.model, "change:colorScale", this.render);
        this.listenTo(this.model, "change:scaleBounds", this.render);
        this.listenTo(this.model, "change:visualizationBounds", this.updateBounds);
    },
    handleColorSelect(ev) {
        const selectedScale = ev.target.dataset.name;
        if(selectedScale !== this.model.get("colorScale")) {
            this.model.set({ colorScale: selectedScale });
        }
    },
    handleMouseOverScale(ev) {
        const x = d3.pointer(ev, ev.target)[0];
        const pct = this.data.colorBarScale(x);
        let currentBounds = this.model.get("scaleBounds");
        if(currentBounds != null) {
            const value = this.model.get("scaleFunc").domain(currentBounds).invert(pct);
            this.data.hover(value);
        }
    },
    updateBoundsMin(ev) {
        const currentBounds = this.model.get("scaleBounds");
        const input = parseFloat(ev.target.value);
        if(Number.isNaN(input)) {
            this.$('#bounds-min').addClass("error");
        } else {
            this.$('#bounds-min').removeClass("error");
            const value = Math.min(input, currentBounds[1]);
            this.model.set({ scaleBounds: [value, currentBounds[1]] });
        }
    },
    updateBoundsMax(ev) {
        const currentBounds = this.model.get("scaleBounds");
        const input = parseFloat(ev.target.value);
        if(Number.isNaN(input)) {
            this.$('#bounds-max').addClass("error");
        } else {
            this.$('#bounds-max').removeClass("error");
            const value = Math.max(input, currentBounds[0]);
            this.model.set({ scaleBounds: [currentBounds[0], value] });
        }
    },
    currentScale() {
        return this.model.get("scaleType") || "linear";
    },
    useLinear() {
        this.switchToScaleFunc("linear");
    },
    useLog() {
        this.switchToScaleFunc("logarithmic");
    },
    switchToScaleFunc(name) {
        if(this.currentScale() !== name) {
            this.model.set({ scaleType: name, scaleFunc: scaleFuncFor(name, this.model.get("scaleBounds")) });
            this.render();
        }
    },
    updateBounds() {
        let visualizationBounds = this.model.get("visualizationBounds");
        if(visualizationBounds == null) {
            this.model.set({scaleBounds: null});
        } else {
            if(visualizationBounds[0] < 0.000001 && this.currentScale() === "logarithmic") {
                this.model.set({ scaleBounds: visualizationBounds, scaleFunc: scaleFuncFor("logarithmic", visualizationBounds) });
            } else {
                this.model.set({ scaleBounds: visualizationBounds });
            }
        }
    },
    render() {
        this.$el.html(this.template({
            scales: COLORSCALES,
            ...this.model.attributes
        }));

        const colorBar = this.$("#scale")[0];
        colorBar.height = colorBar.clientHeight;
        colorBar.width = colorBar.clientWidth;
        const g = colorBar.getContext("2d");
        const colorBarRange = d3.scaleLinear().domain([0, colorBar.width]);
        this.data.colorBarScale = colorBarRange;
        for(let i = 0; i <= colorBar.width; i++) {
            const rgb = colorAccordingToScale(this.model.get("colorScale"), colorBarRange(i), 1);
            g.fillStyle = "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";
            g.fillRect(i, 0, 1, colorBar.height);
        }
    },
    onHover(callback) {
        this.data.hover = callback
    }
});

export const ScaleModel = Backbone.Model.extend({
    defaults: {
        colorScale: "sinebow",
        scaleType: "linear",
        scaleFunc: d3.scaleLinear(),
        scaleBounds: null,
        visualizationBounds: [0, 100]
    },
    syncWith(configuration) {
        configuration.listenTo(this, "change:colorScale", () => {
            configuration.save({ colorScale: this.get("colorScale") });
        });

        configuration.listenTo(this, "change:scaleType", () => {
            configuration.save({ scale: this.get("scaleType") });
        });

        configuration.listenTo(this, "change:scaleBounds", () => {
            configuration.save({ bounds: this.get("scaleBounds") });
        });

        this.listenTo(configuration, "change:colorScale", () => {
            this.set({ colorScale: configuration.get("colorScale") });
        });

        this.listenTo(configuration, "change:scale", () => {
            this.set({ scaleType: configuration.get("scale") });
        });

        this.listenTo(configuration, "change:bounds", () => {
            this.set({ scaleBounds: configuration.get("bounds") });
        });
    }
});
