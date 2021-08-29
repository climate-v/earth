# Development Documentation

This document guides the reader through the internals of the application and explains points for future extension.

While this is built on top of the original [earth visualization](https://earth.nullschool.net) 
([forked source](https://github.com/cambecc/earth)) and there are still similarities in the code, 
many parts have been severely adjusted. One of the more obvious ones being using 
[vite](https://vitejs.dev/) for building the application as well as serving as a development server.
This change has been made to make structuring the internals better through the use of javascript 
modules. For instructions how to run it and deploy it, please refer to the readme `Building and 
launching`.

## Structure

There are several components to the application, namely: agents, products, ui elements, web worker, 
and all encompassing application. Some smaller parts have been left out that will however be talked
about if they're important enough.

### Agents

The agents each perform a specific task in visualizing the data and may depend on others to create
a sort of production chain. This is done by the agents listening on the changes of the dependent 
agents and reacting on these changes. As a result, the agents may perform their work asynchronously
or synchronously without impacting the agents that depend on them.

- The file agent handles loading files (remote or local) and setting up the backend for that file
- The metadata agent analyzes the files by detecting variables, finding the right dimensions, and
  checking for an irregular grid
- The globe agent draws the globe according to the selected projection
- The mesh agent loads the coastlines which the render agent draws
- The grid agent prepares & loads the data for the selected variables
- The field agent draws the wind field if there is one
- The overlay agent applies the coloring according to the data of the grid

The above also describes the order in which the agents are currently set up. This allows for when a
later agent updates, e.g. a different variable will be selected and the grid agent changes, we do not
need to reload the globe or mesh agent, as the projection did not change.

In simple terms, an agent is a container for a state that notifies listeners when this state changes.
Work can then be submitted to this agent which will update its state upon completion of that work.
But the work may fail, which generally results in the error being displayed, but could also be 
listened upon.

The stitching together of the agents in done in `init` in `src/earth.js` where the agents are
connected to one another and possibly the configuration and/or models of the UI. Agents are based on
`Backbone.Events` which also defined how one can listen on an event or trigger events.

### Configuration

Most of the settings the user applies are collected in a central configuration. Each time a setting
is changed, it first gets updated in the configuration and then agents may listen on this change to
refresh themselves if they depend on this setting. Additionally, the settings get reflected in the
URL-bar of the user to come back to this visualization with the same settings as well as share it
with someone else. Notably though, it does not contain information about a local file when one was
opened by the user because the browser does not have direct access to the file system, so it could 
not pick up the file if it was sent to another user.

### UI & Models

The UI uses [Backbone.js](https://backbonejs.org/) to render & update the UI elements. As such the
UI is split into the views and models; models containing the data which the views will display. All
such components live under `src/ui/`. These are the time control, height setting, overlay (variable)
selection and scale selection. The models for each component are generally synchronized to the 
configuration in some way and usually bidirectional to handle URL updates as well as interactions.

## Extension points

### Color Scales

The color scales are configured in `src/colorscales.js`, containing a list of the ones available.
This list can be extended with more colors at any time without additional configuration. Such 
scales can be defined using a list of color values which will then be interpolated in-between. 
Please refer to the documentation inside that file for more information.

### Projections

Projections are a little more involved than color scales. They are configured in `src/globes.js`
with a mapping of their ID to a factory. Refer to the documentation in that file for more 
information of how this factory looks like. Unlike color scales, they do not get automatically
added to the UI and have to manually be added by creating a new link in the corresponding 
section in the `index.html`.

## WASM interaction

Working with WASM has gotten a lot easier since the move towards `wasm-pack` and `wasm-bindgen`.
The interface is defined in the visualize project located at `../visualize`. It generates a wrapper
for us that handles passing values back and forth as well as manging the stack and heap. When 
working with WASM there are two things we need to keep in mind:

First, the visualize project uses the sync counterparts to some async functionality, like the file 
reader and http request, and thus needs to be run in a web worker and cannot be included directly
in the page. To access the worker, messages can be passed containing predefined commands as well
as arguments for the worker, which can then send data back the same way. This is the boundary between
asynchronous and synchronous code.

Second, when requesting data from WASM in our case, we really on get a bunch of byte data that we
need to interpret properly. The type of the data depends on the variable we requested so has to
be done dynamically. Also note that the endianness of the data in netcdf files is generally big
endian. Unfortunately, this differs from the default notation on the web - being little endian -
and thus the normal typed arrays do not work with this data easily. 
