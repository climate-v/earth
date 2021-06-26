import Backbone from 'backbone';
import * as _ from "underscore";
import { getSurfaceIndexForUnit } from "../units";

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
    <input style="width: 50%" type="range" min="0" max="<%= values.length - 1 %>" value="<%= selectedDisplay %>" class="slider" id="heightValueSlider" />
    <%= values[selectedDisplay] %> <%= unit %>
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
            const inverted = this.model.attributes.inverted;
            const index = (inverted ? (this.model.attributes.values.length - 1) - this.model.attributes.selected : this.model.attributes.selected);
            this.$el.html(this.genericTemplate({...this.model.attributes, selectedDisplay: index}));
            this.delegateEvents({
                'change #heightValueSlider': (ev) => {
                    if(inverted) {
                        this.model.set({ selected: (this.model.attributes.values.length - 1) - ev.target.value });
                    } else {
                        this.model.set({ selected: ev.target.value });
                    }
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
