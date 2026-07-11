const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { app } = require('electron');
const log = require('electron-log');

let logsDir = null;
const sessionId = crypto.randomUUID();
let adobeVer = 'unknown';

function initLogger() {
    if (!logsDir) {
        logsDir = path.join(app.getPath('userData'), 'logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
    }
}

// Ensure logs dir exists
if (app.isReady()) {
    initLogger();
} else {
    app.once('ready', initLogger);
}

// Configure electron-log v5 transports
const mainFileLogger = log.create({ logId: 'main' });
mainFileLogger.transports.file.resolvePathFn = () => path.join(app.getPath('userData'), 'logs', 'main.log');
mainFileLogger.transports.file.maxSize = 5 * 1024 * 1024; // 5 MB
mainFileLogger.transports.file.format = '{text}';
mainFileLogger.transports.console.level = false;

const rendererFileLogger = log.create({ logId: 'renderer' });
rendererFileLogger.transports.file.resolvePathFn = () => path.join(app.getPath('userData'), 'logs', 'renderer.log');
rendererFileLogger.transports.file.maxSize = 5 * 1024 * 1024; // 5 MB
rendererFileLogger.transports.file.format = '{text}';
rendererFileLogger.transports.console.level = false;

function setAdobeVer(ver) {
    if (ver) adobeVer = ver;
}

function getSystemContext() {
    return {
        sessionId,
        build: app.getVersion(),
        os: `${os.type()} ${os.release()}`,
        ramMb: Math.round(os.totalmem() / 1024 / 1024),
        freeRamMb: Math.round(os.freemem() / 1024 / 1024),
        cpuCores: os.cpus() ? os.cpus().length : 'unknown',
        adobeVer,
        pid: process.pid
    };
}

/**
 * Universal Event Schema Generator
 */
function buildLogEvent({ level = 'info', source = 'electron-main', correlationId = null, event = 'log', durationMs = null, payload = {}, error = null }) {
    const sys = getSystemContext();
    const obj = {
        ts: new Date().toISOString(),
        level: level.toLowerCase(),
        source,
        correlationId: correlationId || crypto.randomUUID(),
        sessionId: sys.sessionId,
        pid: sys.pid,
        build: sys.build,
        os: sys.os,
        adobeVer: sys.adobeVer,
        event,
        durationMs: durationMs !== undefined ? durationMs : null,
        payload: payload || {}
    };
    if (error) {
        obj.error = {
            message: error.message || String(error),
            stack: error.stack || null,
            code: error.code || null
        };
    }
    return obj;
}

/**
 * Send structured NDJSON log line
 */
function sendLog(level = 'info', event = 'log', source = 'electron-main', correlationId = null, payload = {}, durationMs = null, error = null) {
    initLogger();
    const evtObj = buildLogEvent({ level, source, correlationId, event, durationMs, payload, error });
    const line = JSON.stringify(evtObj);
    
    // Console output for dev
    console.log(`[${level.toUpperCase()}] [${source}] [${event}]`, payload || error || '');

    if (source === 'electron-renderer' || source === 'preload' || source === 'ui') {
        rendererFileLogger.info(line);
    } else {
        const method = (level === 'fatal' || level === 'error') ? 'error' : (level === 'warn' ? 'warn' : 'info');
        mainFileLogger[method](line);
    }
}

/**
 * Legacy wrapper for backwards compatibility
 */
function createLogger(componentName) {
    initLogger();
    return function (...args) {
        const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
        sendLog('debug', `${componentName}:log`, 'electron-main', null, { component: componentName, message });
    };
}

module.exports = {
    createLogger,
    sendLog,
    buildLogEvent,
    setAdobeVer,
    getSystemContext,
    getSessionId: () => sessionId,
    getLogsDir: () => logsDir,
    flushLogs: () => {
        try {
            mainFileLogger.transports.file.flush();
            rendererFileLogger.transports.file.flush();
        } catch(e) {}
    }
};
