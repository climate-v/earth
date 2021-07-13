export class ArrayGrid {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.grid = new Array(width * height).fill(0);
    }

    getAt({x, y}) {
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
