import Backbone from 'backbone';
import * as _ from "underscore";

export const OverlayModel = Backbone.Model.extend({
    defaults: {
        overlays: [],
        currentOverlay: null,
        hasTime: true,
        hasHeight: true
    },
    updateOverlayTo(overlayId) {
        const overlay = this.get("overlays").find(overlay => overlay.id === overlayId);
        console.log("updating overlay", overlay);
        this.set({
            currentOverlay: overlayId,
            hasTime: (overlay != null && overlay.definedDimensions != null ? overlay.definedDimensions.time : true),
            hasHeight: (overlay != null && overlay.definedDimensions != null ? overlay.definedDimensions.height : true)
        });
    }
});

const OverlayTemplate = `
    <span class="text-button <%= isHighlighted({id:'off'}) ? 'highlighted':'' %>" data-overlay="off" id="overlay-off">None</span>
    <% overlays.forEach(overlay => { %>
     - <span class="text-button <%= isHighlighted(overlay) ? 'highlighted':'' %>" data-overlay="<%= overlay.id %>" title="<%= overlay.displayName %>"><%= overlay.displayName %></span>
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
        const clickedOverlayId = ev.target.dataset['overlay'];
        this.model.updateOverlayTo(clickedOverlayId);
    },
    render() {
        const attrs = this.model.attributes;
        this.$el.html(this.template({
            ...attrs,
            isHighlighted(overlay) {
                return attrs.currentOverlay === overlay.id;
            }
        }));
        return this;
    }
});
