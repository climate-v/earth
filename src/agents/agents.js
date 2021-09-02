/*
 * agents - base agent structure managing state
 *
 * Copyright (c) 2014 Cameron Beccario
 * The MIT License - http://opensource.org/licenses/MIT
 *
 * https://github.com/cambecc/earth
 */
import report from "../report";
import Backbone from 'backbone';
import * as _ from 'underscore';

/**
 * Returns a new agent. An agent executes tasks and stores the result of the most recently completed task.
 *
 * A task is a value or promise, or a function that returns a value or promise. After submitting a task to
 * an agent using the submit() method, the task is evaluated and its result becomes the agent's value,
 * replacing the previous value. If a task is submitted to an agent while an earlier task is still in
 * progress, the earlier task is cancelled and its result ignored. Evaluation of a task may even be skipped
 * entirely if cancellation occurs early enough.
 *
 * Agents are Backbone.js Event emitters. When a submitted task is accepted for invocation by an agent, a
 * "submit" event is emitted. This event has the agent as its sole argument. When a task finishes and
 * the agent's value changes, an "update" event is emitted, providing (value, agent) as arguments. If a task
 * fails by either throwing an exception or rejecting a promise, a "reject" event having arguments (err, agent)
 * is emitted. If an event handler throws an error, an "error" event having arguments (err, agent) is emitted.
 *
 * The current task can be cancelled by invoking the agent.cancel() method, and the cancel status is available
 * as the Boolean agent.cancel.requested key. Within the task callback, the "this" context is set to the agent,
 * so a task can know to abort execution by checking the this.cancel.requested key. Similarly, a task can cancel
 * itself by invoking this.cancel().
 *
 * Example pseudocode:
 * <pre>
 *     var agent = newAgent();
 *     agent.on("update", function(value) {
 *         console.log("task completed: " + value);  // same as agent.value()
 *     });
 *
 *     function someLongAsynchronousProcess(x) {  // x === "abc"
 *         var d = when.defer();
 *         // some long process that eventually calls: d.resolve(result)
 *         return d.promise;
 *     }
 *
 *     agent.submit(someLongAsynchronousProcess, "abc");
 * </pre>
 *
 * @param [initial] initial value of the agent, if any
 * @returns {Object}
 */
export function newAgent(initial) {

    /**
     * @returns {Function} a cancel function for a task.
     */
    function cancelFactory() {
        return function cancel() {
            cancel.requested = true;
            return agent;
        };
    }

    /**
     * Invokes the specified task.
     * @param cancel the task's cancel function.
     * @param taskAndArguments the [task-function-or-value, arg0, arg1, ...] array.
     */
    function runTask(cancel, taskAndArguments) {
        const task = taskAndArguments[0];

        function run(args) {
            return cancel.requested ? null : _.isFunction(task) ? task.apply(agent, args) : task;
        }

        function accept(result) {
            if(!cancel.requested) {
                value = result;
                agent.trigger("update", result, agent);
            }
        }

        function reject(err) {
            if(!cancel.requested) {  // ANNOYANCE: when cancelled, this task's error is silently suppressed
                agent.trigger("reject", err, agent);
            }
        }

        function fail(err) {
            agent.trigger("fail", err, agent);
        }

        try {
            // When all arguments are resolved, invoke the task then either accept or reject the result.
            Promise.all(_.rest(taskAndArguments)).then(run).then(accept, reject).then(undefined, fail);
            agent.trigger("submit", agent);
        } catch(err) {
            fail(err);
        }
    }

    let value = initial;
    const runTask_debounced = _.debounce(runTask, 0);  // ignore multiple simultaneous submissions--reduces noise
    const agent = {

        /**
         * @returns {Object} this agent's current value.
         */
        value: function() {
            return value;
        },

        /**
         * Cancels this agent's most recently submitted task.
         */
        cancel: cancelFactory(),

        /**
         * Submit a new task and arguments to invoke the task with. The task may return a promise for
         * asynchronous tasks, and all arguments may be either values or promises. The previously submitted
         * task, if any, is immediately cancelled.
         * @returns this agent.
         */
        submit: function(task, ...args) {
            // immediately cancel the previous task
            this.cancel();
            // schedule the new task and update the agent with its associated cancel function
            runTask_debounced(this.cancel = cancelFactory(), [task, ...args]);
            return this;
        }
    };

    return _.extend(agent, Backbone.Events);
}

export function newLoggedAgent(initial) {
    return newAgent(initial).on({ "reject": report.error, "fail": report.error });
}
