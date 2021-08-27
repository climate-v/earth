let callId = 0;
function getNextCallId() {
    callId = (callId + 1) % 1000;
    return callId;
}

/**
 * Calls the worker and returns a promise that resolves with the response from the worker
 * or is rejected, if the worker experienced an error.
 *
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
 * otherwise.
 *
 * The proxy only emulates a few select things, these include:
 *  - length
 *  - indexOf
 *  - map
 *  - toString
 *  - for ... of
 *  - [] accessing with number index
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
        async load(file) {
            const result = await call(this.worker, "load", file);
            if(result != null) {
                return result;
            } else {
                await this.initForFile();
                return null;
            }
        },
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
        async getVariables() {
            return this.variables;
        },
        async getDimensions() {
            return this.dimensions;
        },
        async getValues(variable, ...indices) {
            console.log(`Requesting for variable ${variable}...`);
            let values = await call(this.worker, "values", {
                variable, indices
            });
            const view = new DataView(values);
            const proxy = createProxyForType(view, this.variableTypes[variable]);
            console.log(`For variable ${variable} got length ${proxy.length}`);
            return proxy;
        },
        async getAttribute(attribute) {
            return await call(this.worker, "attribute", attribute);
        },
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
