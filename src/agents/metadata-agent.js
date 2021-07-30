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
 * @param api reference to the instantiated visualize api to do wasm calls
 * @param attribute the attribute of the variables to extract
 * @param list the list of variables to search through
 * @param value the value that we're looking for
 * @returns {*}
 */
function filterMatchingAttribute(api, attribute, list, value) {
    let filter;
    if(typeof value === "string") {
        filter = (x) => x === value;
    } else {
        filter = (x) => value.includes(x);
    }

    return list.find(dimension => {
        const unit = api.getVariableStringAttribute(dimension, attribute);
        return filter(unit);
    });
}

function filterHasAttribute(api, attribute, list) {
    return list.find(variable => {
        const value = api.getVariableStringAttribute(variable, attribute);
        return value !== "";
    });
}

function filterMatchingVariableWithUnit(api, dimensions, unit) {
    return filterMatchingAttribute(api, "units", dimensions, unit);
}

function filterMatchingVariableWithStandardName(api, variables, name) {
    return filterMatchingAttribute(api, "standard_name", variables, name);
}

function filterMatchingVariableWithLongName(api, variables, name) {
    return filterMatchingAttribute(api, "long_name", variables, name);
}

function findLevitationDimension(api, dimensions) {
    return findFirstMatching(
        () => filterMatchingAttribute(api, "axis", dimensions, "Z"),
        () => filterMatchingVariableWithStandardName(api, dimensions, "height")
    );
}

function findLatDimension(api, dimensions) {
    return findFirstMatching(
        () => filterMatchingAttribute(api, "axis", dimensions, "Y"),
        () => filterMatchingVariableWithUnit(api, dimensions, "degrees_north"),
        () => filterMatchingVariableWithStandardName(api, dimensions, "latitude")
    );
}

function findLonDimension(api, dimensions) {
    return findFirstMatching(
        () => filterMatchingAttribute(api, "axis", dimensions, "X"),
        () => filterMatchingVariableWithUnit(api, dimensions, "degrees_east"),
        () => filterMatchingVariableWithStandardName(api, dimensions, "longitude")
    );
}

function findCLatDimension(api, variables) {
    return findFirstMatching(
        () => filterMatchingAttribute(api, "long_name", variables, "center latitude"),
        () => filterMatchingVariableWithStandardName(api, variables, "latitude"),
        () => variables.find(variable => variable === "clat")
    );
}

function findCLonDimension(api, variables) {
    return findFirstMatching(
        () => filterMatchingAttribute(api, "long_name", variables, "center longitude"),
        () => filterMatchingVariableWithStandardName(api, variables, "longitude"),
        () => variables.find(variable => variable === "clon")
    );
}

function findUWindVariable(api, variables) {
    return filterMatchingVariableWithStandardName(api, variables, "eastward_wind");
}

function findVWindVariable(api, variables) {
    return filterMatchingVariableWithStandardName(api, variables, "northward_wind");
}

function findTimeDimension(api, dimensions) {
    return findFirstMatching(
        () => filterMatchingAttribute(api, "axis", dimensions, "T"),
        () => filterMatchingVariableWithStandardName(api, dimensions, "time")
    );
}

function variableHasCorrectDimensions(api, variable, dimensions) {
    const dimensionsForVariable = api.getVariableDimensions(variable).split(",");
    return dimensionsForVariable.length === dimensions.length && dimensionsForVariable.every(dim => dimensions.includes(dim));
}

function createWindOverlay(api, variables) {
    let uVariableName = findUWindVariable(api, variables);
    let vVariableName = findVWindVariable(api, variables);

    if(uVariableName == null || vVariableName == null) {
        return null;
    }

    variables.splice(variables.indexOf(uVariableName), 1);
    variables.splice(variables.indexOf(vVariableName), 1);

    return {
        displayName: "Wind",
        type: "wind",
        id: "wind",
        u: { name: uVariableName },
        v: { name: vVariableName }
    }
}

function createTempOverlay(api, variables) {
    const tempVariable = variables.find(variable => TEMPERATURE_OVERLAY_VARIABLES.includes(variable))
        || filterMatchingVariableWithLongName(api, variables, "Temperature");
    if(tempVariable != null) {
        variables.splice(variables.indexOf(tempVariable), 1);
        return {
            type: "temp",
            id: "temp",
            displayName: "Temp",
            name: tempVariable
        };
    } else {
        return null;
    }
}

function createGenericOverlay(api, variable, allDimensions) {
    const dimensions = api.getVariableDimensions(variable).split(",");
    if(dimensions.length !== allDimensions.length || dimensions.some(dim => !allDimensions.includes(dim))) {
        return null;
    }

    return {
        type: "generic",
        id: variable,
        displayName: variable,
        name: variable
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
 * @param api reference to the instantiated visualize api to do wasm calls
 * @param allVariables list of all the variables from the file
 * @param dimensions the list of dimensions from the file
 * @param irregularConfig optional configuration for irregular grids if the loaded file
 *          uses an irregular grid. Null otherwise.
 * @returns {*[]}
 */
function getAvailableOverlays(api, allVariables, dimensions, irregularConfig) {
    const variables = allVariables.filter(variable => !dimensions.includes(variable));
    const overlays = [];
    SPECIAL_OVERLAYS.forEach(overlay => {
        const overlayConfig = OVERLAY_FACTORIES[overlay](api, variables);
        if(overlayConfig != null) {
            overlays.push(overlayConfig);
        }
    });

    const dims = (irregularConfig != null ? irregularConfig.dimensions : dimensions);

    variables.filter(variable => variableHasCorrectDimensions(api, variable, dims)).forEach(variable => {
        let overlay = createGenericOverlay(api, variable, dims);
        if(overlay != null) {
            overlays.push(overlay);
        }
    });

    console.log("Fond overlays", overlays);

    return overlays;
}

function getTimeValues(api, timeVariable) {
    return api.getAllVariableValues(timeVariable);
}

function getElevationLevels(api, levitationVariable) {
    return api.getAllVariableValues(levitationVariable);
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

export function buildMetadata(api) {
    const dimensions = api.getDimensions().split(",");
    const variables = api.getVariables().split(",");

    const centerName = api.getStringAttribute("institution");
    const title = api.getStringAttribute("title");

    let irregular = null;

    const config = {
        levitation: findLevitationDimension(api, dimensions),
        latitude: findLatDimension(api, dimensions),
        longitude: findLonDimension(api, dimensions),
        time: findTimeDimension(api, dimensions)
    };

    if(config.latitude == null && config.longitude == null && dimensions.includes('ncells')) {
        config.longitude = findCLonDimension(api, variables);
        config.latitude = findCLatDimension(api, variables);
        irregular = {
            cellDimension: 'ncells',
            cellCount: api.getDimensionLength('ncells'),
            dimensions: [config.time, config.levitation, 'ncells']
        };
    }

    for(let key in config) {
        if(config[key] == null) {
            throw new Error("Could not determine variable for " + key);
        }
    }

    const availableOverlays = getAvailableOverlays(api, variables, dimensions, irregular);

    const timeValues = getTimeValues(api, config.time);
    const elevationLevels = getElevationLevels(api, config.levitation);
    let inverted = api.getVariableStringAttribute(config.levitation, "positive") !== "down";
    const elevationDirection = getDimensionDirection(elevationLevels, inverted);

    const longitudeDimensionSize = api.getDimensionLength(config.longitude);
    const latitudeDimensionSize = api.getDimensionLength(config.latitude);

    return {
        centerName,
        availableOverlays,
        title,
        irregular,
        dimensions: {
            time: {
                name: config.time,
                values: timeValues,
                size: timeValues.length
            },
            levitation: {
                name: config.levitation,
                values: elevationLevels,
                unit: api.getVariableStringAttribute(config.levitation, "units"),
                size: elevationLevels.length,
                direction: elevationDirection
            },
            latitude: {
                name: config.latitude,
                size: latitudeDimensionSize,
                unit: api.getVariableStringAttribute(config.latitude, "units"),
                range: (irregular ? [] : [api.getVariableValue(config.latitude, [0]), api.getVariableValue(config.latitude, [latitudeDimensionSize - 1])])
            },
            longitude: {
                name: config.longitude,
                size: longitudeDimensionSize,
                unit: api.getVariableStringAttribute(config.longitude, "units"),
                range: (irregular ? [] : [api.getVariableValue(config.longitude, [0]), api.getVariableValue(config.longitude, [longitudeDimensionSize - 1])])
            }
        }
    }
}

/**
 * The metadata agent takes care of finding the metadata information about the file,
 * such as which variables it has and what dimensions or overlays the correspond to.
 * It also find the variables necessary for height and time as well as figuring out
 * if the file has an irregular grid or not. Thus any information about the file,
 * that is not the data itself will be covered by this agent.
 */
export default newLoggedAgent();
