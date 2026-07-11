function CSInterface() {}

CSInterface.prototype.evalScript = function(script, callback) {
    if (window.__adobe_cep__) {
        window.__adobe_cep__.evalScript(script, callback);
    } else {
        if (typeof callback === 'function') {
            callback("Error: window.__adobe_cep__ is undefined");
        }
    }
};
