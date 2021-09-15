/*
    time - ui controls for time
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
import { floatToDate, toLocalISO, toUTCISO } from "../date";
import * as _ from 'underscore';

export const TimeModel = Backbone.Model.extend({
    defaults: {
        selected: 0,
        values: [],
        enabled: true,
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
    <% if(enabled) { %>
        <span class="text-button" id="reset-time">Reset</span>
        <span <%= (canGoBack ? 'class="text-button"' : "") %> id="nav-backward-more"> « </span> –
        <span <%= (canGoBack ? 'class="text-button"' : "") %> id="nav-backward"> ‹ </span> –
        <span <%= (canGoForward ? 'class="text-button"' : "") %> id="nav-forward"> › </span> –
        <span <%= (canGoForward ? 'class="text-button"' : "") %> id="nav-forward-more"> » </span>
    <% } else { %>
        <span> - </span>
    <% } %>
`;

export const TimeNavigationView = Backbone.View.extend({
    el: "#timeControlView",
    template: _.template(DefaultTimeNavigationTemplate),
    events: {
        'click #reset-time': function() {
            this.reset()
        },
        'click #nav-backward-mode.text-button': function() {
            this.adjustIndex(-10);
        },
        'click #nav-backward.text-button': function() {
            this.adjustIndex(-1);
        },
        'click #nav-forward-mode.text-button': function() {
            this.adjustIndex(10);
        },
        'click #nav-forward.text-button': function() {
            this.adjustIndex(1);
        }
    },
    initialize() {
        this.listenTo(this.model, "change", this.render);
    },
    reset() {
        this.model.set({ selected: 0 });
    },
    adjustIndex(adjustment) {
        const index = this.model.get("selected");
        const max = this.model.get("values").length - 1;
        const min = 0;
        const newIndex = Math.max(Math.min(index + adjustment, max), min);
        this.model.set({ selected: newIndex });
    },
    render() {
        const selectedIndex = this.model.get("selected");
        const canGoBack = selectedIndex > 0;
        const canGoForward = selectedIndex < this.model.get("values").length - 1;
        this.$el.html(this.template({
            enabled: this.model.get("enabled"),
            canGoBack,
            canGoForward
        }));
    }
});
