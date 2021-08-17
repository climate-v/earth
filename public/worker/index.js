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
    getData(time, height, variable, irregular) {
        const variableSize = this.file.get_variable_size(variable);
        if(variableSize === 0) {
            throw "Variable size is 0, not sure what to do";
        }
        const buffer = new ArrayBuffer(this.mapSize * variableSize);
        const uint8View = new Uint8Array(buffer);
        let indexArray;
        if(irregular) {
            indexArray = new Uint32Array(3);
            indexArray[0] = time;
            indexArray[1] = height;
            indexArray[2] = 0;
        } else {
            indexArray = new Uint32Array(4);
            indexArray[0] = time;
            indexArray[1] = height;
            indexArray[2] = 0;
            indexArray[3] = 0;
        }
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


wasm_bindgen("/pkg/visualize_bg.wasm").then(() => {
    console.log("Worker started.");
    self.onmessage = (ev) => {
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
                self.postMessage({ key: "attribute", value: attr});
                break;
            case "variables":
                self.postMessage({ key: "variables", value: WorkerState.getVariables()});
                break;
            case "dimensions":
                self.postMessage({ key: "dimensions", value: WorkerState.getDimensions() });
                break;
            case "values": {
                let { height, time, variable, irregular } = ev.data.value;
                let data = WorkerState.getData(time, height, variable, irregular);
                self.postMessage({
                    key: "values",
                    value: data
                }, [data]);
                break;
            }
            case "variableValues": {
                let {variable, length} = ev.data.value;
                let data = WorkerState.getVariableData(variable, length);
                self.postMessage({
                    key: "variableValues",
                    value: data
                }, [data]);
                break;
            }
        }
    };
});
