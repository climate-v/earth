export const LEVITATION_UNITS = [
    "hPa",
    "Pa",
    "m"
];

export const WIND_OVERLAY = "WIND";
export const TEMPERATURE_OVERLAY = "TEMP";

export const OVERLAYS = [
    WIND_OVERLAY,
    TEMPERATURE_OVERLAY
];

function filterMatchingVariableWithUnit(api, dimensions, unit) {
    let filter;
    if(typeof unit === 'string') {
        filter = (x) => x === unit;
    } else {
        filter = (x) => unit.includes(x);
    }

    return dimensions.find(dimension => {
        const unit = api.getVariableStringAttribute(dimension, 'units');
        return filter(unit);
    });
}

function filterMatchingVariableWithStandardName(api, variables, name) {
    let filter;
    if(typeof name === 'string') {
        filter = (x) => x === name;
    } else {
        filter = (x) => name.includes(x);
    }

    return variables.find(variable => {
        const standardName = api.getVariableStringAttribute(variable, 'standard_name');
        return filter(standardName);
    });
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

function getAvailableOverlays() {
    return [WIND_OVERLAY]; // TODO
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
            latitude: findLatDimension(api, dimensions), // TODO this should be variable
            longitude: findLonDimension(api, dimensions),
            u: findUWindVariable(api, variables),
            v: findVWindVariable(api, variables),
            time: findTimeDimension(api, dimensions)
        };

        for(let key in config) {
            if(config[key] == null) {
                throw new Error("Could not determine variable for " + key);
            }
        }

        const availableOverlays = getAvailableOverlays(config);

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
                    values: timeValues
                },
                levitation: {
                    name: config.levitation,
                    values: elevationLevels,
                    unit: api.getVariableStringAttribute(config.levitation, 'units')
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
                },
                u: {
                    name: config.u
                },
                v: {
                    name: config.v
                }
            }
        }
    }
};
