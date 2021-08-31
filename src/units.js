export const LEVITATION_UNITS = [
    "hPa",
    "Pa",
    "m"
];

export function getSurfaceIndexForUnit(values, unit)
{
    switch(unit) {
        case "hPa":
        case "Pa":
            const maxValue = Math.max(...values);
            return values.indexOf(maxValue);
        default:
            const minValue = Math.min(...values);
            return values.indexOf(minValue);
    }
}

const TEMPERATURE_UNITS = [
    {
        label: "°C", conversion: (x) => x - 273.15, precision: 1
    },
    {
        label: "°F", conversion: (x) => x * 9 / 5 - 459.67, precision: 1
    },
    {
        label: "K", conversion: (x) => x, precision: 1
    }
];
const DISTANCE_UNITS = [
    {
        label: "m", conversion: (x) => x, precision: 1
    },
    {
        label: "ft", conversion: (x) => x * 3.2808, precision: 1
    }
];

/**
 * Tries to find units that are similar to the given unit and sets up the conversions
 * between these units. If no matching units are found, only the given unit will be
 * configured and returned.
 *
 * @param unit The specified unit of the variable
 * @param min The min value of the variable in the given unit
 * @param max The max value of the variable in the given unit
 * @returns list of units available that can be displayed for the passed unit
 */
export function findMatchingUnitConversions(unit, min, max) {
    if(unit === "K") {
        return TEMPERATURE_UNITS;
    } else if(["C", "F", "°C", "°F"].includes(unit)) {
        let toKelvinConversion;
        if(["°C", "C"].includes(unit)) {
            toKelvinConversion = (x) => x + 273.15;
        } else {
            toKelvinConversion = (x) => (x - 32) / 1.8 + 273.15;
        }

        return TEMPERATURE_UNITS.map(units => {
            return {
                ...units,
                conversion: (x) => {
                    const kelvin = toKelvinConversion(x);
                    return units.conversion(kelvin);
                },
                precision: findRequiredPrecision(units.conversion(min), units.conversion(max))
            }
        });
    } else if(unit === "m") {
        return DISTANCE_UNITS;
    }

    return [{
        label: unit,
        conversion: (x) => x,
        precision: findRequiredPrecision(min, max)
    }];
}

function findRequiredPrecision(min, max) {
    if(max < 2) {
        return 3;
    } else if(max < 10) {
        return 2;
    } else if(max < 100) {
        return 1;
    } else {
        return 0;
    }
}
