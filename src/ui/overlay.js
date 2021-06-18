import Backbone from 'backbone';
import * as _ from "underscore";

export const OverlayModel = Backbone.Model.extend({
    defaults: {
        overlays: [],
        currentOverlay: null
    }
});

const OverlayTemplate = `
    <span class="text-button <%= isHighlighted('off') ? 'highlighted':'' %>" data-overlay="off" id="overlay-off">None</span>
    <% Object.keys(overlays).forEach(overlay => { %>
     - <span class="text-button <%= isHighlighted(overlay) ? 'highlighted':'' %>" data-overlay="<%= overlay %>" title="<%= overlays[overlay].displayName %>"><%= overlays[overlay].displayName %></span>
    <% }); %>
`;

export const OverlayView = Backbone.View.extend({
    el: '#overlayView',
    template: _.template(OverlayTemplate),
    initialize() {
        this.listenTo(this.model, "change", this.render);
    },
    events: {
        'click .text-button': 'selectOverlay'
    },
    selectOverlay(ev) {
        const clickedOverlay = ev.target.dataset['overlay'];
        this.model.set({ currentOverlay: clickedOverlay });
    },
    render() {
        const attrs = this.model.attributes;
        this.$el.html(this.template({
            ...attrs,
            isHighlighted(overlay) {
                return attrs.currentOverlay === overlay;
            }
        }));
        return this;
    }
});
