import { newLoggedAgent } from "./agents";

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

function filterHasAttribute(attribute, list) {
    return list.find(variable => {
        const value = variable.attributes[attribute];
        return value !== "";
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

function variableHasCorrectDimensions(variable, dimensions) {
    const dimensionsForVariable = variable.dimensions;
    return dimensionsForVariable.length === dimensions.length && dimensionsForVariable.every(dim => dimensions.some(dimension => dimension.name === dim));
}

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

export async function buildMetadata(worker) {
    const dimensions = await worker.getDimensions();
    const variables = await worker.getVariables();

    const centerName = await worker.getAttribute("institution");
    const title = await worker.getAttribute("title");

    let irregular = null;

    const dimensionVariables =  variables.filter(variable => dimensions.some(dimension => dimension.name === variable.name));

    const config = {
        levitation: findLevitationDimension(dimensionVariables),
        latitude: findLatDimension(dimensionVariables),
        longitude: findLonDimension(dimensionVariables),
        time: findTimeDimension(dimensionVariables)
    };

    if(config.latitude == null && config.longitude == null && dimensions.some(dim => dim.name === 'ncells')) {
        config.longitude = findCLonDimension(variables);
        config.latitude = findCLatDimension(variables);
        let cellDimension = dimensions.find(dimension => dimension.name === 'ncells');
        irregular = {
            cellDimension: cellDimension.name,
            cellCount: cellDimension.length,
            dimensions: [config.time, config.levitation, cellDimension]
        };
    }

    for(let key in config) {
        if(config[key] == null) {
            throw new Error("Could not determine variable for " + key);
        }
    }

    const availableOverlays = getAvailableOverlays(variables, dimensions, config, irregular);

    const timeValues = await getVariableValues(worker, config.time);
    const elevationLevels = await getVariableValues(worker, config.levitation);
    let inverted = config.levitation.attributes["positive"] === "down";
    const elevationDirection = getDimensionDirection(elevationLevels, inverted);

    const longitudeValues = await getVariableValues(worker, config.longitude);
    const latitudeValues = await getVariableValues(worker, config.latitude);

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
                range: (irregular ? [] : [latitudeValues[0], latitudeValues[latitudeValues.length - 1]])
            },
            longitude: {
                name: config.longitude.name,
                size: longitudeValues.length,
                unit: config.longitude.attributes["units"],
                values: longitudeValues,
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
