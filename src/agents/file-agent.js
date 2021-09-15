/*
    file-agent - loading and keeping user provided files
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
