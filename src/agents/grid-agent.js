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
    const selectedProducts = productsFor(configuration.attributes, metadataAgent.value());
    const builtProducts = await Promise.all(selectedProducts.map(async product => {
        return await product.build(worker, fileAgent.value());
    }));

    log.time("build grids");

    if(builtProducts.length === 0) {
        return new EmptyGridSelection();
    }

    return new GridSelection(...builtProducts);
}

export default newLoggedAgent();
