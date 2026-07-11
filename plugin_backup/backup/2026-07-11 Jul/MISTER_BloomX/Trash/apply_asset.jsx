/**
 * MisterBloomX Bridge - Asset Application Script
 * =================================================
 * WHAT IS THIS FILE?
 * This is an ExtendScript (.jsx) file — a special scripting language
 * that runs INSIDE After Effects and Premiere Pro. It acts as the
 * "bridge" between our modern React plugin panel (the UI) and the
 * actual Adobe application. Think of it as a translator who speaks
 * both "web app" language and "After Effects" language.
 *
 * WHY IS THIS SEPARATE?
 * UXP (the React panel) can show a beautiful interface, but it
 * cannot directly touch the After Effects timeline, layers, or
 * timeline properties. Only ExtendScript, using the AE DOM API,
 * can do that. So the panel tells this script WHAT to do, and
 * this script does the actual work inside AE.
 *
 * HOW IT'S CALLED:
 * The UXP frontend uses: await csInterface.evalScript(`applyAsset(${JSON.stringify(payload)})`)
 *
 * @version 0.1.0
 */

// ============================================================
// MAIN ENTRY POINT: applyAsset
// WHY: Single public function called by the UXP frontend.
// Routes to the correct handler based on asset type.
// ============================================================
function applyAsset(payloadJson) {
    // WHY: The UXP panel sends a JSON string; we parse it here
    // because ExtendScript doesn't have modern JSON.parse natively
    // in all AE versions, so we use eval carefully with a known-safe string.
    var payload;
    try {
        payload = eval("(" + payloadJson + ")");
    } catch (e) {
        return JSON.stringify({ success: false, error: "Invalid JSON payload: " + e.toString() });
    }

    var assetType = payload.type;
    var filePath  = payload.file_path;
    var assetName = payload.name;

    // WHY: Check that an appropriate item is open and a layer is selected
    // before attempting any operation, to avoid confusing AE error dialogs.
    if (!app.project.activeItem) {
        return JSON.stringify({ success: false, error: "No composition is currently open. Please open a composition first." });
    }

    try {
        if (assetType === "animation" || assetType === "effect" || assetType === "text_preset") {
            return applyFFXPreset(filePath, assetName);
        } else if (assetType === "font") {
            return applyFont(filePath, assetName, payload);
        } else if (assetType === "keyframe") {
            return applyKeyframeData(filePath, assetName);
        } else {
            return JSON.stringify({ success: false, error: "Unknown asset type: " + assetType });
        }
    } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
    }
}


// ============================================================
// HANDLER: Apply an .ffx Effect/Animation Preset
// WHY: .ffx files are After Effects' native "effect preset" format.
// They package effects, keyframes, and expressions into one file.
// applyPreset() is the official AE DOM method for applying them.
// ============================================================
function applyFFXPreset(filePath, assetName) {
    var comp = app.project.activeItem;

    // WHY: We need at least one layer selected to apply a preset to.
    if (comp.selectedLayers.length === 0) {
        return JSON.stringify({ success: false, error: "No layer selected. Please select a layer in the timeline first." });
    }

    var presetFile = new File(filePath);
    if (!presetFile.exists) {
        return JSON.stringify({ success: false, error: "Preset file not found on NAS: " + filePath });
    }

    // WHY: We apply to the FIRST selected layer. Future versions could loop
    // through all selected layers to apply the preset to each.
    var targetLayer = comp.selectedLayers[0];
    targetLayer.applyPreset(presetFile);

    return JSON.stringify({ success: true, message: "Applied preset '" + assetName + "' to layer '" + targetLayer.name + "'." });
}


// ============================================================
// HANDLER: Apply a Font to the Selected Text Layer
// WHY: Editors often want to instantly swap the font on an existing
// text layer without manually digging through the Character panel.
// This replaces the font on the selected text layer(s) in one click.
// ============================================================
function applyFont(filePath, assetName, payload) {
    var comp = app.project.activeItem;

    if (comp.selectedLayers.length === 0) {
        return JSON.stringify({ success: false, error: "No layer selected. Please select a text layer first." });
    }

    var appliedCount = 0;
    var skippedCount = 0;

    for (var i = 0; i < comp.selectedLayers.length; i++) {
        var layer = comp.selectedLayers[i];

        // WHY: Only text layers have a 'text' property. We skip any
        // non-text layers in the selection silently.
        if (layer instanceof TextLayer) {
            var textDoc = layer.property("Source Text").value;
            // WHY: fontFamily is the CSS-style name used by AE (e.g., "Inter-Bold")
            // The payload must include the exact AE font family name.
            textDoc.fontFamily = payload.font_family || assetName;
            layer.property("Source Text").setValue(textDoc);
            appliedCount++;
        } else {
            skippedCount++;
        }
    }

    if (appliedCount === 0) {
        return JSON.stringify({ success: false, error: "No text layers were selected. Font only applies to text layers." });
    }

    return JSON.stringify({
        success: true,
        message: "Applied font '" + assetName + "' to " + appliedCount + " text layer(s). " + skippedCount + " non-text layer(s) skipped."
    });
}


// ============================================================
// HANDLER: Apply Serialized Keyframe Data
// WHY: This reads a JSON payload (stored in a .json file on NAS)
// and reconstructs the keyframes on the target layer. This is
// how we "paste" saved motion data from the library onto any layer.
// The full logic lives in serialize_keyframes.jsx; this reads cached data.
// ============================================================
function applyKeyframeData(filePath, assetName) {
    var comp = app.project.activeItem;

    if (comp.selectedLayers.length === 0) {
        return JSON.stringify({ success: false, error: "No layer selected to apply keyframes to." });
    }

    // Read the JSON keyframe data file from NAS/local cache
    var dataFile = new File(filePath);
    if (!dataFile.exists) {
        return JSON.stringify({ success: false, error: "Keyframe data file not found: " + filePath });
    }

    dataFile.open("r");
    var rawJson = dataFile.read();
    dataFile.close();

    var kfData;
    try {
        kfData = eval("(" + rawJson + ")");
    } catch (e) {
        return JSON.stringify({ success: false, error: "Could not parse keyframe JSON: " + e.toString() });
    }

    // WHY: Apply to the first selected layer
    var targetLayer = comp.selectedLayers[0];
    var appliedProps = 0;

    // WHY: Loop through each saved property and reconstruct its keyframes
    for (var p = 0; p < kfData.properties.length; p++) {
        var propData = kfData.properties[p];
        var prop     = _resolveProperty(targetLayer, propData.matchName);

        if (!prop) {
            $.writeln("MisterBloomX: Property not found: " + propData.matchName + ". Skipping.");
            continue;
        }

        for (var k = 0; k < propData.keyframes.length; k++) {
            var kf = propData.keyframes[k];
            prop.setValueAtTime(kf.time, kf.value);
        }
        appliedProps++;
    }

    return JSON.stringify({
        success: true,
        message: "Applied keyframe data for '" + assetName + "'. " + appliedProps + " properties reconstructed on '" + targetLayer.name + "'."
    });
}


/**
 * WHY: A helper to find a property on a layer by its "matchName"
 * (a stable internal AE identifier that doesn't change with locale).
 * e.g., "ADBE Position" always means Position regardless of language.
 */
function _resolveProperty(layer, matchName) {
    try {
        // Most properties are directly on the layer's transform group
        var transform = layer.property("ADBE Transform Group");
        for (var i = 1; i <= transform.numProperties; i++) {
            var prop = transform.property(i);
            if (prop.matchName === matchName) return prop;
        }
    } catch (e) {}
    return null;
}
