/**
 * MisterBloomX Bridge - Keyframe Serializer / Deserializer
 * =========================================================
 * WHAT IS THIS FILE?
 * This ExtendScript handles "copy/pasting" complex keyframe data.
 * It has two modes:
 *   1. SERIALIZE (Save): Reads keyframes from a selected layer and
 *      converts them into a portable JSON format stored on the NAS.
 *   2. DESERIALIZE (Apply): Reads that JSON file and rebuilds the
 *      keyframes onto a different target layer.
 *
 * WHY STORE AS JSON?
 * After Effects presets (.ffx) are binary and can't be easily
 * edited or inspected. By storing keyframe math as JSON (just plain
 * numbers), we can display a preview, edit values programmatically,
 * and apply them cross-project without any compatibility risks.
 *
 * Real-world analogy: Instead of photocopying a score sheet,
 * we write the musical notes in text. Anyone can read and replay them.
 *
 * @version 0.1.0
 */


// ============================================================
// PUBLIC FUNCTION: serializeSelectedKeyframes
// WHY: Called by the UXP panel when an editor presses "Save Keyframes".
// Loops through selected layer properties, extracts all keyframe data,
// and saves it as a .json file on the NAS.
// ============================================================
function serializeSelectedKeyframes(outputPathJson) {
    var outputPath;
    try {
        var opts = eval("(" + outputPathJson + ")");
        outputPath = opts.output_path;  // Full NAS path for the output .json file
    } catch (e) {
        return JSON.stringify({ success: false, error: "Invalid options JSON: " + e.toString() });
    }

    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
        return JSON.stringify({ success: false, error: "No composition open." });
    }
    if (comp.selectedLayers.length === 0) {
        return JSON.stringify({ success: false, error: "No layer selected. Select a layer to save keyframes from." });
    }

    var sourceLayer = comp.selectedLayers[0];
    var result = {
        layer_name:  sourceLayer.name,
        layer_type:  sourceLayer.matchName,
        ae_version:  app.version,
        properties:  []
    };

    // WHY: We focus on the Transform group as it contains the most
    // commonly saved properties (Position, Scale, Rotation, Opacity).
    // Future: extend to effects and text animators.
    var groups = ["ADBE Transform Group", "ADBE Effect Parade"];

    for (var g = 0; g < groups.length; g++) {
        var group;
        try {
            group = sourceLayer.property(groups[g]);
        } catch (e) {
            continue;  // Some layers don't have all groups
        }
        if (!group) continue;

        for (var i = 1; i <= group.numProperties; i++) {
            var prop = group.property(i);
            if (!prop || prop.numKeys === 0) continue; // Skip properties with no keyframes

            var kfList = [];
            for (var k = 1; k <= prop.numKeys; k++) {
                // WHY: We extract both the VALUE and the interpolation type
                // (linear, ease, etc.) so the reconstructed animation looks identical.
                var keyframe = {
                    time:          prop.keyTime(k),
                    value:         _serializeValue(prop.keyValue(k)),
                    in_type:       prop.keyInInterpolationType(k),
                    out_type:      prop.keyOutInterpolationType(k),
                };

                // WHY: Bezier easing is defined by "influence" tangent handles.
                // We capture these so smooth easing curves are preserved exactly.
                try {
                    var inEase  = prop.keyInTemporalEase(k);
                    var outEase = prop.keyOutTemporalEase(k);
                    keyframe.in_ease  = _serializeEase(inEase);
                    keyframe.out_ease = _serializeEase(outEase);
                } catch (easeErr) {
                    // Some properties don't support temporal ease; that's fine.
                }

                kfList.push(keyframe);
            }

            result.properties.push({
                matchName:    prop.matchName,
                display_name: prop.name,
                keyframes:    kfList
            });
        }
    }

    // Write the JSON to the output file path
    var outputFile = new File(outputPath);
    outputFile.open("w");
    outputFile.write(JSON.stringify(result, null, 2));
    outputFile.close();

    return JSON.stringify({
        success: true,
        message: "Saved " + result.properties.length + " properties from '" + sourceLayer.name + "'.",
        output_path: outputPath
    });
}


/**
 * WHY: AE property values can be simple numbers, arrays [x,y,z],
 * or color objects. This helper converts them all to a plain
 * JS value that JSON can safely stringify.
 */
function _serializeValue(value) {
    if (value instanceof Array) {
        var out = [];
        for (var i = 0; i < value.length; i++) out.push(value[i]);
        return out;
    }
    return value;
}

/**
 * WHY: TemporalEase objects contain speed and influence values for
 * the bezier handle of an easing curve. We convert to plain objects.
 */
function _serializeEase(easeArray) {
    var result = [];
    for (var i = 0; i < easeArray.length; i++) {
        result.push({
            speed:     easeArray[i].speed,
            influence: easeArray[i].influence
        });
    }
    return result;
}
