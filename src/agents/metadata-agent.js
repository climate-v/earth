import { LEVITATION_UNITS } from "../units";

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
}

function filterMatchingAttribute(api, attribute, list, value) {
    let filter;
    if(typeof value === 'string') {
        filter = (x) => x === value;
    } else {
        filter = (x) => value.includes(x);
    }

    return list.find(dimension => {
        const unit = api.getVariableStringAttribute(dimension, attribute);
        return filter(unit);
    });
}

function filterMatchingVariableWithUnit(api, dimensions, unit) {
    return filterMatchingAttribute(api, 'units', dimensions, unit);
}

function filterMatchingVariableWithStandardName(api, variables, name) {
    return filterMatchingAttribute(api, 'standard_name', variables, name);
}

function filterMatchingVariableWithLongName(api, variables, name) {
    return filterMatchingAttribute(api, 'long_name', variables, name);
}

function findLevitationDimension(api, dimensions) {
    return filterMatchingVariableWithUnit(api, dimensions, LEVITATION_UNITS);
}

function findLatDimension(api, dimensions) {
    return filterMatchingVariableWithUnit(api, dimensions, 'degrees_north');
}

function findLonDimension(api, dimensions) {
    return filterMatchingVariableWithUnit(api, dimensions, 'degrees_east');
}

function findUWindVariable(api, variables) {
    return filterMatchingVariableWithStandardName(api, variables, 'eastward_wind');
}

function findVWindVariable(api, variables) {
    return filterMatchingVariableWithStandardName(api, variables, 'northward_wind');
}

function findTimeDimension(api, dimensions) {
    return filterMatchingVariableWithStandardName(api, dimensions, 'time');
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
        || filterMatchingVariableWithLongName(api, variables, 'Temperature');
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

function getAvailableOverlays(api, allVariables, dimensions) {
    const variables = allVariables.filter(variable => !dimensions.includes(variable));
    const overlays = [];
    SPECIAL_OVERLAYS.forEach(overlay => {
        const overlayConfig = OVERLAY_FACTORIES[overlay](api, variables);
        if(overlayConfig != null) {
            overlays.push(overlayConfig);
        }
    });

    variables.filter(variable => variableHasCorrectDimensions(api, variable, dimensions)).forEach(variable => {
        let overlay = createGenericOverlay(api, variable, dimensions);
        if(overlay != null) {
            overlays.push(overlay);
        }
    });

    return overlays;
}

function getTimeValues(api, timeVariable) {
    return api.getAllVariableValues(timeVariable);
}

function getElevationLevels(api, levitationVariable) {
    return api.getAllVariableValues(levitationVariable);
}

export const MetadataAgent = {
    buildMetadata(api) {
        const dimensions = api.getDimensions().split(',');
        const variables = api.getVariables().split(',');

        const centerName = api.getStringAttribute('institution');
        const title = api.getStringAttribute('title');

        const config = {
            levitation: findLevitationDimension(api, dimensions),
            latitude: findLatDimension(api, dimensions),
            longitude: findLonDimension(api, dimensions),
            time: findTimeDimension(api, dimensions)
        };

        for(let key in config) {
            if(config[key] == null) {
                throw new Error("Could not determine variable for " + key);
            }
        }

        const availableOverlays = getAvailableOverlays(api, variables, dimensions);

        const timeValues = getTimeValues(api, config.time);
        const elevationLevels = getElevationLevels(api, config.levitation);

        const longitudeDimensionSize = api.getDimensionLength(config.longitude);
        const latitudeDimensionSize = api.getDimensionLength(config.latitude);

        return {
            centerName,
            availableOverlays,
            title,
            dimensions: {
                time: {
                    name: config.time,
                    values: timeValues,
                    size: timeValues.length
                },
                levitation: {
                    name: config.levitation,
                    values: elevationLevels,
                    unit: api.getVariableStringAttribute(config.levitation, 'units'),
                    size: elevationLevels.length
                },
                latitude: {
                    name: config.latitude,
                    size: latitudeDimensionSize,
                    unit: api.getVariableStringAttribute(config.latitude, 'units'),
                    range: [api.getVariableValue(config.latitude, [0]), api.getVariableValue(config.latitude, [latitudeDimensionSize - 1])]
                },
                longitude: {
                    name: config.longitude,
                    size: longitudeDimensionSize,
                    unit: api.getVariableStringAttribute(config.longitude, 'units'),
                    range: [api.getVariableValue(config.longitude, [0]), api.getVariableValue(config.longitude, [longitudeDimensionSize - 1])]
                }
            }
        }
    }
};
