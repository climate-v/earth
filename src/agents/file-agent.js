import report from "../report";
import { newLoggedAgent } from "./agents";

export async function loadFile(worker, file) {
    report.status("Loading file...");
    await worker.load(file);
    return {
        worker,
        source: {
            type: "local",
            path: file.name
        }
    };
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
    const result = await worker.loadRemote(filename);
    if(result != null) {
        report.error("Could not load remote file: " + result);
        return null;
    }
    return {
        worker,
        source: {
            type: "remote",
            path: filename
        }
    };
}

/**
 * The file agent manages loading/keeping references to the currently selected file.
 * It also keeps reference of where the file came from, i.e. is it a local file or
 * a remote file via http.
 */
export default newLoggedAgent();
