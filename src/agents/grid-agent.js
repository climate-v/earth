import fileAgent from "../agents/file-agent";
import metadataAgent from "../agents/metadata-agent";
import log from "../log";
import products from "../products";
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

    get scale() {
        if(this.overlay != null) {
            return this.overlay.scale;
        }
        return this.primary.scale;
    }
}

export function buildGrids(configuration, api) {
    report.status("Building grid...");
    log.time("build grids");
    const selectedProducts = products.productsFor(configuration.attributes, metadataAgent.value());
    const builtProducts = selectedProducts.map(product => {
        return product.build(api, fileAgent.value());
    });
    log.time("build grids");

    if(builtProducts.length === 0) {
        return new EmptyGridSelection();
    }

    return new GridSelection(...builtProducts);
}

export default newLoggedAgent();
