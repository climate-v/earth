"use strict";

module.exports = function(grunt) {

    // Project configuration.
    grunt.initConfig({
        pkg: grunt.file.readJSON("package.json"),
        jshint: {
            files: ["*.js", "src/**/*.js"],
            options: {
                // ignores: [""],
                globals: {
                    Buffer: false,
                    console: false,
                    exports: false,
                    module: false,
                    process: false,
                    require: false,
                    __dirname: false
                },
                esversion: '9'
            }
        }
    });

    // Load the plugin that provides the "jshint" task.
    grunt.loadNpmTasks("grunt-contrib-jshint");

    // Default task(s).
    grunt.registerTask("default", ["jshint"]);

};
