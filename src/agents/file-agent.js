import report from "../report";
import { newLoggedAgent } from "./agents";

export async function loadFile(worker, file) {
    report.status("Loading file...");
    try {
        await worker.load(file);
        return {
            worker,
            source: {
                type: "local",
                path: file.name
            }
        };
    } catch(ex) {
        if(ex === "InvalidFile") {
            throw "The given file is not a NetCDF file.";
        } else {
            throw ex;
        }
    }
}

/**
 * Tries to load a file from a remote location (usually HTTP url).
 *
 * @param worker The worker to load the file with
 * @param filename The URL to get the file from
 * @returns {Promise<{source: {path, type: string}, worker}|null>} Promise for the result of the load, which will be null if
 *      it failed
 */
export async function downloadFile(worker, filename) {
    report.status("Downloading...")
    try {
        await worker.loadRemote(filename);
        return {
            worker,
            source: {
                type: "remote",
                path: filename
            }
        };
    } catch (ex) {
        if(ex === "InvalidFile") {
            throw "The given file is not a NetCDF file.";
        } else {
            throw "Could not load remote file: " + ex;
        }
    }
}

/**
 * The file agent manages loading/keeping references to the currently selected file.
 * It also keeps reference of where the file came from, i.e. is it a local file or
 * a remote file via http.
 */
export default newLoggedAgent();
