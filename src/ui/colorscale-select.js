import Backbone from 'backbone';
import * as _ from "underscore";
import { COLORSCALES } from "../colorscales";

const TEMPLATE = `
<span style="display: flex; flex-direction: row; width: 100%">
    <% for(let [i, scale] of scales.entries()) { %>
        <span data-name="<%= scale.name %>" class="<%= (currentScale == scale.name ? "" : "text-button") %>"><%= scale.name %></span>
        <%= (i < scales.length - 1 ? " - " : "") %>
    <% } %>
</div>
`;

export const ColorscaleSelect = Backbone.View.extend({
    el: '#colorscale-select',
    template: _.template(TEMPLATE),
    events: {
        'click span': 'handleClick'
    },
    initialize() {
        this.listenTo(this.model, "change:colorscale", this.render);
    },
    handleClick(ev) {
        const selectedScale = ev.target.dataset.name;
        if(selectedScale !== this.model.get("colorscale")) {
            this.model.save({ colorscale: selectedScale });
        }
    },
    render() {
        this.$el.html(this.template({
            scales: COLORSCALES,
            currentScale: this.model.get("colorscale")
        }));
    }
});
