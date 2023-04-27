/*
    grid-agent - building and storing selected grids
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
import fileAgent from "../agents/file-agent";
import metadataAgent from "../agents/metadata-agent";
import log from "../log";
import {productsFor} from "../products";
import report from "../report";
import { newLoggedAgent } from "./agents";

export class EmptyGridSelection {
    hasVectorField() {
        return false;
    }

    hasOverlay() {
        return false;
    }

    get primaryGrid() {
        return null;
    }

    get overlayGrid() {
        return null;
    }

    get scale() {
        return null;
    }
}

export class GridSelection {
    constructor(main, overlay) {
        this.primary = main;
        this.overlay = overlay;
    }

    hasVectorField() {
        return this.primary.field === "vector";
    }

    hasOverlay() {
        return this.overlay != null;
    }

    get primaryGrid() {
        return this.primary;
    }

    get overlayGrid() {
        return this.overlay;
    }

    get bounds() {
        if(this.overlay != null) {
            return this.overlay.bounds;
        }
        return this.primary.bounds;
    }
}

export async function buildGrids(configuration, worker) {
    report.status("Building grid...");
    log.time("build grids");
    // Builds the actual grid based on changes in the view
    const selectedProducts = productsFor(configuration.attributes, metadataAgent.value());
    const builtProducts = await Promise.all(selectedProducts.map(async product => {
        return await product.build(worker, fileAgent.value());
    }));

    log.time("build grids");
    report.status("");

    if(builtProducts.length === 0) {
        return new EmptyGridSelection();
    }

    return new GridSelection(...builtProducts);
}

export default newLoggedAgent();
