importScripts('/pkg/visualize.js');

let { load_file, load_remote } = wasm_bindgen;

const WorkerState = {
    file: null,
    mapSize: 0,
    loadFile(file) {
        if(this.file != null) {
            this.closeFile();
        }

        this.file = load_file(file);
        this.mapSize = this.file.get_map_size();
        return null;
    },
    loadRemote(url) {
        if(this.file != null) {
            this.closeFile();
        }

        let request = new XMLHttpRequest();
        request.open("HEAD", url, false);
        request.send();
        if(request.getResponseHeader("Accept-Range") !== "bytes") {
            return "Does not support partial content";
        }

        let length = request.getResponseHeader("Content-Length");
        if(length != null) {
            this.file = load_remote(url, parseInt(length));
            this.mapSize = this.file.get_map_size();
        } else {
            return "Could not get content length";
        }
    },
    getAttribute(attribute) {
        return this.file.get_attribute(attribute);
    },
    getVariables() {
        return this.file.get_variables();
    },
    getDimensions() {
        return this.file.get_dimensions();
    },
    getData(variable, indices) {
        const variableSize = this.file.get_variable_size(variable);
        if(variableSize === 0) {
            throw "Variable size is 0, not sure what to do";
        }
        const buffer = new ArrayBuffer(this.mapSize * variableSize);
        const uint8View = new Uint8Array(buffer);
        const indexArray = new Uint32Array(indices);
        this.file.load_data_for(variable, indexArray, uint8View);
        return buffer;
    },
    getVariableData(variable, length) {
        const variableSize = this.file.get_variable_size(variable);
        if(variableSize === 0) {
            throw "Variable size is 0, not sure what to do";
        }
        const buffer = new ArrayBuffer(length * variableSize);
        const uint8View = new Uint8Array(buffer);
        const indexArray = new Uint32Array(1);
        indexArray[0] = 0;
        this.file.load_data_for(variable, indexArray, uint8View);
        return buffer;
    },
    closeFile() {
        this.file.free();
        this.file = null;
    }
}

// Make sure we first load the wasm before we accept requests
wasm_bindgen("/pkg/visualize_bg.wasm").then(() => {
    console.log("Worker started.");
    self.onmessage = (ev) => {
        try {
            switch(ev.data.key) {
                case "load":
                    let fileResult = WorkerState.loadFile(ev.data.value);
                    self.postMessage({ key: "load", value: fileResult });
                    break;
                case "loadRemote":
                    let remoteResult = WorkerState.loadRemote(ev.data.value);
                    self.postMessage({ key: "loadRemote", value: remoteResult });
                    break;
                case "attribute":
                    let attr = WorkerState.getAttribute(ev.data.value);
                    self.postMessage({ key: "attribute", value: attr });
                    break;
                case "variables":
                    self.postMessage({ key: "variables", value: WorkerState.getVariables() });
                    break;
                case "dimensions":
                    self.postMessage({ key: "dimensions", value: WorkerState.getDimensions() });
                    break;
                case "values": {
                    let { variable, indices } = ev.data.value;
                    let data = WorkerState.getData(variable, indices);
                    // Note that we need to pass `data`'s ownership over as well to avoid possible copies.
                    self.postMessage({
                        key: "values",
                        value: data
                    }, [data]);
                    break;
                }
                case "variableValues": {
                    let { variable, length } = ev.data.value;
                    let data = WorkerState.getVariableData(variable, length);
                    // Note that we need to pass `data`'s ownership over as well to avoid possible copies.
                    self.postMessage({
                        key: "variableValues",
                        value: data
                    }, [data]);
                    break;
                }
            }
        } catch(ex) {
            // Also handle errors so that the other side doesn't wait indefinitely for a response
            self.postMessage({
                key: "error",
                value: ex
            });
        }
    };
});
