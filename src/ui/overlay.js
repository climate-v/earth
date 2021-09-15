/*
    overlay - ui controls for overlay selection
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
