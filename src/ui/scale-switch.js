import Backbone from "backbone";
import _ from 'underscore';

const SwitchTemplate = `
    <span id="select-linear" class="<%= (scale == "linear" || scale == null ? "" : "text-button") %>">Linear</span> - 
    <span id="select-log" class="<%= (scale === "logarithmic" ? "" : "text-button") %>">Log</span>
`;

export const ScaleSwitch = Backbone.View.extend({
    el: '#scale-switch',
    template: _.template(SwitchTemplate),
    events: {
        'click #select-linear': "useLinear",
        'click #select-log': "useLog"
    },
    initialize() {
        this.listenTo(this.model, "change:scale", this.render);
    },
    currentScale() {
        return this.model.get("scale") || "linear";
    },
    useLinear() {
        if(this.currentScale() !== "linear") {
            this.model.save({"scale": "linear"});
        }
    },
    useLog() {
        if(this.currentScale() !== "logarithmic") {
            this.model.save({ "scale": "logarithmic" });
        }
    },
    render() {
        this.$el.html(this.template({
            scale: this.currentScale()
        }));
    }
});
