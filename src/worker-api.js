/*
    worker-api - interface to work with the web worker
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
let callId = 0;
function getNextCallId() {
    callId = (callId + 1) % 1000;
    return callId;
}

/**
 * Calls the worker and returns a promise that resolves with the response from the worker
 * or is rejected, if the worker experienced an error. Each messages to the worker is an
 * object containing three keys: `id`, `key`, and `value`. `id` is an identifier to
 * differentiate the message from others and should thus be unique for a period of time.
 * `key` is the type of operation that the worker should execute and the data provided in
 * `value`. This is then sent to the worker using `Worker.postMessage()`.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Worker/postMessage
 * @param worker The worker to send the data to
 * @param key The key of the request
 * @param value The value to send with the request (may be null)
 * @returns {Promise<any>} The promise which resolves with the response
 */
function call(worker, key, value) {
    // Create unique id (for the short while we're working with) to identify the response
    // for this request and not get mixed in with another that's happening at the same time.
    const id = getNextCallId();
    return new Promise((resolve, reject) => {
        worker.addEventListener("message", function caller(ev) {
            if(ev.data.id === id) {
                worker.removeEventListener("message", caller);
                if(ev.data.key === "error") {
                    reject(ev.data.value);
                } else if(ev.data.key === key) {
                    resolve(ev.data.value);
                }
            }
        });

        worker.postMessage({
            key,
            id,
            value
        });
    });
}

/**
 * Maps the kind the backend assigned to something more helpful
 * that we can work with.
 *
 * @param kind the ID of the kind/type
 * @returns {string} the corresponding readable name of the type
 */
function mapKindToType(kind) {
    // See visualize/src/wrapper.rs
    switch(kind) {
        case 1: return "byte";
        case 2: return "char";
        case 3: return "short";
        case 4: return "int";
        case 5: return "float";
        case 6: return "double";
    }
}

/**
 * Creates the correctly configured proxy for a view with the given type.
 * This is necessary as the data in netcdf files is returned as big endian
 * and not little endian, which is the assumed notation in the browser.
 *
 * Currently, this handles the four common data types:
 *  float32, float64, int16, int32.
 *
 * @see createBEArrayProxy
 * @param view The data view with access to the data
 * @param type The type of the elements inside the data view
 * @returns Proxy
 */
function createProxyForType(view, type) {
    let params = {};
    switch(type) {
        case "float":
            params = {
                size: 4,
                accessor: 'getFloat32'
            };
            break;
        case "double":
            params = {
                size: 8,
                accessor: 'getFloat64'
            };
            break;
        case "short":
            params = {
                size: 2,
                accessor: 'getInt16'
            };
            break;
        case "int":
            params = {
                size: 4,
                accessor: 'getInt32'
            };
            break;
        default:
            throw "Unknown type" + type;
    }
    return createBEArrayProxy(view, params.size, params.accessor);
}

/**
 * This creates a proxy for the given data view. This proxy tries to make it look like it's actually
 * a (more or less) typed array. This is useful for cases when you just want to work on an array but
 * can't because the underlying data is big endian and not little endian. `UIn32Array` and similar
 * can wrap such a buffer, but only work with little endian value notation and cannot be configured
 * otherwise. Thus this creates a proxy that emulates array-like functionality invoking the provided
 * accessor when data needs to be loaded.
 *
 * The proxy only emulates a few select things, these include:
 *  - length
 *  - indexOf
 *  - map
 *  - toString
 *  - for ... of
 *  - [] accessing with number index
 *
 * Anything the proxy does not implement will result in an `undefined` value.
 *
 * @param view The underlying data view with access to the bytes
 * @param dataSize The size of the bytes per element
 * @param accessor The accessor function to use on the given data view
 * @returns Proxy that emulates an array
 */
function createBEArrayProxy(view, dataSize, accessor) {
    function getLength(obj) {
        return obj.byteLength / dataSize;
    }

    function getByteIndexOf(index) {
        return index * dataSize;
    }

    return new Proxy(view, {
        get(obj, prop) {

            if(prop === 'length') {
                return getLength(obj);
            }

            if(prop === 'indexOf') {
                const length = getLength(obj);
                return (value) => {
                    for(let i = 0; i < length; i++) {
                        let offset = getByteIndexOf(i);
                        if(obj[accessor](offset, false) === value) {
                            return i;
                        }
                    }
                    return -1;
                }
            }

            if(prop === 'map') {
                return (callback) => {
                    const result = [];
                    const length = getLength(obj);
                    for(let i = 0; i < length; i++) {
                        let offset = getByteIndexOf(i);
                        const value = obj[accessor](offset, false);
                        const mapped = callback(value, i);
                        result.push(mapped);
                    }

                    return result;
                }
            }

            if(prop === Symbol.toStringTag) {
                return () => "[object Array]";
            }

            if(prop === Symbol.iterator) {
                return () => ({
                    current: 0,
                    next() {
                        const byteOffset = getByteIndexOf(this.current);
                        if(byteOffset < obj.byteLength) {
                            this.current += 1;
                            return { done: false, value: obj[accessor](byteOffset, false) };
                        } else {
                            return { done: true };
                        }
                    }
                });
            }

            if(!isNaN(prop)) {
                const index = parseInt(prop);
                return obj[accessor](getByteIndexOf(index), false);
            }

            return undefined;
        }
    });
}

/**
 * Starts the background worker that will handle file interaction and data loading for us.
 */
export function startWorker() {
    return {
        worker: new Worker("/worker/index.js"),
        variableTypes: {},
        variables: [],
        dimensions: [],
        /**
         * Load a file from the users computer.
         *
         * @param file the file to load
         * @returns {Promise<null>} resulting promise
         */
        async load(file) {
            const result = await call(this.worker, "load", file);
            if(result != null) {
                return result;
            } else {
                await this.initForFile();
                return null;
            }
        },
        /**
         * Load a file from a given URL
         *
         * @param url the url to the file to load
         * @returns {Promise<null>} resulting promise
         */
        async loadRemote(url) {
            const result = await call(this.worker, "loadRemote", url);
            if(result != null) {
                return result;
            } else {
                await this.initForFile();
                return null;
            }
        },
        async initForFile() {
            // Load & cache variables and dimensions for faster access,
            // but more importantly, get the variable types so we can
            // create the proper proxies when values are requested.

            this.variables = await call(this.worker, "variables", null);
            for(let variable of this.variables) {
                this.variableTypes[variable.name] = mapKindToType(variable.kind);
            }
            this.dimensions = await call(this.worker, "dimensions", null);
        },
        /**
         * Get the list of variables.
         */
        getVariables() {
            return this.variables;
        },
        /**
         * Get the list of dimensions for the file.
         * These dimensions may not be the same for every variable.
         */
        getDimensions() {
            return this.dimensions;
        },
        /**
         * Load the values for a given variable starting at the given indices.
         * This loads all the available values starting at the given indices.
         * Actually loads the data based on the index position
         *
         * @param variable the variable to load the data for
         * @param indices the indices at what location to start loading the data
         * @returns {Promise<Proxy>}
         */
        async getValues(variable, ...indices) {
            let values = await call(this.worker, "values", {
                variable, indices
            });
            const view = new DataView(values);
            return createProxyForType(view, this.variableTypes[variable]);
        },
        /**
         * Get the attribute value for the given name. This currently only supports
         * string attribute values.
         *
         * @param attribute the attribute to get the value for
         * @returns {Promise<String>} The attribute value
         */
        async getAttribute(attribute) {
            return await call(this.worker, "attribute", attribute);
        },
        /**
         * Gets all the values for a given variable.
         *
         * @param variable The variable to get the data for
         * @param length The expected amount of values
         * @returns {Promise<Proxy>} The data array
         */
        async getVariableValues(variable, length) {
            let values = await call(this.worker, "variableValues", {
                variable,
                length
            });
            const view = new DataView(values);
            return createProxyForType(view, this.variableTypes[variable]);
        }
    };
}
