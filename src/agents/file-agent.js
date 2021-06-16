import µ from "../micro";
import report from "../report";
import {last} from "underscore";

const WEATHER_PATH = "/data/weather";

function isURL(string) {
    let url;
    try {
        url = new URL(string);
    } catch(_error) {
        return false;
    }

    return url.protocol === "http:" || url.protocol === "https:";
}

function getFileInfo(param) {
    if(isURL(param)) {
        const url = new URL(param);
        const name = last(url.pathname.split("/"));
        return [param, name];
    } else {
        const path = [WEATHER_PATH, 'current', param + ".nc"].join("/");
        const name = param + ".nc";
        return [path, name];
    }
}

export function loadFile(api, file) {
    const currentFile = this.value();
    if(currentFile != null) {
        currentFile.file.close();
    }

    report.status("Loading file...");
    const netFile = api.createNetcdfFile({ type: 'file', ref: file });
    return netFile.open().then(() => ({
        file: netFile,
        source: {
            type: "local",
            path: file.name
        }
    }));
}

export function downloadFile(api, filename) {
    const currentFile = this.value();
    if(currentFile != null) {
        currentFile.file.close();
    }

    report.status("Downloading...")
    const [path, name] = getFileInfo(filename);
    return µ.fetchResource(path).then(resp => {
        return resp.arrayBuffer().then(buffer => {
            const file = api.createNetcdfFile({ type: 'buffer', ref: buffer, name });
            return file.open().then(() => ({
                file,
                source: {
                    type: "remote",
                    path: filename
                }
            }));
        });
    });
}
