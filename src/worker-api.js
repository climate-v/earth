/**
 * Calls the worker and returns a promise that resolves with the response from the worker
 *
 * @param worker The worker to send the data to
 * @param key The key of the request
 * @param value The value to send with the request (may be null)
 * @returns {Promise<any>} The promise which resolves with the response
 */
function call(worker, key, value) {
    return new Promise(resolve => {
        worker.addEventListener("message", function caller(ev) {
            if(ev.data.key === key) {
                worker.removeEventListener("message", caller);
                resolve(ev.data.value);
            }
        });

        worker.postMessage({
            key,
            value
        });
    });
}

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
 * See {@see createBEArrayProxy} for more information.
 *
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
 * can't because the underlying data is big endian and not little endian.
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
        async getValues(time, height, variable, irregular = false) {
            let values = await call(this.worker, "values", {
                time, height, variable, irregular
            });
            const view = new DataView(values);
            return createProxyForType(view, this.variableTypes[variable]);
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
