// Mocking Premiere's MOGRT Property Object
class MockProp {
    constructor(valType, val, colorVal = null) {
        this.propertyValueType = valType;
        this.val = val;
        this.colorVal = colorVal;
    }
    getValue() { return this.val; }
    getColorValue() { return this.colorVal; }
}

// 1. Safely extract the current value
function _getNormalizedMogrtValue(prop) {
    if (prop.propertyValueType === 6 || prop.propertyValueType === 2 || prop.propertyValueType === 3) {
        try {
            var rawColor = prop.getColorValue ? prop.getColorValue() : null;
            if (rawColor && rawColor.length === 4) return [rawColor[0], rawColor[1], rawColor[2], rawColor[3]];
            if (typeof rawColor === 'string' && rawColor.charAt(0) === '{') {
                var cObj = JSON.parse(rawColor);
                return [cObj.alpha || 255, cObj.red || 0, cObj.green || 0, cObj.blue || 0];
            }
        } catch (e) { }
    }
    
    let v = prop.getValue();
    
    // Sometimes colors are returned as raw JSON strings in getValue
    if (typeof v === 'string' && v.charAt(0) === '{') {
        try {
            var cObj = JSON.parse(v);
            if (cObj.alpha !== undefined && cObj.red !== undefined) {
                 return [cObj.alpha || 255, cObj.red || 0, cObj.green || 0, cObj.blue || 0];
            }
        } catch(e) {}
    }
    return v;
}

// 2. Safely compare arrays (colors, points) and primitives
function _areMogrtValuesEqual(v1, v2) {
    // If both are arrays
    if (v1 instanceof Array && v2 instanceof Array) {
        if (v1.length !== v2.length) return false;
        for (var i = 0; i < v1.length; i++) {
            if (Math.abs(v1[i] - v2[i]) > 0.001) return false; // Float-safe comparison
        }
        return true;
    }
    
    // If one is array and other is JSON string representing the same color
    if (v1 instanceof Array && typeof v2 === 'string' && v2.charAt(0) === '{') {
        try {
            let o = JSON.parse(v2);
            let a2 = [o.alpha||255, o.red||0, o.green||0, o.blue||0];
            return _areMogrtValuesEqual(v1, a2);
        } catch(e){}
    }
    if (v2 instanceof Array && typeof v1 === 'string' && v1.charAt(0) === '{') {
        try {
            let o = JSON.parse(v1);
            let a1 = [o.alpha||255, o.red||0, o.green||0, o.blue||0];
            return _areMogrtValuesEqual(a1, v2);
        } catch(e){}
    }

    return v1 === v2;
}

// ==========================================
// TEST RUNNER
// ==========================================
const tests = [
    {
        name: "Slider (Number) - Match",
        prop: new MockProp(2, 45.5),
        variationValue: 45.5,
        expect: true
    },
    {
        name: "Slider (Number) - Diff",
        prop: new MockProp(2, 45.5),
        variationValue: 45.6,
        expect: false
    },
    {
        name: "Checkbox (Boolean) - Match",
        prop: new MockProp(5, true),
        variationValue: true,
        expect: true
    },
    {
        name: "Checkbox (Boolean) - Diff",
        prop: new MockProp(5, true),
        variationValue: false,
        expect: false
    },
    {
        name: "Color Array (Type 6) - Match",
        prop: new MockProp(6, null, [255, 128, 0, 255]),
        variationValue: [255, 128, 0, 255],
        expect: true
    },
    {
        name: "Color Array (Type 6) - Float Diff Match",
        prop: new MockProp(6, null, [255.0001, 128, 0, 255]),
        variationValue: [255, 128, 0, 255],
        expect: true // Float safe
    },
    {
        name: "Color Array (Type 6) - Diff",
        prop: new MockProp(6, null, [255, 128, 0, 255]),
        variationValue: [255, 0, 0, 255],
        expect: false
    },
    {
        name: "Color JSON String (Type 6) - Match Array",
        prop: new MockProp(6, '{"alpha":255,"red":128,"green":64,"blue":0}'),
        variationValue: [255, 128, 64, 0],
        expect: true
    },
    {
        name: "Text String - Match",
        prop: new MockProp(4, "Hello World"),
        variationValue: "Hello World",
        expect: true
    },
    {
        name: "Text String - Diff",
        prop: new MockProp(4, "Hello World"),
        variationValue: "hello world",
        expect: false
    }
];

let passed = 0;
tests.forEach(t => {
    let extracted = _getNormalizedMogrtValue(t.prop);
    let result = _areMogrtValuesEqual(extracted, t.variationValue);
    let ok = result === t.expect;
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${t.name}`);
    if (!ok) {
        console.log(`   Extracted:`, extracted);
        console.log(`   Variation:`, t.variationValue);
        console.log(`   Expected Equal?: ${t.expect}, Got: ${result}`);
    } else {
        passed++;
    }
});
console.log(`\nTests Passed: ${passed} / ${tests.length}`);
