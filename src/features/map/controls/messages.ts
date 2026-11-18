import type { Messages } from "@/lib/i18n";

export const messages = {
  en: {
    // dock
    "dock.home": "Home", "dock.map": "Map", "dock.layers": "Layers", "dock.customize": "Customize",
    "dock.places": "Places", "dock.tools": "Tools", "dock.theme": "Theme", "dock.label": "Map tools",
    close: "Close",
    // zoom
    zoom: "Zoom", zoomIn: "Zoom in", zoomOut: "Zoom out", zoomSlider: "Map zoom",
    resetNorth: "Reset north", fullscreen: "Full screen", exitFullscreen: "Exit full screen",
    // layers
    mapType: "Map type", overlays: "Layers",
    "base.street": "Street", "base.felt": "Felt-style", "base.dark": "Dark", "base.3d": "3D",
    "base.satellite": "Satellite", "base.terrain": "Terrain",
    "ov.crowd": "Crowd levels", "ov.alerts": "Alerts", "ov.saved": "Your markers and drawings", "ov.labels": "Labels",
    "ov.buildings": "Buildings", "ov.contours": "Terrain contours", "ov.traffic": "Traffic",
    needsKey: "Needs a MapTiler key",
    trafficUnavailable: "Traffic data unavailable",
    "3dHint": "Drag with two fingers or right-click to tilt and turn.",
    // customize
    palette: "Colours", "palette.light": "Light", "palette.dark": "Dark", "palette.sepia": "Sepia", "palette.contrast": "High contrast",
    labelSize: "Label size", markerSize: "Crowd dot size", crowdOpacity: "Crowd dots opacity", contoursOpacity: "Contours opacity",
    drawColor: "Marker and drawing colour", lineWidth: "Line width", reset: "Reset to default", saveStyle: "Save this style",
    saved: "Saved for this browser.", resetDone: "Back to the default style.",
    // places
    yourMarkers: "Your markers", noMarkers: "Click anywhere on the map to drop a marker.",
    markerHere: "Add a marker here", name: "Name", color: "Colour", save: "Save", cancel: "Cancel", delete: "Delete",
    open: "Open", openOsm: "Open in OpenStreetMap", unnamed: "Unnamed marker", markersNote: "Markers and drawings stay in this browser.",
    savedPlaces: "Saved places", savedLink: "Starred places and alerts are on the Saved page.",
    // tools
    measure: "Measure distance", measureHint: "Click points on the map. Total:", measureDone: "Done", clear: "Clear",
    draw: "Draw", "draw.point": "Point", "draw.line": "Line", "draw.area": "Area",
    drawHint: "Click to add points.", finish: "Finish", shapes: "Your drawings", noShapes: "Nothing drawn yet.",
    export: "Export as PNG", share: "Copy share link", copied: "Link copied.", print: "Print view",
    shortcuts: "Keyboard shortcuts",
    "key.zoom": "Zoom in and out", "key.pan": "Move the map", "key.esc": "Close panels", "key.help": "Show this list",
    "key.layers": "Layers", "key.tools": "Tools",
  },
  hi: {
    "dock.home": "होम", "dock.map": "नक्शा", "dock.layers": "परतें", "dock.customize": "रूप बदलें",
    "dock.places": "जगहें", "dock.tools": "टूल", "dock.theme": "थीम",
    zoom: "ज़ूम", "base.street": "सड़क", "base.dark": "डार्क", "base.satellite": "सैटेलाइट", "base.terrain": "भू-भाग",
    "ov.crowd": "भीड़ का स्तर", "ov.alerts": "अलर्ट", "ov.labels": "नाम", "ov.buildings": "इमारतें", "ov.traffic": "ट्रैफ़िक",
    save: "सहेजें", cancel: "रद्द करें", delete: "हटाएँ", close: "बंद करें",
  },
} satisfies Messages;
