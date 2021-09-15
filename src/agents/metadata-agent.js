/*
    metadata-agent - collecting and storing file metadata
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
import { newLoggedAgent } from "./agents";

/**
 * List of variable names to look for a temperature overlay.
 */
const TEMPERATURE_OVERLAY_VARIABLES = [
    "temp"
];

export const WIND_OVERLAY = "wind";
export const TEMPERATURE_OVERLAY = "temp";

export const SPECIAL_OVERLAYS = [
    WIND_OVERLAY,
    TEMPERATURE_OVERLAY
];

const OVERLAY_FACTORIES = {
    [WIND_OVERLAY]: createWindOverlay,
    [TEMPERATURE_OVERLAY]: createTempOverlay
};

export const HEIGHT_DIRECTION = {
    /**
     * Low to high: first index is the lowest index and last index is highest.
     */
    LOW_TO_HIGH: "lth",
    /**
     * High to low: first index is the highest index and last index is the lowest.
     */
    HIGH_TO_LOW: "htl"
};

/**
 * By going through the given getter functions, it finds the first
 * value that is being returned by one of them, or null if none
 * returned a value. Once a value has been found, the remaining
 * getters will not be called.
 *
 * @param getters list of getters to check which should be of type
 *              `() => Any`.
 * @returns {null|*} the first found value
 */
function findFirstMatching(...getters) {
    for(let getter of getters) {
        const result = getter();
        if(result != null) {
            return result;
        }
    }
    return null;
}

/**
 * Filters the given `list` of variable names for ones where the
 * `attribute` of the variable matches the expected `value` and
 * gets the first one.
 *
 * @param attribute the attribute of the variables to extract
 * @param list the list of variables to search through
 * @param value the value that we're looking for
 * @returns {*}
 */
function filterMatchingAttribute(attribute, list, value) {
    let filter;
    if(typeof value === "string") {
        filter = (x) => x === value;
    } else {
        filter = (x) => value.includes(x);
    }

    return list.find(dimension => {
        const foundValue = dimension.attributes[attribute];
        return filter(foundValue);
    });
}

function filterMatchingVariableWithUnit(dimensions, unit) {
    return filterMatchingAttribute("units", dimensions, unit);
}

function filterMatchingVariableWithStandardName(variables, name) {
    return filterMatchingAttribute("standard_name", variables, name);
}

function filterMatchingVariableWithLongName(variables, name) {
    return filterMatchingAttribute("long_name", variables, name);
}

/*
 What follows are the selectors for the dimensions. These each test a list of rules
 to find a matching variable for a specific dimension and pick the first found
 result. Generally, multiple of the rules will apply to the found variable/dimension
 but that does not have to be the case. The order itself should not matter much,
 apart from finding the dimension/variable faster, because there should not be
 multiple variables that match for the same dimension.
 */

function findLevitationDimension(dimensions) {
    return findFirstMatching(
        () => filterMatchingAttribute("axis", dimensions, "Z"),
        () => filterMatchingVariableWithStandardName(dimensions, "height")
    );
}

function findLatDimension(dimensions) {
    return findFirstMatching(
        () => filterMatchingAttribute("axis", dimensions, "Y"),
        () => filterMatchingVariableWithUnit(dimensions, "degrees_north"),
        () => filterMatchingVariableWithStandardName(dimensions, "latitude")
    );
}

function findLonDimension(dimensions) {
    return findFirstMatching(
        () => filterMatchingAttribute("axis", dimensions, "X"),
        () => filterMatchingVariableWithUnit(dimensions, "degrees_east"),
        () => filterMatchingVariableWithStandardName(dimensions, "longitude")
    );
}

function findCLatDimension(variables) {
    return findFirstMatching(
        () => filterMatchingAttribute("long_name", variables, "center latitude"),
        () => filterMatchingVariableWithStandardName(variables, "latitude"),
        () => variables.find(variable => variable.name === "clat")
    );
}

function findCLonDimension(variables) {
    return findFirstMatching(
        () => filterMatchingAttribute("long_name", variables, "center longitude"),
        () => filterMatchingVariableWithStandardName(variables, "longitude"),
        () => variables.find(variable => variable.name === "clon")
    );
}

function findUWindVariable(variables) {
    return filterMatchingVariableWithStandardName(variables, "eastward_wind");
}

function findVWindVariable(variables) {
    return filterMatchingVariableWithStandardName(variables, "northward_wind");
}

function findTimeDimension(dimensions) {
    return findFirstMatching(
        () => filterMatchingAttribute("axis", dimensions, "T"),
        () => filterMatchingVariableWithStandardName(dimensions, "time")
    );
}

/**
 * Try to create a wind overlay from the given list of variables. The wind overlay
 * is special, as it requires two variables, u and v, to function and only if both
 * were found will it be created. If found, both of them will be removed from the
 * given list of variables.
 *
 * @param variables The list of open variables
 * @returns {null|{u: {name}, displayName: string, v: {name}, id: string, type: string}}
 */
function createWindOverlay(variables) {
    let uVariable = findUWindVariable(variables);
    let vVariable = findVWindVariable(variables);

    if(uVariable == null || vVariable == null) {
        return null;
    }

    variables.splice(variables.indexOf(uVariable), 1);
    variables.splice(variables.indexOf(vVariable), 1);

    return {
        displayName: "Wind",
        type: "wind",
        id: "wind",
        u: { name: uVariable.name },
        v: { name: vVariable.name }
    }
}

/**
 * Try to create a temperature overlay by looking for a temperature variable.
 * Returns null if no temperature variable was found.
 * If a variable is found, it will be removed from the list of variables.
 *
 * @param variables The list of open variables
 * @returns {null|{displayName: string, name, id: string, type: string}}
 */
function createTempOverlay(variables) {
    const tempVariable = findFirstMatching(
        () => variables.find(variable => TEMPERATURE_OVERLAY_VARIABLES.includes(variable.name)),
        () => filterMatchingVariableWithLongName(variables, "Temperature")
    );
    if(tempVariable != null) {
        variables.splice(variables.indexOf(tempVariable), 1);
        return {
            type: "temp",
            id: "temp",
            displayName: "Temp",
            name: tempVariable.name
        };
    } else {
        return null;
    }
}

/**
 * Creates a generic overlay for a specific variable.
 * Will fail and return null if it has mismatched dimensions, i.e. more or unknown dimensions.
 *
 * @param variable The variable to create the overlay for
 * @param allDimensions The dimensions defined in the containing file
 * @param config Configuration for dimension variables
 * @returns {{unit: *, displayName, name, id, type: string, definedDimensions: {time: boolean, height: boolean}}|null}
 */
function createGenericOverlay(variable, allDimensions, config) {
    const dimensions = variable.dimensions;
    const hasDimensionNotInList = dimensions.some(dim => !allDimensions.some(dimension => dimension.name === dim));
    if(dimensions.length > allDimensions.length || hasDimensionNotInList) {
        return null;
    }

    return {
        type: "generic",
        id: variable.name,
        unit: variable.attributes["units"],
        displayName: variable.name,
        name: variable.name,
        definedDimensions: {
            time: dimensions.some(dim => dim === config.time.name),
            height: dimensions.some(dim => dim === config.levitation.name),
        }
    }
}

/**
 * Looks through the given variables & dimensions to find what kinds of overlays
 * can be provided for the file these variables came from.
 *
 * This is done by first looking through our special overlays, wind and temperature,
 * if they can be created from the variables (e.g. by checking for u/v variables).
 * From the remaining variables it will try to create generic overlays, making sure
 * that we only consider variables that have matching dimensions.
 *
 * @param allVariables list of all the variables from the file
 * @param dimensions the list of dimensions from the file
 * @param config the configuration of dimensions for the system
 * @param irregularConfig optional configuration for irregular grids if the loaded file
 *          uses an irregular grid. Null otherwise.
 * @returns {*[]}
 */
function getAvailableOverlays(allVariables, dimensions, config, irregularConfig) {
    const dims = (irregularConfig != null ? irregularConfig.dimensions : dimensions);
    const reservedVariables = [config.levitation.name, config.longitude.name, config.latitude.name, config.time.name];
    const variables = allVariables
        .filter(variable => !reservedVariables.includes(variable.name))
        .filter(variable => !dims.some(dimension => dimension.name === variable.name))
        .filter(variable => !variable.name.endsWith("_bnds"));

    const overlays = [];
    SPECIAL_OVERLAYS.forEach(overlay => {
        const overlayConfig = OVERLAY_FACTORIES[overlay](variables);
        if(overlayConfig != null) {
            overlays.push(overlayConfig);
        }
    });

    const customOverlays = variables
        .map(variable => createGenericOverlay(variable, dims, config))
        .filter(overlay => overlay != null);

    customOverlays.sort((first, second) => {
        return first.name.localeCompare(second.name);
    });

    overlays.push(...customOverlays);

    console.log("Fond overlays", overlays);

    return overlays;
}

async function getVariableValues(worker, variable) {
    return await worker.getVariableValues(variable.name, variable.length);
}

/**
 * Try to figure out which direction the height should be displayed.
 * This is because we want to keep direction the same in the UI
 * even with different heights. However, we also need to take into
 * consideration that the order of values inside the file may not be
 * low to high which means we'd need to invert it again. This function
 * will try to find a definitive result given all the inputs.
 *
 * @param values the values for the variable
 * @param inverted the `inverted` attribute from the variable
 * @returns {string} Either `HEIGHT_DIRECTION.HIGH_TO_LOW` or
 *              `HEIGHT_DIRECTION.LOW_TO_HIGH`
 */
function getDimensionDirection(values, inverted) {
    if(values.length <= 1) {
        return HEIGHT_DIRECTION.LOW_TO_HIGH;
    }

    const firstValue = values[0];
    const lastValue = values[values.length - 1];
    if(firstValue < lastValue) {
        if(inverted) {
            return HEIGHT_DIRECTION.HIGH_TO_LOW;
        } else {
            return HEIGHT_DIRECTION.LOW_TO_HIGH;
        }
    } else if(firstValue > lastValue) {
        if(inverted) {
            return HEIGHT_DIRECTION.LOW_TO_HIGH;
        } else {
            return HEIGHT_DIRECTION.HIGH_TO_LOW;
        }
    } else {
        throw new Error("Height values stayed the same. This should not happen.");
    }
}

/**
 * Builds the metadata collection for the currently loaded data file of the given worker.
 * That is, it collects the dimensions and variables and makes then accessible under a
 * common name (because they usually have different names in the files). It also figures
 * out if the data file uses a regular or irregular grid, configuring the dimensions
 * accordingly.
 *
 * @param worker The worker with the file loaded
 * @returns {Promise<{irregular: null, title: *, availableOverlays: *[], centerName: *, dimensions: {latitude: {unit: *, size, values: *, name, range: *[]}, time: {size, values: *, name}, levitation: {unit: *, size, values: *, name, direction: string}, longitude: {unit: *, size, values: *, name, range: *[]}}}>}
 */
export async function buildMetadata(worker) {
    const dimensions = worker.getDimensions();
    const variables = worker.getVariables();

    const centerName = await worker.getAttribute("institution");
    const title = await worker.getAttribute("title");

    let irregular = null;

    const dimensionVariables =  variables.filter(variable => dimensions.some(dimension => dimension.name === variable.name));

    // Figure out which dimension represents which concept
    const config = {
        levitation: findLevitationDimension(dimensionVariables),
        latitude: findLatDimension(dimensionVariables),
        longitude: findLonDimension(dimensionVariables),
        time: findTimeDimension(dimensionVariables)
    };

    // Check if we have an irregular grid
    if(config.latitude == null && config.longitude == null && dimensions.some(dim => dim.name === 'ncells')) {
        // if we do, we need different lat/lon dimensions, which are often not inside the variable list
        config.longitude = findCLonDimension(variables);
        config.latitude = findCLatDimension(variables);
        let cellDimension = dimensions.find(dimension => dimension.name === 'ncells');
        // Specifically create an irregular config to make it distinguishable
        irregular = {
            cellDimension: cellDimension.name,
            cellCount: cellDimension.length,
            dimensions: [config.time, config.levitation, cellDimension]
        };
    }

    // Check if all of the dimensions we wanted to define are actually defined
    for(let key in config) {
        if(config[key] == null) {
            throw new Error("Could not determine variable for " + key);
        }
    }

    const availableOverlays = getAvailableOverlays(variables, dimensions, config, irregular);

    // Load & store the values for time and elevation since we will need it in the UI anyway
    const timeValues = await getVariableValues(worker, config.time);
    const elevationLevels = await getVariableValues(worker, config.levitation);
    // To figure out, which direction the levitation dimensions goes, e.g. first index is
    // surface of earth and last index is top of the atmosphere, we check if there positive
    // attribute is set
    let inverted = config.levitation.attributes["positive"] === "down";
    // and with that figure out, with the values, how they're sorted
    const elevationDirection = getDimensionDirection(elevationLevels, inverted);
    // This direction helps us have a consistent UI

    // Cache lat/lon values to make it easier working with an irregular grid as we need
    // them there to setup our grid
    const longitudeValues = await getVariableValues(worker, config.longitude);
    const latitudeValues = await getVariableValues(worker, config.latitude);

    // Create an easily accessible object of all the metadata we have, specifically the dimensions
    // and their properties.
    return {
        centerName,
        availableOverlays,
        title,
        irregular,
        dimensions: {
            time: {
                name: config.time.name,
                values: timeValues,
                size: timeValues.length
            },
            levitation: {
                name: config.levitation.name,
                values: elevationLevels,
                unit: config.levitation.attributes["units"],
                size: elevationLevels.length,
                direction: elevationDirection
            },
            latitude: {
                name: config.latitude.name,
                size: latitudeValues.length,
                unit: config.latitude.attributes["units"],
                values: latitudeValues,
                // Range helps us figure out the size of our grid
                // which does not work for an irregular grid, as the values can be all over the place
                // and the index says nothing about where the location is
                range: (irregular ? [] : [latitudeValues[0], latitudeValues[latitudeValues.length - 1]])
            },
            longitude: {
                name: config.longitude.name,
                size: longitudeValues.length,
                unit: config.longitude.attributes["units"],
                values: longitudeValues,
                // Range helps us figure out the size of our grid, see above
                range: (irregular ? [] : [longitudeValues[0], longitudeValues[longitudeValues.length - 1]])
            }
        }
    };
}

/**
 * The metadata agent takes care of finding the metadata information about the file,
 * such as which variables it has and what dimensions or overlays the correspond to.
 * It also find the variables necessary for height and time as well as figuring out
 * if the file has an irregular grid or not. Thus any information about the file,
 * that is not the data itself will be covered by this agent.
 */
export default newLoggedAgent();
