function probe(obj, path, depth) {
  if (depth > 3) return;
  for (var prop in obj) {
    try {
      if (prop.toLowerCase().indexOf("undo") !== -1) {
        $.writeln("FOUND: " + path + "." + prop + " (type: " + typeof obj[prop] + ")");
      }
      if (typeof obj[prop] === "object" && obj[prop] !== null && prop !== "parent" && prop !== "properties") {
        probe(obj[prop], path + "." + prop, depth + 1);
      }
    } catch(e) {}
  }
}

$.writeln("--- UNDO PROBE START ---");
probe(app, "app", 0);
$.writeln("--- UNDO PROBE END ---");
