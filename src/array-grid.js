/*
    array-grid - representing a an array as a grid
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
