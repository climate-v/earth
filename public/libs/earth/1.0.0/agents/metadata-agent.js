const LEVITATION_UNITS = [
    "hPa",
    "Pa",
    "m"
];

const WIND_OVERLAY = "WIND";
const TEMPERATURE_OVERLAY = "TEMP";

const OVERLAYS = [
    WIND_OVERLAY,
    TEMPERATURE_OVERLAY
];

const MetadataAgent = (function () {

    function filterMatchingVariableWithUnit(dimensions, unit) {
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

    function filterMatchingVariableWithStandardName(variables, name) {
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

    function findLevitationDimension(dimensions) {
        return filterMatchingVariableWithUnit(dimensions, LEVITATION_UNITS);
    }

    function findLatDimension(dimensions) {
        return filterMatchingVariableWithUnit(dimensions, 'degrees_north');
    }

    function findLonDimension(dimensions) {
        return filterMatchingVariableWithUnit(dimensions, 'degrees_east');
    }

    function findUWindVariable(variables) {
        return filterMatchingVariableWithStandardName(variables, 'eastward_wind');
    }

    function findVWindVariable(variables) {
        return filterMatchingVariableWithStandardName(variables, 'northward_wind');
    }

    function findTimeDimension(dimensions) {
        return filterMatchingVariableWithStandardName(dimensions, 'time');
    }

    function getAvailableOverlays() {
        return [WIND_OVERLAY]; // TODO
    }

    function getTimeValues(timeVariable) {
        return api.getAllVariableValues(timeVariable);
    }

    function getElevationLevels(levitationVariable) {
        return api.getAllVariableValues(levitationVariable);
    }

    return {
        buildMetadata() {
            const dimensions = api.getDimensions().split(',');
            const variables = api.getVariables().split(',');

            const centerName = api.getStringAttribute('institution');
            const title = api.getStringAttribute('title');

            const config = {
                levitation: findLevitationDimension(dimensions),
                latitude: findLatDimension(dimensions), // TODO this should be variable
                longitude: findLonDimension(dimensions),
                u: findUWindVariable(variables),
                v: findVWindVariable(variables),
                time: findTimeDimension(dimensions)
            };

            for(let key in config) {
                if(config[key] == null) {
                    throw new Error("Could not determine variable for " + key);
                }
            }

            const availableOverlays = getAvailableOverlays(config);

            const timeValues = getTimeValues(config.time);
            const elevationLevels = getElevationLevels(config.levitation);

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
                },
            }
        }
    };
})();
