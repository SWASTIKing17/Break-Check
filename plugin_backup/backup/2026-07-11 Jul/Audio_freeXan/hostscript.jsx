function importAssetToBin(filePath, binName) {
    if (!app.project) return "error: no active project";
    var fileObj = new File(filePath);
    if (!fileObj.exists) return "error: file not found";
    try {
        var targetBin = app.project.rootItem;
        if (binName) {
            for (var i = 0; i < app.project.rootItem.numItems; i++) {
                var item = app.project.rootItem.children[i];
                if (item && item.name === binName && item.type === ProjectItemType.BIN) {
                    targetBin = item;
                    break;
                }
            }
        }
        var success = app.project.importFiles([filePath], true, targetBin, false);
        return success ? "ok" : "import failed";
    } catch(e) {
        return "error: " + e.toString();
    }
}

function createBin(name) {
    if (!app.project) return "error: no active project";
    try {
        app.project.rootItem.createBin(name);
        return "ok";
    } catch(e) {
        return "error: " + e.toString();
    }
}

function createBinAtPath(pathStr, binName) {
    if (!app.project) return "error: no active project";
    var parent = app.project.rootItem;
    if (pathStr && pathStr !== "") {
        var parts = pathStr.split("|");
        for (var i = 0; i < parts.length; i++) {
            var found = false;
            for (var j = 0; j < parent.numItems; j++) {
                var item = parent.children[j];
                if (item && item.name === parts[i] && item.type === ProjectItemType.BIN) {
                    parent = item;
                    found = true;
                    break;
                }
            }
            if (!found) return "error: parent bin not found: " + parts[i];
        }
    }
    try {
        parent.createBin(binName);
        return "ok";
    } catch(e) {
        return "error: " + e.toString();
    }
}

function createSequence(name, id) {
    if (!app.project) return "error: no active project";
    try {
        app.project.createNewSequence(name, id);
        return "ok";
    } catch(e) {
        return "error: " + e.toString();
    }
}

function importAsset(filePath) {
    if (!app.project) {
        return "Error: No active project open in Premiere Pro.";
    }

    var fileObj = new File(filePath);
    if (!fileObj.exists) {
        return "Error: File not found on disk at " + filePath;
    }

    try {
        var filePaths = [filePath];
        
        // Find target bin (active folder in Premiere Project Panel)
        var targetBin = null;
        if (typeof app.project.getInsertionBin === "function") {
            targetBin = app.project.getInsertionBin();
        }
        if (!targetBin) {
            targetBin = app.project.rootItem;
        }

        // Import the file into Premiere Pro
        var importSuccess = app.project.importFiles(
            filePaths,
            true,        // suppressWarnings
            targetBin,   // target bin
            false        // importAsNumberedStills
        );

        if (importSuccess) {
            return "Successfully imported asset into Premiere Pro project.";
        } else {
            return "API call succeeded, but Premiere Pro failed to import the file.";
        }
    } catch (err) {
        return "Exception: " + err.toString();
    }
}
