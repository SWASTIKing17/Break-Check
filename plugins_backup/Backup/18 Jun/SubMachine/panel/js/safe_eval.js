function safeEvalScript(script, callback) {
    // 1. Try Standard CSInterface (Production or Mocked by Simulator)
    if (typeof CSInterface !== "undefined") {
        new CSInterface().evalScript(script, callback);
    } 
    // 2. Fallback for older CEP versions
    else if (window.__adobe_cep__) {
        var callbackId = window.__adobe_cep__.invokeSync("registerCallback", callback);
        var proxy = "var __cep_args = []; " +
                    "__cep_args.push('" + callbackId + "'); " +
                    "try { " +
                        "var result = eval(\"" + script.replace(/(["\\])/g, '\\$1') + "\"); " +
                        "__cep_args.push(result === undefined ? '' : result.toString()); " +
                    "} catch(e) { " +
                        "__cep_args.push('EvalScript error.'); " +
                    "} " +
                    "window.__adobe_cep__.invokeAsync('dispatchEvent', 'com.adobe.csxs.events.evalScriptCallback', JSON.stringify(__cep_args));";
        window.__adobe_cep__.evalScript(proxy);
    }
    // 3. Last Resort: Console Log (if simulator failed to load)
    else {
        console.warn("[SafeEval] No Adobe environment or Simulator detected. Script:", script);
    }
}
