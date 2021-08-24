/**
 * An `ArrayGrid` is a grid that is based on a single dimensional
 * array. This is mainly used to handle the conversion between
 * the access location and the index location in the array.
 */
export class ArrayGrid {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.grid = new Array(width * height);
    }

    getAt({x, y}) {
        if(x < 0 || x >= this.width || y < 0 || y >= this.height) {
            return null;
        }
        return this.grid[this.width * y + x];
    }

    setAt({x, y}, value) {
        if(Number.isNaN(value)) {
            return;
        }

        const index = this.width * y + x;
        return this.grid[index] = value;
    }

    get raw() {
        return this.grid;
    }
}
