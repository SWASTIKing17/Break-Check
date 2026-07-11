/**
 * freeXan Caption - Property Dictionary
 * maps abstract keys to possible MOGRT display names for robust property access.
 */

var SM_PROP = {
    // --- CORE ---
    TEXT:           ["\u24c9 Text Input", "Ⓢ Text Input", "Text Input", "Text", "Ⓣ Text Input"],
    PROGRESSION:    ["\u24c9 Word Progression", "Ⓢ Word Progression", "Word Progression", "Ⓣ Word Progression"],
    SOURCE_TEXT:    ["\u24c9 Source Text", "Source Text"],

    // --- COLORS ---
    FILL_COLOR:     ["Fill Color", "Main Fill", "Color"],
    STROKE_COLOR:   ["Stroke", "Stroke Color", "Outline"],
    SHADOW_COLOR:   ["Shadow Color", "Drop Shadow Color"],
    HIGHLIGHT_FILL: ["Fill", "Highlight Color"],
    HIGHLIGHT_STRK: ["Stroke", "Highlight Stroke"],

    // --- SETTINGS ---
    STROKE_WIDTH:   ["Stroke Width", "Outline Width"],
    OPACITY:        ["Opacity", "Global Opacity"],
    DISTANCE:       ["Distance", "Shadow Distance"],
    SOFTNESS:       ["Softness", "Shadow Softness"],
    UNSPOKEN_OPC:   ["Unspoken Word Opacity", "Idle Opacity"],

    // --- TRANSFORM ---
    MGT_POSITION:   ["Position", "Mgt Position"],
    MGT_SCALE:      ["Scale", "Mgt Scale"],
    MGT_ROTATION:   ["Rotation", "Mgt Rotation"],

    // --- ANIMATION & LAYOUT ---
    ANIM_SLIDE_IN:  ["Slide In", "Animation Toggle"],
    BREAK_INDEX:    ["Index", "Line Break Index"],
    ALIGN_X:        ["Alignment X", "Horizontal Align"],
    ALIGN_Y:        ["Alignment Y", "Vertical Align"]
};

/**
 * Finds a MOGRT property by its dictionary key.
 * Now supports path arrays defined in SM_PROP for robust group targeting.
 * @param {Component} mgt - The MOGRT component.
 * @param {string} key - The SM_PROP key.
 * @returns {ComponentParam|null}
 */
function getSMProperty(mgt, key) {
    if (!mgt || !mgt.properties) return null;
    var names = SM_PROP[key];
    if (!names) return null;

    for (var i = 0; i < names.length; i++) {
        var lookup = names[i];
        
        if (lookup instanceof Array) {
            // It's a precise group path (e.g., ["Color & Style", "Fill Color"])
            var prop = resolveGroupPath(mgt, lookup);
            if (prop) return prop;
        } else {
            // It's a legacy flat string (e.g., "Fill Color")
            var prop = mgt.properties.getParamForDisplayName(lookup);
            if (prop) return prop;
        }
    }
    return null;
}
