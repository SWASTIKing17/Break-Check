const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
    page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure().errorText));
    
    await page.goto('https://break-check.netlify.app/#flow', { waitUntil: 'networkidle0' });
    
    // Select a different profile
    try {
        await page.select('#employeeSelect', 'Swastik Bunker');
        await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
        console.log("Could not select profile", e);
    }
    
    await browser.close();
})();
