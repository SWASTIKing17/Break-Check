const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const monitorScript = path.join(rootDir, 'Break Check', 'usage_monitor.py');
const binDir = path.join(rootDir, 'bin');
const buildDir = path.join(rootDir, 'build', 'pyinstaller');

console.log('Compiling usage_monitor.py into standalone executable...');

try {
    if (!fs.existsSync(binDir)) {
        fs.mkdirSync(binDir, { recursive: true });
    }

    // Run PyInstaller
    // --noconsole: hides the command prompt window
    // --onefile: packages everything into a single .exe
    const cmd = `python -m PyInstaller --noconsole --onefile --distpath "${binDir}" --workpath "${buildDir}" --specpath "${buildDir}" "${monitorScript}"`;
    
    console.log(`Executing: ${cmd}`);
    execSync(cmd, { cwd: rootDir, stdio: 'inherit' });
    
    console.log('✅ Build successful! Executable is located at: bin/usage_monitor.exe');
} catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
}
