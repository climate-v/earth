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

export default newLoggedAgent();
