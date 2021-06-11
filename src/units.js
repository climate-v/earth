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
