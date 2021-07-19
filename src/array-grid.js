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
        if(x < 0 || y < 0 || value == null) {
            debugger;
        }
        const index = this.width * y + x;
        return this.grid[index] = value;
    }

    get raw() {
        return this.grid;
    }
}
