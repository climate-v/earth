import Backbone from 'backbone';
import { floatToDate, toLocalISO, toUTCISO } from "./date";
import * as _ from 'underscore';
import { getSurfaceIndexForUnit } from "./units";

const DefaultHeightTemplate = `
 - hPa
`;

const DistinctHeightTemplate = `
    <span class="surface text-button" id="surface-level" title="Surface">Sfc</span>
    <% _.each(values, (value, index) => { %>
     – <span class="surface text-button height-selector <%= (selected === index ? 'highlighted' : '') %>" data-index="<%= index %>"><%= value %></span>
    <% }); %> hPa
`;

const GenericHeightTemplate = `
    <input style="width: 50%" type="range" min="0" max="<%= values.length - 1 %>" value="<%= selected %>" class="slider" id="heightValueSlider" />
    <%= values[selected] %> <%= unit %>
`;

function shouldRenderDistinct(model) {
    return model.attributes.values.length <= 7;
}

export const HeightView = Backbone.View.extend({
    el: '#heightView',
    template: _.template(DefaultHeightTemplate),
    distinctTemplate: _.template(DistinctHeightTemplate),
    genericTemplate: _.template(GenericHeightTemplate),
    initialize() {
        this.listenTo(this.model, "change", this.render);
    },
    render() {
        const values = this.model.get("values");
        if(values.length === 0) {
            this.$el.html(this.template(this.model.attributes));
        } else if(shouldRenderDistinct(this.model)) {
            this.$el.html(this.distinctTemplate(this.model.attributes));
            this.delegateEvents({
                'click #surface-level': () => {
                    this.model.set({ selected: getSurfaceIndexForUnit(this.model.attributes.values, this.model.attributes.unit) });
                },
                'click .height-selector': (ev) => {
                    this.model.set({ selected: parseInt(ev.target.dataset.index) });
                }
            });
        } else {
            this.$el.html(this.genericTemplate(this.model.attributes));
            this.delegateEvents({
                'click #heightValueSlider': (ev) => {
                    this.model.set({ selected: ev.target.value });
                }
            });
        }
        return this;
    }
});

export const HeightModel = Backbone.Model.extend({
    defaults: {
        selected: 0,
        unit: 'hPa',
        values: []
    }
});

export const TimeModel = Backbone.Model.extend({
    defaults: {
        selected: 0,
        values: []
    }
});

const DateDefaultTemplate = `
    <%= dateDisplay %> <span <%= (!isLocal ? 'class="text-button"' : "") %>>Local</span> ⇄ 
        <span <%= (isLocal ? 'class="text-button"' : "") %>>UTC</span>
`;

export const DateView = Backbone.View.extend({
    el: "#dateView",
    template: _.template(DateDefaultTemplate),
    events: {
        "click .text-button": "toggle"
    },
    data: {
        isLocal: false
    },
    initialize() {
        this.listenTo(this.model, "change", this.render);
    },
    toggle() {
        this.data.isLocal = !this.data.isLocal;
        this.render();
    },
    render() {
        const values = this.model.get("values");
        let dateDisplay = "-";
        if(values.length > 0) {
            const selectedTime = values[this.model.get("selected")];
            const date = floatToDate(selectedTime);
            if(this.data.isLocal) {
                dateDisplay = toLocalISO(date);
            } else {
                dateDisplay = toUTCISO(date);
            }
        }
        this.$el.html(this.template({
            dateDisplay,
            ...this.data
        }));
    }
});

const DefaultTimeNavigationTemplate = `
    <span class="text-button" id="reset-time">Reset</span>
    <span <%= (canGoBack ? 'class="text-button"' : "") %> id="nav-backward-more"> « </span> –
    <span <%= (canGoBack ? 'class="text-button"' : "") %> id="nav-backward"> ‹ </span> –
    <span <%= (canGoForward ? 'class="text-button"' : "") %> id="nav-forward"> › </span> –
    <span <%= (canGoForward ? 'class="text-button"' : "") %> id="nav-forward-more"> » </span>
`;

export const TimeNavigationView = Backbone.View.extend({
    el: "#timeControlView",
    template: _.template(DefaultTimeNavigationTemplate),
    events: {
        'click #reset-time': function() { this.reset() },
        'click #nav-backward-mode.text-button': function() { this.adjustIndex(-10); },
        'click #nav-backward.text-button': function() { this.adjustIndex(-1); },
        'click #nav-forward-mode.text-button': function() { this.adjustIndex(10); },
        'click #nav-forward.text-button': function() { this.adjustIndex(1); }
    },
    initialize() {
        this.listenTo(this.model, "change", this.render);
    },
    reset() {
        this.model.set({selected: 0});
    },
    adjustIndex(adjustment) {
        const index = this.model.get("selected");
        const max = this.model.get("values").length - 1;
        const min = 0;
        const newIndex = Math.max(Math.min(index + adjustment, max), min);
        this.model.set({selected: newIndex});
    },
    render() {
        const selectedIndex = this.model.get("selected");
        const canGoBack = selectedIndex > 0;
        const canGoForward = selectedIndex < this.model.get("values").length - 1;
        this.$el.html(this.template({
            canGoBack,
            canGoForward
        }));
    }
});
