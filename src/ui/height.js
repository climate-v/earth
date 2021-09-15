/*
    height - ui controls for height selection
    Copyright (C) 2021  Tim Hagemann

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
import Backbone from 'backbone';
import * as _ from "underscore";
import { HEIGHT_DIRECTION } from "../agents/metadata-agent";
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
        const direction = this.model.get("direction");
        if(values.length === 0 || !this.model.get("enabled")) {
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
            const inverted = direction === HEIGHT_DIRECTION.LOW_TO_HIGH;
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
        values: [],
        enabled: true
    }
});
