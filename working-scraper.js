const puppeteer = require('puppeteer');
const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');

console.log('🚀 Startar Eprolo Scraper - HELT AUTOMATISK PAGINERING');
console.log('📋 Skriptet klickar automatiskt på sidnummer (1, 2, 3, 4, 5...) utan manuell inblandning');
console.log('🔄 Navigering sker genom programmatiska klick på pagineringsnumren');

// Fil för att spåra importerade sidor
const IMPORTED_PAGES_FILE = path.join(__dirname, 'imported-pages.json');

// Läs in redan importerade sidor
function loadImportedPages() {
    try {
        if (fs.existsSync(IMPORTED_PAGES_FILE)) {
            const data = fs.readFileSync(IMPORTED_PAGES_FILE, 'utf8');
            const imported = JSON.parse(data);
            console.log(`📋 Laddade ${imported.pages.length} redan importerade sidor från fil`);
            return new Set(imported.pages);
        }
    } catch (error) {
        console.log(`⚠️ Kunde inte läsa importerade sidor: ${error.message}`);
    }
    return new Set();
}

// Spara importerade sidor
function saveImportedPages(importedPages) {
    try {
        const data = {
            lastUpdated: new Date().toISOString(),
            pages: Array.from(importedPages).sort((a, b) => a - b)
        };
        fs.writeFileSync(IMPORTED_PAGES_FILE, JSON.stringify(data, null, 2), 'utf8');
        console.log(`💾 Sparade ${data.pages.length} importerade sidor till fil`);
    } catch (error) {
        console.log(`⚠️ Kunde inte spara importerade sidor: ${error.message}`);
    }
}

// NY ENKEL PAGINERING: Klicka på sidnummer 1, 2, 3, 4, 5 osv.
// Efter varje 20 produkter importeras, går vi till nästa sidnummer
async function goToNextPage(page, currentPageNumber) {
    const targetPage = currentPageNumber + 1;
    console.log(`\n🎯 === NAVIGERAR TILL SIDA ${targetPage} ===`);
    
    // Scrolla ner för att visa pagineringen
    console.log('📜 Scrollar ner för att visa paginering...');
    await page.evaluate(async () => {
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise(r => setTimeout(r, 2000));
    });
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Vänta på att pagination är synlig
    console.log('⏳ Väntar på pagination...');
    await page.waitForFunction(() => {
        // GENERISK PAGINERINGSDETEKTOR: Hitta alla element som kan vara pagination
        const paginationSelectors = [
            '[class*="pagination"]', '.pagination', 
            '.page-numbers', '.pagination-numbers',
            '[role="navigation"]', '[role="tablist"]',
            'nav', '.pager', '.pages'
        ];
        
        let pagination = null;
        for (const selector of paginationSelectors) {
            pagination = document.querySelector(selector);
            if (pagination && pagination.offsetParent !== null) break;
        }
        
        if (!pagination || pagination.offsetParent === null) return false;
        
        // Leta efter siffror i pagination
        const pageItems = pagination.querySelectorAll('li, a, button, span, div');
        for (const item of pageItems) {
            const text = item.textContent.trim();
            // Matcha endast ensamma siffror (inte "Total 191569")
            if (/^\d+$/.test(text) && parseInt(text) > 0 && parseInt(text) < 10000) return true;
        }
        return false;
    }, { timeout: 15000 }).catch(() => {
        console.log('⚠️ Pagination timeout');
        return false;
    });
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Klicka på sidnumret
    console.log(`🖱️ Klickar på sidnummer ${targetPage}...`);
    const clickResult = await page.evaluate((target) => {
        // Hjälpfunktion för att hitta pagination
        const findPagination = () => {
            const selectors = [
                '[class*="pagination"]', '.pagination', '.page-numbers', 
                '.pagination-numbers', '[role="navigation"]', '.pager', '.pages'
            ];
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el && el.offsetParent !== null) return el;
            }
            return null;
        };
        
        const pagination = findPagination();
        if (!pagination) {
            return { success: false, reason: 'Ingen pagination hittades' };
        }
        
        console.log('🔍 DEBUG: Pagination element hittad:', pagination.className);
        
        const targetStr = String(target);
        
        // Strategi 1: Leta efter element som innehåller exakt sidnummer
        const paginationItems = pagination.querySelectorAll('li, a, button, span, div');
        console.log(`🔍 DEBUG: Hittade ${paginationItems.length} element i pagination`);
        
        for (const item of paginationItems) {
            const text = item.textContent.trim();
            
            // Matcha exakt sidnummer (inte "Total 191569" eller andra texter)
            if (text === targetStr && /^\d+$/.test(text)) {
                const clickable = item.querySelector('a, button') || item;
                console.log(`✅ DEBUG: Hittade matchande element för sida ${target}`);
                
                // Scrolla till elementet
                clickable.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                // Simulera klick
                ['mousedown', 'mouseup', 'click'].forEach(eventType => {
                    const event = new MouseEvent(eventType, {
                        view: window,
                        bubbles: true,
                        cancelable: true
                    });
                    clickable.dispatchEvent(event);
                });
                
                console.log(`✅ Klickade på sidnummer ${target}`);
                return { success: true, clickedPage: target };
            }
        }
        
        console.log(`❌ DEBUG: Kunde inte hitta sidnummer ${target} i pagination`);
        return { success: false, reason: `Sidnummer ${target} hittades inte i pagination` };
    }, targetPage);
    
    if (!clickResult.success) {
        console.log(`❌ Kunde inte klicka på sidnummer: ${clickResult.reason}`);
        return { success: false, reason: clickResult.reason };
    }
    
    // Vänta på att nya produkter laddas
    console.log('⏳ Väntar på att nya produkter laddas...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Vänta på att produktlistan uppdateras
    await page.waitForFunction((expectedPage) => {
        // Hjälpfunktion för att hitta pagination
        const findPagination = () => {
            const selectors = [
                '[class*="pagination"]', '.pagination', '.page-numbers', 
                '.pagination-numbers', '[role="navigation"]', '.pager', '.pages'
            ];
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el && el.offsetParent !== null) return el;
            }
            return null;
        };
        
        const pagination = findPagination();
        if (!pagination) return false;
        
        // Leta efter aktivt sidnummer (element med "active" klass eller markerad stil)
        const activeItem = pagination.querySelector(
            '[class*="active"], [class*="current"], [class*="selected"], [aria-current="true"], .active'
        );
        return activeItem && activeItem.textContent.trim() === String(expectedPage);
    }, { timeout: 10000 }, targetPage).catch(() => {
        console.log('⚠️ Timeout vid verifiering');
    });
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Verifiera att vi är på rätt sida
    const verifiedPage = await page.evaluate(() => {
        // Hitta aktivt sidnummer med generisk sökning
        const activeItem = document.querySelector(
            '[class*="pagination"] [class*="active"], [class*="pagination"] [class*="current"], .active, [aria-current="true"]'
        );
        if (activeItem) {
            const text = activeItem.textContent.trim();
            // Kontrollera att det är ett nummer
            if (/^\d+$/.test(text)) {
                return parseInt(text);
            }
        }
        return null;
    });
    
    if (verifiedPage === targetPage) {
        console.log(`✅ ✅ ✅ LYCKADES: Nu på sida ${targetPage} ✅ ✅ ✅`);
        return { success: true, page: targetPage };
    } else {
        console.log(`⚠️ Förväntade sida ${targetPage} men är på sida ${verifiedPage}`);
        return { success: false, page: verifiedPage };
    }
}

async function runScraper() {
    let browser = null;
    let dbClient = null;
    
    try {
        // Databas setup
        console.log('📊 Ansluter till databas...');
        dbClient = createClient({
            url: 'libsql://dostar-dostar.aws-ap-northeast-1.turso.io',
            authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzM5Mzc0NzIsImlkIjoiMDE5Y2QzN2QtYzYwMS03YWVjLTljMjctMzY0MmE2ZjA0YjIyIiwicmlkIjoiNzg3ZmQwMjYtZDk5OS00ZTM3LThiZjctODBlYmU2NGViYzRjIn0.mCRJdBnTFvhdvGyO4lmKEo0ExuCnl_wQo9soyKYrzjPOm09s06gUSPdP-yWU-e9SYmPYrgHaBBkEqx1ojNkWDg'
        });
        
        await dbClient.execute('SELECT 1');
        console.log('✅ Databas ansluten');
        
        // Skapa Eprolo-tabellen om den inte finns
        await dbClient.execute(`
            CREATE TABLE IF NOT EXISTS Eprolo (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                namn TEXT,
                Image TEXT,
                video TEXT,
                price TEXT,
                color TEXT,
                size TEXT,
                sku TEXT UNIQUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        console.log('✅ Eprolo-tabell skapad/verifierad');
        
        // Kontrollera befintliga kolumner i Eprolo-tabellen
        const tableInfo = await dbClient.execute('PRAGMA table_info(Eprolo)');
        console.log('✅ Befintliga kolumner i Eprolo-tabellen:');
        tableInfo.rows.forEach(row => console.log(`   - ${row.name} (${row.type})`));
        
        // Skapa index för snabbare dubbletthantering
        await dbClient.execute(`CREATE INDEX IF NOT EXISTS idx_sku ON Eprolo(sku)`);
        
        console.log('✅ Databas och tabeller konfigurerade med dubblettskydd');
        
        // Webbläsare setup - synlig webbläsare med full skärmstorlek
        console.log('🌐 Startar synlig webbläsare...');
        browser = await puppeteer.launch({
            headless: false, // Synlig webbläsare
            defaultViewport: null, // KRITISK FIX: null = använd faktisk fönsterstorlek, ingen begränsning
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security',
                '--disable-dev-shm-usage',
                '--no-first-run',
                '--no-default-browser-check',
                '--start-maximized', // Maximera fönstret för full skärmstorlek
                '--window-size=1920,1080', // Sätt explicit fönsterstorlek
                '--disable-background-timer-throttling',
                '--disable-renderer-backgrounding',
                '--disable-backgrounding-occluded-windows',
                '--disable-features=IsolateOrigins,site-per-process' // Förbättrar rendering
            ]
        });
        
        // Hjälpfunktion för att konfigurera en sida
        const setupPage = async (pg) => {
            await pg.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            await pg.setRequestInterception(true);
            pg.on('request', (req) => {
                const resourceType = req.resourceType();
                if (resourceType === 'other' && (req.url().includes('analytics') || req.url().includes('ads'))) {
                    req.abort();
                } else {
                    req.continue();
                }
            });
            
            await pg.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined,
                });
                
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [1, 2, 3, 4, 5],
                });
                
                Object.defineProperty(navigator, 'languages', {
                    get: () => ['sv-SE', 'sv', 'en-US', 'en'],
                });
                
                delete navigator.__proto__.webdriver;
                
                window.open = function() {
                    console.log('window.open blockerad - använder samma fönster');
                    return window;
                };
                
                document.addEventListener('click', function(e) {
                    const target = e.target.closest('a');
                    if (target && (target.target === '_blank' || target.target === '_new')) {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('Blockerade länk som skulle öppna nytt fönster:', target.href);
                    }
                }, true);
            });
        };
        
        // ANVÄND ENDAST EN FLIK för både katalog och produktdetaljer
        const page = await browser.newPage();
        
        // Konfigurera sidan
        await setupPage(page);
        
        // Stäng alla andra flikar/sidor som kan ha öppnats
        const pages = await browser.pages();
        for (let i = 0; i < pages.length; i++) {
            if (pages[i] !== page) {
                await pages[i].close();
            }
        }
        
        // Lyssna på nya sidor som skapas och stäng dem omedelbart
        browser.on('targetcreated', async (target) => {
            if (target.type() === 'page') {
                const newPage = await target.page();
                if (newPage && newPage !== page) {
                    console.log('⚠️ Nytt fönster detekterat och stängs omedelbart');
                    await newPage.close();
                }
            }
        });
        
        console.log('✅ Synlig webbläsare startad');
        
        // Navigera till Eprolo produktkatalog
        console.log('📦 Navigerar till Eprolo produktkatalog...');
        await page.goto('https://eprolo.com/app/newProductsCatalog.html?waretypeid=24', { 
            waitUntil: 'networkidle0',
            timeout: 60000 
        });
        
        // Vänta på att sidan laddar helt
        console.log('⏳ Väntar på att Eprolo-sidan laddar...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // Kontrollera om inloggning krävs och försök automatisk hantering
        const needsLogin = await page.evaluate(() => {
            return document.body.textContent.includes('login') || 
                   document.body.textContent.includes('sign in') ||
                   document.querySelector('input[type="password"]') !== null;
        });
        
        if (needsLogin) {
            console.log('🔐 Inloggning krävs - försöker automatisk hantering...');
            
            // Försök hitta och fylla i inloggningsformulär automatiskt
            try {
                const loginHandled = await page.evaluate(() => {
                    // Leta efter vanliga inloggningsformulär
                    const emailInput = document.querySelector('input[type="email"], input[name="email"], input[placeholder*="email"]');
                    const passwordInput = document.querySelector('input[type="password"]');
                    const loginButtonCandidates = document.querySelectorAll('button[type="submit"], input[type="submit"], button');
                    const loginButton = Array.from(loginButtonCandidates).find(btn => {
                        const text = (btn.textContent || btn.value || '').toLowerCase();
                        return text.includes('login') || text.includes('sign in') || text.includes('log in');
                    }) || null;
                    
                    if (emailInput && passwordInput) {
                        // Använd testuppgifter eller försök gästläge
                        emailInput.value = 'test@example.com';
                        passwordInput.value = 'testpassword';
                        
                        if (loginButton) {
                            loginButton.click();
                            return true;
                        }
                    }
                    
                    // Leta efter "Fortsätt som gäst" eller liknande
                    const guestCandidates = document.querySelectorAll('button, a');
                    const guestButton = Array.from(guestCandidates).find(el => {
                        const text = (el.textContent || '').toLowerCase();
                        return text.includes('guest') || text.includes('continue') || text.includes('skip');
                    }) || null;
                    if (guestButton) {
                        guestButton.click();
                        return true;
                    }
                    
                    return false;
                });
                
                if (loginHandled) {
                    console.log('✅ Automatisk inloggning/gästläge aktiverat');
                    await new Promise(resolve => setTimeout(resolve, 5000));
                } else {
                    console.log('⚠️ Kunde inte hantera inloggning automatiskt - fortsätter ändå...');
                }
            } catch (loginError) {
                console.log('⚠️ Fel vid automatisk inloggning - fortsätter ändå...', loginError.message);
            }
        }
        
        // Ladda redan importerade sidor
        const importedPages = loadImportedPages();
        console.log(`📋 Importerade sidor från tidigare körningar: ${Array.from(importedPages).sort((a, b) => a - b).join(', ') || 'Inga'}`);
        
        // (Gamla funktioner borttagna - ersatta med findNextPageToImport ovan)
        
        // FÖRBÄTTRAD FUNKTION: Hitta nästa sida att importera
        const findNextPageToImport = () => {
            console.log('\n🔍 === HITTAR NÄSTA SIDA ATT IMPORTERA ===');
            
            if (importedPages.size === 0) {
                console.log('✅ Inga tidigare importerade sidor - startar från sida 1');
                return 1;
            }
            
            const sortedPages = Array.from(importedPages).sort((a, b) => a - b);
            console.log(`📋 Tidigare importerade sidor: ${sortedPages.join(', ')}`);
            
            // Hitta första gapet i sekvensen
            for (let expectedPage = 1; expectedPage <= sortedPages[sortedPages.length - 1]; expectedPage++) {
                if (!importedPages.has(expectedPage)) {
                    console.log(`🔍 GAP UPPTÄCKT: Sida ${expectedPage} saknas i sekvensen`);
                    console.log(`🎯 Återgår till sida ${expectedPage}`);
                    return expectedPage;
                }
            }
            
            // Inga gap hittades, fortsätt efter sista importerade sidan
            const nextPage = sortedPages[sortedPages.length - 1] + 1;
            console.log(`✅ Inga gap i sekvensen - fortsätter från sida ${nextPage}`);
            return nextPage;
        };
        
        // Hitta nästa oimporterade sida att börja från
        let currentPage = 1; // ALLTID STARTA FRÅN SIDA 1
        console.log(`🚀 Startar sekventiell paginering från sida ${currentPage}`);
        
        let totalProducts = 0;
        let processedProductsOnCurrentPage = new Set(); // Håll koll på bearbetade produkter per sida
        let productsSinceLastCatalogReturn = 0; // Räknare för produkter sedan senaste återgång till katalog
        let newlyImportedPages = new Set(); // Håll koll på nyimporterade sidor i denna körning
        let maxPageNumber = null; // Spara det högsta sidnumret vi hittar
        const TOTAL_EXPECTED_PRODUCTS = 191569; // Totalt antal produkter att importera
        let consecutiveEmptyPages = 0; // Räknare för tomma sidor i rad
        const MAX_CONSECUTIVE_EMPTY_PAGES = 5; // Avsluta om 5 tomma sidor i rad
        
        // Huvudloop för paginering - fortsätter tills alla produkter är importerade
        while (true) {
            console.log(`\n=== BEARBETAR SIDA ${currentPage} ===`);
            
            // Kontrollera om vi har nått målet
            const currentCountResult = await dbClient.execute('SELECT COUNT(*) as total FROM Eprolo');
            const currentTotalProducts = currentCountResult.rows[0].total;
            console.log(`📊 Framsteg: ${currentTotalProducts.toLocaleString('sv-SE')} / ${TOTAL_EXPECTED_PRODUCTS.toLocaleString('sv-SE')} produkter (${((currentTotalProducts / TOTAL_EXPECTED_PRODUCTS) * 100).toFixed(2)}%)`);
            
            if (currentTotalProducts >= TOTAL_EXPECTED_PRODUCTS) {
                console.log(`\n🎉 === MÅLET UPPNÅTT! ===`);
                console.log(`✅ Alla ${TOTAL_EXPECTED_PRODUCTS.toLocaleString('sv-SE')} produkter har importerats!`);
                break;
            }
            
            // Kontrollera om sidan redan har importerats
            if (importedPages.has(currentPage)) {
                console.log(`⏭️ HOPPAR ÖVER SIDA ${currentPage} - Redan importerad tidigare`);
                console.log(`📋 Totalt importerade sidor: ${importedPages.size}`);
                console.log(`📋 Lista: ${Array.from(importedPages).sort((a, b) => a - b).join(', ')}`);
                
                // Hitta nästa oimporterade sida
                currentPage = findNextPageToImport();
                console.log(`🎯 Nästa oimporterade sida: ${currentPage}`);
                continue;
            }
            
            processedProductsOnCurrentPage.clear(); // Rensa för ny sida
            
            // Stäng eventuella extra flikar som kan ha öppnats - ANVÄND ENDAST EN FLIK
            const allPages = await browser.pages();
            if (allPages.length > 1) {
                console.log(`⚠️ Hittade ${allPages.length} öppna flikar, stänger extra flikar...`);
                for (let i = 0; i < allPages.length; i++) {
                    if (allPages[i] !== page) {
                        await allPages[i].close();
                        console.log(`✅ Stängde extra flik ${i + 1}`);
                    }
                }
            }
            
            try {
                // Kontrollera om vi är på katalogsidan
                const currentUrl = page.url();
                const isOnCatalogPage = currentUrl.includes('newProductsCatalog.html');
                
                if (!isOnCatalogPage) {
                    console.log(`🌐 Navigerar till Eprolo produktkatalog (utan page-parameter)...`);
                    await page.goto('https://eprolo.com/app/newProductsCatalog.html?waretypeid=24', { 
                        waitUntil: 'networkidle2', 
                        timeout: 90000 
                    });
                    console.log('⏳ Väntar på att sidan ska ladda helt...');
                    await new Promise(resolve => setTimeout(resolve, 10000));
                    
                    // Scrolla till botten för att visa pagination
                    console.log('📜 Scrollar till botten för att visa pagination...');
                    await page.evaluate(async () => {
                        window.scrollTo(0, document.body.scrollHeight);
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    });
                    
                    // Vänta på pagination
                    await page.waitForFunction(() => {
                        // GENERISK PAGINERINGSDETEKTOR
                        const paginationSelectors = [
                            '[class*="pagination"]', '.pagination', '.page-numbers', 
                            '.pagination-numbers', '[role="navigation"]', '.pager', '.pages'
                        ];
                        
                        let pagination = null;
                        for (const selector of paginationSelectors) {
                            pagination = document.querySelector(selector);
                            if (pagination && pagination.offsetParent !== null) break;
                        }
                        
                        if (!pagination || pagination.offsetParent === null) return false;
                        
                        const pageItems = pagination.querySelectorAll('li, a, button, span, div');
                        for (const item of pageItems) {
                            const text = item.textContent.trim();
                            if (/^\d+$/.test(text) && parseInt(text) > 0) return true;
                        }
                        return false;
                    }, { timeout: 15000 }).catch(() => {
                        console.log('⚠️ Pagination inte hittad, fortsätter ändå...');
                        return false;
                    });
                    
                    console.log('✅ Katalogsidan laddad och klar för scraping');
                }
                
                // Om vi ska börja från en annan sida än 1, navigera dit genom att klicka på pagineringsnummer
                if (currentPage > 1) {
                    console.log(`🔍 Behöver navigera till sida ${currentPage} genom att klicka på pagineringsnummer...`);
                    
                    // Scrolla till botten för att visa pagination
                    await page.evaluate(async () => {
                        window.scrollTo(0, document.body.scrollHeight);
                        await new Promise(r => setTimeout(r, 2000));
                    });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    // Vänta på pagination
                    await page.waitForFunction(() => {
                        // GENERISK PAGINERINGSDETEKTOR
                        const paginationSelectors = [
                            '[class*="pagination"]', '.pagination', '.page-numbers', 
                            '.pagination-numbers', '[role="navigation"]', '.pager', '.pages'
                        ];
                        
                        let pagination = null;
                        for (const selector of paginationSelectors) {
                            pagination = document.querySelector(selector);
                            if (pagination && pagination.offsetParent !== null) break;
                        }
                        
                        if (!pagination || pagination.offsetParent === null) return false;
                        const pageItems = pagination.querySelectorAll('li, a, button, span, div');
                        for (const item of pageItems) {
                            const text = item.textContent.trim();
                            if (/^\d+$/.test(text) && parseInt(text) > 0) return true;
                        }
                        return false;
                    }, { timeout: 20000 }).catch(() => false);
                    
                    // Klicka på sidnumret direkt
                    console.log(`🖱️ Klickar på sidnummer ${currentPage}...`);
                    const clickResult = await page.evaluate((targetPage) => {
                        // Hjälpfunktion för att hitta pagination
                        const findPagination = () => {
                            const selectors = [
                                '[class*="pagination"]', '.pagination', '.page-numbers', 
                                '.pagination-numbers', '[role="navigation"]', '.pager', '.pages'
                            ];
                            for (const sel of selectors) {
                                const el = document.querySelector(sel);
                                if (el && el.offsetParent !== null) return el;
                            }
                            return null;
                        };
                        
                        const pagination = findPagination();
                        if (!pagination) return { success: false, reason: 'Ingen pagination hittades' };
                        
                        console.log('🔍 DEBUG: Pagination element hittad:', pagination.className);
                        
                        const targetStr = String(targetPage);
                        
                        // Strategi 1: Leta efter element som innehåller exakt sidnummer
                        const paginationItems = pagination.querySelectorAll('li, a, button, span, div');
                        console.log(`🔍 DEBUG: Hittade ${paginationItems.length} element i pagination`);
                        
                        for (const item of paginationItems) {
                            const text = item.textContent.trim();
                            
                            // Matcha exakt sidnummer (inte "Total 191569" eller andra texter)
                            if (text === targetStr && /^\d+$/.test(text)) {
                                const clickable = item.querySelector('a, button') || item;
                                console.log(`✅ DEBUG: Hittade matchande element för sida ${targetPage}`);
                                
                                // Klicka på elementet
                                clickable.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                
                                // Simulera klick
                                ['mousedown', 'mouseup', 'click'].forEach(eventType => {
                                    const event = new MouseEvent(eventType, {
                                        view: window,
                                        bubbles: true,
                                        cancelable: true
                                    });
                                    clickable.dispatchEvent(event);
                                });
                                
                                console.log(`✅ Klickade på sidnummer ${targetPage}`);
                                return { success: true, clickedPage: targetPage };
                            }
                        }
                        
                        console.log(`❌ DEBUG: Kunde inte hitta sidnummer ${targetPage} i pagination`);
                        return { success: false, reason: `Sidnummer ${targetPage} hittades inte i pagination` };
                    }, currentPage);
                    
                    if (clickResult.success) {
                        console.log(`✅ Klickade på sidnummer ${currentPage}`);
                        await new Promise(resolve => setTimeout(resolve, 5000));
                        
                        // Vänta på att produktlistan uppdateras
                        await page.waitForFunction((expectedPage) => {
                            // Hjälpfunktion för att hitta pagination
                            const findPagination = () => {
                                const selectors = [
                                    '[class*="pagination"]', '.pagination', '.page-numbers', 
                                    '.pagination-numbers', '[role="navigation"]', '.pager', '.pages'
                                ];
                                for (const sel of selectors) {
                                    const el = document.querySelector(sel);
                                    if (el && el.offsetParent !== null) return el;
                                }
                                return null;
                            };
                            
                            const pagination = findPagination();
                            if (!pagination) return false;
                            
                            // Leta efter aktivt sidnummer
                            const activeItem = pagination.querySelector(
                                '[class*="active"], [class*="current"], [class*="selected"], [aria-current="true"], .active'
                            );
                            
                            return activeItem && activeItem.textContent.trim() === String(expectedPage);
                        }, { timeout: 10000 }, currentPage).catch(() => {
                            console.log('⚠️ Timeout vid verifiering, fortsätter ändå...');
                        });
                    } else {
                        console.log(`⚠️ Kunde inte klicka på sidnummer ${currentPage}: ${clickResult.reason}`);
                        console.log(`⚠️ Försöker klicka på > upprepade gånger istället...`);
                        
                        // Fallback: klicka > upprepade gånger
                        for (let clickNum = 1; clickNum < currentPage; clickNum++) {
                            await page.evaluate(async () => {
                                window.scrollTo(0, document.body.scrollHeight);
                                await new Promise(r => setTimeout(r, 500));
                            });
                            
                            const clicked = await page.evaluate(() => {
                                // Hjälpfunktion för att hitta pagination
                                const findPagination = () => {
                                    const selectors = [
                                        '[class*="pagination"]', '.pagination', '.page-numbers', 
                                        '.pagination-numbers', '[role="navigation"]', '.pager', '.pages'
                                    ];
                                    for (const sel of selectors) {
                                        const el = document.querySelector(sel);
                                        if (el && el.offsetParent !== null) return el;
                                    }
                                    return null;
                                };
                                
                                const pagination = findPagination();
                                if (!pagination) return false;
                                
                                // Leta efter nästa-knapp (element med ">" eller "next" eller "›")
                                const nextBtn = pagination.querySelector('[class*="next"], button:last-of-type, a:last-of-type');
                                if (!nextBtn) return false;
                                
                                // Kontrollera om knappen är inaktiverad
                                const isDisabled = nextBtn.disabled || 
                                                   nextBtn.getAttribute('aria-disabled') === 'true' ||
                                                   nextBtn.classList.toString().toLowerCase().includes('disabled');
                                if (isDisabled) return false;
                                
                                const clickable = nextBtn.querySelector('button, a') || nextBtn;
                                ['mousedown', 'mouseup', 'click'].forEach(eventType => {
                                    clickable.dispatchEvent(new MouseEvent(eventType, { view: window, bubbles: true, cancelable: true }));
                                });
                                return true;
                            });
                            
                            if (!clicked) {
                                console.log(`❌ Kunde inte klicka > vid klick ${clickNum}`);
                                break;
                            }
                            await new Promise(resolve => setTimeout(resolve, 3000));
                            console.log(`   Klick ${clickNum}/${currentPage - 1} slutfört`);
                        }
                    }
                    
                    // Verifiera att vi är på rätt sida
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    const verifiedPage = await page.evaluate(() => {
                        // Hitta aktivt sidnummer med generisk sökning
                        const activeItem = document.querySelector(
                            '[class*="pagination"] [class*="active"], [class*="pagination"] [class*="current"], .active, [aria-current="true"]'
                        );
                        if (activeItem) {
                            const text = activeItem.textContent.trim();
                            // Kontrollera att det är ett nummer
                            if (/^\d+$/.test(text)) {
                                return parseInt(text);
                            }
                        }
                        return null;
                    });
                    
                    if (verifiedPage !== currentPage) {
                        console.log(`⚠️ Kunde inte navigera till sida ${currentPage}, är på sida ${verifiedPage}`);
                        if (verifiedPage) currentPage = verifiedPage;
                    } else {
                        console.log(`✅ Verifierad: är på sida ${currentPage}`);
                    }
                }
                
                // Vänta på att produkterna laddas
                await page.waitForSelector('body', { timeout: 30000 });
                
                // Vänta på att sidan laddar
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Extrahera alla produkt-URLer direkt från sidan med förbättrad logik
                const productUrls = await page.evaluate(() => {
                    console.log('=== FÖRBÄTTRAD URL-EXTRAKTION ===');
                    console.log('Sidans titel:', document.title);
                    console.log('Nuvarande URL:', window.location.href);
                    
                    let urls = new Set();
                    
                    // Prioriterade selektorer för Eprolo produktlänkar
                    const prioritySelectors = [
                        'a[href*="/product/"]',
                        'a[href*="/goods/"]',
                        'a[href*="/item/"]',
                        'a[href*="productDetail"]',
                        'a[href*="goodsDetail"]',
                        '.product-item > a',
                        '.goods-item > a',
                        '.product-card > a',
                        '[data-product-id] a',
                        '[data-goods-id] a'
                    ];
                    
                    console.log('=== SÖKER MED PRIORITERADE SELEKTORER ===');
                    for (const selector of prioritySelectors) {
                        const links = document.querySelectorAll(selector);
                        if (links.length > 0) {
                            console.log(`✅ Selector "${selector}" hittade ${links.length} länkar`);
                            links.forEach(link => {
                                const href = link.href;
                                // Strikt filtrering - endast riktiga produktlänkar
                                if (href && 
                                    href.startsWith('http') && 
                                    !href.includes('newProductsCatalog') &&
                                    !href.includes('catalog.html') &&
                                    !href.includes('javascript:') &&
                                    !href.endsWith('#') &&
                                    (href.includes('/product/') || 
                                     href.includes('/goods/') || 
                                     href.includes('/item/') ||
                                     href.includes('Detail'))) {
                                    urls.add(href);
                                    console.log(`  ✅ Giltig produkt-URL: ${href}`);
                                }
                            });
                            
                            if (urls.size > 0) {
                                console.log(`✅ Hittade ${urls.size} produktlänkar med ${selector}`);
                                break;
                            }
                        }
                    }
                    
                    // Fallback: Sök efter länkar med produktrelaterade attribut
                    if (urls.size === 0) {
                        console.log('=== FALLBACK: SÖKER EFTER PRODUKTATTRIBUT ===');
                        const allLinks = document.querySelectorAll('a[href]');
                        allLinks.forEach(link => {
                            const href = link.href;
                            const hasProductAttr = link.hasAttribute('data-product-id') || 
                                                  link.hasAttribute('data-goods-id') ||
                                                  link.hasAttribute('data-sku');
                            
                            if (hasProductAttr && 
                                href.startsWith('http') && 
                                !href.includes('newProductsCatalog') &&
                                !href.includes('catalog.html')) {
                                urls.add(href);
                                console.log(`  ✅ Produkt via attribut: ${href}`);
                            }
                        });
                    }
                    
                    console.log(`=== SLUTRESULTAT: ${urls.size} PRODUKTLÄNKAR ===`);
                    Array.from(urls).slice(0, 10).forEach((url, i) => {
                        console.log(`  ${i + 1}. ${url}`);
                    });
                    
                    return Array.from(urls);
                });
                
                console.log(`Hittade ${productUrls.length} produkt-URLer på Eprolo-sidan`);
                
                if (productUrls.length === 0) {
                    consecutiveEmptyPages++;
                    console.log(`⚠️ Inga produkter hittades på denna Eprolo-sida (tom sida ${consecutiveEmptyPages}/${MAX_CONSECUTIVE_EMPTY_PAGES})`);
                    
                    if (consecutiveEmptyPages >= MAX_CONSECUTIVE_EMPTY_PAGES) {
                        console.log(`⚠️ ${MAX_CONSECUTIVE_EMPTY_PAGES} tomma sidor i rad - kontrollerar om vi är klara...`);
                        
                        // Kontrollera totalt antal produkter i databasen
                        const finalCountResult = await dbClient.execute('SELECT COUNT(*) as total FROM Eprolo');
                        const finalTotalProducts = finalCountResult.rows[0].total;
                        
                        if (finalTotalProducts >= TOTAL_EXPECTED_PRODUCTS) {
                            console.log(`✅ Alla ${TOTAL_EXPECTED_PRODUCTS.toLocaleString('sv-SE')} produkter har importerats!`);
                            break;
                        } else {
                            console.log(`⚠️ Endast ${finalTotalProducts.toLocaleString('sv-SE')} produkter importerade, fortsätter söka...`);
                            consecutiveEmptyPages = 0; // Återställ och fortsätt
                        }
                    }
                    
                    console.log(`⚠️ Hoppar över denna sida och fortsätter till nästa...`);
                    currentPage++;
                    continue;
                } else {
                    consecutiveEmptyPages = 0; // Återställ räknaren när vi hittar produkter
                }
                
                // Bearbeta varje produkt genom att navigera direkt till produkt-URLer
                let productIndex = 0;
                while (productIndex < productUrls.length) {
                    const productUrl = productUrls[productIndex];
                    const productIdentifier = productUrl; // Använd URL som identifierare
                    
                    // Kontrollera om vi redan har bearbetat denna produkt
                    if (processedProductsOnCurrentPage.has(productIdentifier)) {
                        console.log(`⚠️ Produkt ${productIndex + 1} redan bearbetad, går till nästa`);
                        productIndex++;
                        continue;
                    }
                    
                    console.log(`\n--- 🛍️ PRODUKT ${productIndex + 1}/${productUrls.length} på sida ${currentPage} ---`);
                    console.log(`🔗 Produkt-URL: ${productUrl}`);
                    
                    try {
                        // Navigera direkt till produkt-URL
                        console.log(`🖱️ Navigerar till produkt ${productIndex + 1}`);
                        
                        // FÖRBÄTTRAD VERIFIERING AV URL INNAN NAVIGATION
                        if (productUrl.includes('newProductsCatalog.html') || 
                            productUrl.includes('catalog.html') ||
                            productUrl.includes('javascript:') ||
                            productUrl.endsWith('#') ||
                            productUrl.includes('login') ||
                            productUrl.includes('signin')) {
                            console.log(`❌ OGILTIG URL, hoppar över: ${productUrl}`);
                            productIndex++;
                            continue;
                        }
                        
                        // Verifiera att URL:en innehåller produktindikatorer (mer flexibel)
                        const hasProductIndicator = productUrl.includes('/product') ||
                                                   productUrl.includes('/goods') ||
                                                   productUrl.includes('/item') ||
                                                   productUrl.includes('Detail') ||
                                                   productUrl.includes('productDetail') ||
                                                   productUrl.includes('goodsDetail') ||
                                                   /\/\d+/.test(productUrl); // Innehåller nummer i URL:en
                        
                        if (!hasProductIndicator) {
                            console.log(`⚠️ URL saknar produktindikator, hoppar över: ${productUrl}`);
                            productIndex++;
                            continue;
                        }
                        
                        try {
                            // Stäng eventuella extra flikar INNAN navigation
                            const pagesBeforeNav = await browser.pages();
                            if (pagesBeforeNav.length > 2) {
                                console.log(`⚠️ Hittade ${pagesBeforeNav.length} öppna flikar innan navigation, stänger extra...`);
                                for (let i = 0; i < pagesBeforeNav.length; i++) {
                                    if (pagesBeforeNav[i] !== page) {
                                        await pagesBeforeNav[i].close();
                                    }
                                }
                            }
                            
                            await page.goto(productUrl, { waitUntil: 'networkidle0', timeout: 30000 });
                            
                            // Stäng eventuella extra flikar EFTER navigation
                            const pagesAfterNav = await browser.pages();
                            if (pagesAfterNav.length > 2) {
                                console.log(`⚠️ Hittade ${pagesAfterNav.length} öppna flikar efter navigation, stänger extra...`);
                                for (let i = 0; i < pagesAfterNav.length; i++) {
                                    if (pagesAfterNav[i] !== page) {
                                        await pagesAfterNav[i].close();
                                    }
                                }
                            }
                        } catch (navError) {
                            console.log(`⚠️ Kunde inte navigera till produktsida: ${navError.message}`);
                            productIndex++;
                            continue;
                        }
                        
                        console.log(`✅ Produktsida laddad: ${page.url()}`);
                        
                        // FÖRBÄTTRAD VERIFIERING att vi är på en produktsida
                        const currentUrl = page.url();
                        if (currentUrl.includes('newProductsCatalog.html') || 
                            currentUrl.includes('catalog.html')) {
                            console.log(`❌ Fel: Fortfarande på katalogsidan efter navigation`);
                            console.log(`   Förväntad: ${productUrl}`);
                            console.log(`   Faktisk: ${currentUrl}`);
                            productIndex++;
                            continue;
                        }
                        
                        // Verifiera att vi faktiskt är på en produktsida genom att kontrollera innehåll
                        const isProductPage = await page.evaluate(() => {
                            // Leta efter produktspecifika element
                            const hasProductTitle = document.querySelector('.product-title, .product-name, .goods-name, h1') !== null;
                            const hasProductImage = document.querySelector('.product-image, .product-gallery, .goods-image, img') !== null;
                            const hasProductInfo = document.querySelector('.product-info, .product-details, .goods-info') !== null;
                            
                            return hasProductTitle || hasProductImage || hasProductInfo;
                        });
                        
                        if (!isProductPage) {
                            console.log(`⚠️ Sidan verkar inte vara en produktsida, hoppar över`);
                            productIndex++;
                            continue;
                        }
                        
                        // FÖRBÄTTRAD BILDEXTRAKTION - Hämta MINST 8 bilder per produkt
                        console.log('🖼️ Hämtar alla produktbilder (mål: minst 8 bilder)...');
                        const allImages = [];
                        const seenUrls = new Set();
                        const MIN_IMAGES = 8; // Minimikrav för bilder per produkt
                        
                        // BILDFILTER - Endast originalbilder från Shopify/Aliyun
                        const isValidProductImage = (url) => {
                            if (!url || !url.startsWith('http')) return false;
                            
                            // Acceptera endast bilder från Shopify/Aliyun-domäner
                            const validDomains = [
                                'shopifyfile.oss-us-west-1.aliyuncs.com',
                                'shopify.com',
                                'aliyuncs.com',
                                'cdn.shopify.com'
                            ];
                            
                            const hasValidDomain = validDomains.some(domain => url.includes(domain));
                            if (!hasValidDomain) {
                                console.log(`   ❌ Filtrerad (ogiltig domän): ${url.substring(0, 60)}...`);
                                return false;
                            }
                            
                            // Filtrera bort UI-bilder och ikoner
                            const invalidPatterns = [
                                '/close.png',
                                '/icon',
                                '/logo',
                                '/avatar',
                                '/button',
                                '/arrow',
                                '/badge',
                                '/banner',
                                '/bg.',
                                '/background'
                            ];
                            
                            const hasInvalidPattern = invalidPatterns.some(pattern => 
                                url.toLowerCase().includes(pattern.toLowerCase())
                            );
                            
                            if (hasInvalidPattern) {
                                console.log(`   ❌ Filtrerad (UI-element): ${url.substring(0, 60)}...`);
                                return false;
                            }
                            
                            // Kontrollera att det är en giltig bildfiltyp
                            if (!/\.(jpg|jpeg|png|gif|webp)/i.test(url)) {
                                console.log(`   ❌ Filtrerad (ogiltig filtyp): ${url.substring(0, 60)}...`);
                                return false;
                            }
                            
                            return true;
                        };
                        
                        try {
                            // Vänta på att bildgalleriet laddas
                            await page.waitForSelector('img', { timeout: 5000 });
                            
                            // METOD 0: JAVASCRIPT-DATA OCH JSON - Mest tillförlitlig för att hitta alla bilder
                            console.log('   📋 Metod 0: Söker i JavaScript-data och JSON...');
                            const scriptImages = await page.evaluate(() => {
                                const images = new Set();
                                
                                // Sök i window-objektet efter bilddata
                                const searchInObject = (obj, depth = 0) => {
                                    if (depth > 3 || !obj || typeof obj !== 'object') return;
                                    
                                    try {
                                        for (const key in obj) {
                                            if (!obj.hasOwnProperty(key)) continue;
                                            const value = obj[key];
                                            
                                            // Kolla om det är en bild-URL
                                            if (typeof value === 'string' && 
                                                value.startsWith('http') && 
                                                /\.(jpg|jpeg|png|gif|webp)/i.test(value)) {
                                                images.add(value);
                                            }
                                            
                                            // Sök i arrayer
                                            if (Array.isArray(value)) {
                                                value.forEach(item => {
                                                    if (typeof item === 'string' && 
                                                        item.startsWith('http') && 
                                                        /\.(jpg|jpeg|png|gif|webp)/i.test(item)) {
                                                        images.add(item);
                                                    } else if (item && typeof item === 'object') {
                                                        if (item.url || item.src || item.image) {
                                                            const imgUrl = item.url || item.src || item.image;
                                                            if (typeof imgUrl === 'string' && imgUrl.startsWith('http')) {
                                                                images.add(imgUrl);
                                                            }
                                                        }
                                                    }
                                                });
                                            }
                                            
                                            // Rekursivt sök i objekt
                                            if (value && typeof value === 'object' && depth < 3) {
                                                searchInObject(value, depth + 1);
                                            }
                                        }
                                    } catch (e) {}
                                };
                                
                                // Sök i vanliga platser för produktdata
                                ['productData', 'product', 'item', 'goods', 'skuData', 'variantData', 'imageData', 'colorData'].forEach(key => {
                                    if (window[key]) searchInObject(window[key]);
                                });
                                
                                // Sök i alla script-taggar efter JSON-data och bild-URLer
                                document.querySelectorAll('script:not([src])').forEach(script => {
                                    const content = script.textContent;
                                    if (!content) return;
                                    
                                    // Hitta alla URL:er som ser ut som bilder
                                    const urlMatches = content.match(/https?:\/\/[^\s"']+?\.(jpg|jpeg|png|gif|webp)[^\s"']*/gi);
                                    if (urlMatches) {
                                        urlMatches.forEach(url => {
                                            // Rensa bort eventuella avslutande tecken
                                            const cleanUrl = url.replace(/[,;)\]}\\"']+$/, '');
                                            images.add(cleanUrl);
                                        });
                                    }
                                });
                                
                                return Array.from(images);
                            });
                            
                            scriptImages.forEach(img => {
                                if (!seenUrls.has(img) && isValidProductImage(img)) {
                                    allImages.push(img);
                                    seenUrls.add(img);
                                    console.log(`   ✅ Script Bild ${allImages.length}: ${img.substring(0, 70)}...`);
                                }
                            });
                            console.log(`   ✅ Metod 0 hittade ${scriptImages.filter(isValidProductImage).length} giltiga bilder från JavaScript-data`);
                            
                            // METOD 0.5: ENKEL OCH DIREKT - Hämta alla img-taggar på sidan
                            console.log('   📋 Metod 0.5: Hämtar alla img-taggar direkt...');
                            const simpleImages = await page.evaluate(() => {
                                const images = [];
                                document.querySelectorAll('img').forEach(img => {
                                    // Hämta src från olika attribut
                                    const sources = [
                                        img.src,
                                        img.getAttribute('data-src'),
                                        img.getAttribute('data-original'),
                                        img.getAttribute('data-large'),
                                        img.getAttribute('data-zoom'),
                                        img.getAttribute('data-full'),
                                        img.getAttribute('data-image')
                                    ];
                                    
                                    sources.forEach(src => {
                                        if (src && 
                                            src.startsWith('http') && 
                                            !src.includes('logo') && 
                                            !src.includes('icon') &&
                                            !src.includes('avatar') &&
                                            /\.(jpg|jpeg|png|gif|webp)/i.test(src)) {
                                            // Ta bort thumbnail-suffix och få full storlek
                                            let fullSrc = src
                                                .replace(/_thumb\./i, '.')
                                                .replace(/_small\./i, '.')
                                                .replace(/_thumbnail\./i, '.')
                                                .replace(/\/thumb\//i, '/full/')
                                                .replace(/\/small\//i, '/full/')
                                                .replace(/_\d+x\d+\./i, '.'); // Ta bort dimensioner som _300x300.
                                            images.push(fullSrc);
                                        }
                                    });
                                });
                                return images;
                            });
                            
                            simpleImages.forEach(img => {
                                if (!seenUrls.has(img) && isValidProductImage(img)) {
                                    allImages.push(img);
                                    seenUrls.add(img);
                                    console.log(`   ✅ IMG-tagg Bild ${allImages.length}: ${img.substring(0, 70)}...`);
                                }
                            });
                            console.log(`   ✅ Metod 0.5 hittade ${simpleImages.filter(isValidProductImage).length} giltiga bilder`);
                            
                            // METOD 1: Försök hitta alla bilder direkt i DOM (miniatyrer, thumbnails, färgvarianter)
                            console.log('   📋 Metod 1: Söker efter alla bilder i DOM och färgvarianter...');
                            const domImages = await page.evaluate(() => {
                                const images = new Set();
                                
                                // Sök efter miniatyrer/thumbnails
                                const thumbnailSelectors = [
                                    '.thumbnail img', '.thumbnails img', '.thumb img',
                                    '.product-thumbnails img', '.gallery-thumbnails img',
                                    '[class*="thumbnail"] img', '[class*="thumb"] img',
                                    '.image-list img', '.images-list img',
                                    // Eprolo-specifika
                                    '.product-images img', '.goods-images img', 
                                    '.detail-images img', '.sku-images img',
                                    // Färgvariant-bilder
                                    '.color-option img', '.color-swatch img', '.variant-image img',
                                    '[data-color] img', '.sku-item img', '.variant-item img'
                                ];
                                
                                thumbnailSelectors.forEach(selector => {
                                    document.querySelectorAll(selector).forEach(img => {
                                        if (img.src && img.src.startsWith('http')) {
                                            // Ta bort thumbnail-suffix och få full storlek
                                            let fullSrc = img.src
                                                .replace(/_thumb\./i, '.')
                                                .replace(/_small\./i, '.')
                                                .replace(/_thumbnail\./i, '.')
                                                .replace(/\/thumb\//i, '/full/')
                                                .replace(/\/small\//i, '/full/')
                                                .replace(/_\d+x\d+\./i, '.');
                                            images.add(fullSrc);
                                        }
                                        // Kolla även data-attribut
                                        const dataSrc = img.getAttribute('data-src') || 
                                                       img.getAttribute('data-original') ||
                                                       img.getAttribute('data-large') ||
                                                       img.getAttribute('data-full');
                                        if (dataSrc && dataSrc.startsWith('http')) {
                                            images.add(dataSrc);
                                        }
                                    });
                                });
                                
                                // Sök efter bilder i data-attribut på produktsidan
                                document.querySelectorAll('[data-images], [data-gallery], [data-product-images], [data-color-images]').forEach(el => {
                                    const dataImages = el.getAttribute('data-images') || 
                                                      el.getAttribute('data-gallery') ||
                                                      el.getAttribute('data-product-images') ||
                                                      el.getAttribute('data-color-images');
                                    if (dataImages) {
                                        try {
                                            const parsed = JSON.parse(dataImages);
                                            if (Array.isArray(parsed)) {
                                                parsed.forEach(img => {
                                                    if (typeof img === 'string' && img.startsWith('http')) {
                                                        images.add(img);
                                                    } else if (img.url || img.src) {
                                                        images.add(img.url || img.src);
                                                    }
                                                });
                                            }
                                        } catch (e) {}
                                    }
                                });
                                
                                return Array.from(images);
                            });
                            
                            domImages.forEach(img => {
                                if (!seenUrls.has(img) && isValidProductImage(img)) {
                                    allImages.push(img);
                                    seenUrls.add(img);
                                    console.log(`   ✅ DOM Bild ${allImages.length}: ${img.substring(0, 70)}...`);
                                }
                            });
                            console.log(`   ✅ Metod 1 hittade ${domImages.filter(isValidProductImage).length} giltiga bilder från DOM`);
                            
                            // METOD 2: Klicka på FÄRGVARIANTER för att hämta bilder för varje färg
                            console.log('   🎨 Metod 2: Klickar på färgvarianter för att hämta bilder...');
                            const colorVariantImages = await page.evaluate(() => {
                                const images = new Set();
                                
                                // Hitta alla färgvariant-element
                                const colorSelectors = [
                                    '.color-option', '.color-swatch', '.variant-color',
                                    '[data-color]', '.sku-color', '.color-selector button',
                                    '.color-picker button', 'button[data-color]', 
                                    'li[data-color]', '.attribute-color', '.option-color',
                                    '.variant-item[data-color]', '.variant-option[data-color]'
                                ];
                                
                                const colorElements = [];
                                colorSelectors.forEach(selector => {
                                    document.querySelectorAll(selector).forEach(el => {
                                        if (el.offsetParent !== null) { // Endast synliga element
                                            colorElements.push(el);
                                        }
                                    });
                                });
                                
                                console.log(`   Hittade ${colorElements.length} färgvariant-element`);
                                
                                // Klicka på varje färgvariant
                                colorElements.forEach((colorEl, index) => {
                                    try {
                                        colorEl.click();
                                        
                                        // Enkel delay
                                        const startTime = Date.now();
                                        while (Date.now() - startTime < 300) {}
                                        
                                        // Hämta huvudbilden efter klick
                                        const mainSelectors = [
                                            '.product-gallery img', '.main-image img',
                                            '.product-image img', '.detail-image img',
                                            '.hero-image img', '.primary-image img',
                                            'img[class*="main"]', 'img[class*="active"]',
                                            'img[class*="current"]', '.goods-image img'
                                        ];
                                        
                                        for (const selector of mainSelectors) {
                                            const mainImg = document.querySelector(selector);
                                            if (mainImg && mainImg.src && mainImg.src.startsWith('http')) {
                                                images.add(mainImg.src);
                                                console.log(`   ✅ Färgvariant ${index + 1}: ${mainImg.src.substring(0, 50)}...`);
                                                break;
                                            }
                                        }
                                        
                                        // Hämta även alla miniatyrbilder som visas för denna färg
                                        document.querySelectorAll('.thumbnail img, .thumb img, .product-thumbnails img').forEach(thumb => {
                                            if (thumb.src && thumb.src.startsWith('http')) {
                                                images.add(thumb.src);
                                            }
                                        });
                                        
                                    } catch (e) {
                                        console.log(`   ⚠️ Fel vid klick på färgvariant ${index + 1}: ${e.message}`);
                                    }
                                });
                                
                                return Array.from(images);
                            });
                            
                            colorVariantImages.forEach(img => {
                                if (!seenUrls.has(img) && isValidProductImage(img)) {
                                    allImages.push(img);
                                    seenUrls.add(img);
                                    console.log(`   ✅ Färgvariant Bild ${allImages.length}: ${img.substring(0, 70)}...`);
                                }
                            });
                            console.log(`   ✅ Metod 2 hittade ${colorVariantImages.filter(isValidProductImage).length} giltiga bilder från färgvarianter`);
                            
                            // METOD 3: Klicka på miniatyrbilder för att aktivera dem
                            console.log('   🖱️ Metod 3: Klickar på miniatyrbilder...');
                            console.log('   🖱️ Metod 3: Klickar på miniatyrbilder...');
                            const thumbnailImages = await page.evaluate(() => {
                                const images = new Set();
                                const thumbnailSelectors = [
                                    '.thumbnail', '.thumb', '.product-thumbnail',
                                    '.gallery-thumbnail', '[class*="thumbnail"]',
                                    '[class*="thumb"]', '.image-list img',
                                    '.product-images img', '.goods-images img'
                                ];
                                
                                const clickableImages = [];
                                thumbnailSelectors.forEach(selector => {
                                    document.querySelectorAll(selector).forEach(el => {
                                        if (el.offsetParent !== null) { // Endast synliga element
                                            clickableImages.push(el);
                                        }
                                    });
                                });
                                
                                // Klicka på varje miniatyrbild
                                clickableImages.forEach((thumb, index) => {
                                    try {
                                        thumb.click();
                                        
                                        // Enkel delay
                                        const startTime = Date.now();
                                        while (Date.now() - startTime < 200) {}
                                        
                                        // Hämta huvudbilden efter klick
                                        const mainSelectors = [
                                            '.product-gallery img', '.main-image img',
                                            '.product-image img', '.detail-image img',
                                            '.hero-image img', '.primary-image img',
                                            'img[class*="main"]', 'img[class*="active"]'
                                        ];
                                        
                                        for (const selector of mainSelectors) {
                                            const mainImg = document.querySelector(selector);
                                            if (mainImg && mainImg.src && mainImg.src.startsWith('http')) {
                                                images.add(mainImg.src);
                                                break;
                                            }
                                        }
                                    } catch (e) {}
                                });
                                
                                return Array.from(images);
                            });
                            
                            thumbnailImages.forEach(img => {
                                if (!seenUrls.has(img) && isValidProductImage(img)) {
                                    allImages.push(img);
                                    seenUrls.add(img);
                                    console.log(`   ✅ Miniatyr Bild ${allImages.length}: ${img.substring(0, 70)}...`);
                                }
                            });
                            console.log(`   ✅ Metod 3 hittade ${thumbnailImages.filter(isValidProductImage).length} giltiga bilder från miniatyrer`);
                            
                            // METOD 4: Klicka på >-knappen för att iterera genom bildgalleriet
                            console.log('   🖱️ Metod 4: Klickar på >-knappen för att hämta alla bilder...');
                            let clickCount = 0;
                            const maxClicks = 60; // Öka för att få fler bilder
                            let consecutiveDuplicates = 0;
                            
                            // Hämta första bilden om vi inte redan har den
                            const firstImage = await page.evaluate(() => {
                                const selectors = [
                                    '.product-gallery img', '.main-image img', '.product-image img',
                                    '.detail-image img', '.hero-image img', '.primary-image img',
                                    'img[class*="product"]', 'img[class*="main"]', 'img[class*="detail"]',
                                    // Eprolo-specifika
                                    '.goods-image img', '.item-image img', 'img'
                                ];
                                
                                for (const selector of selectors) {
                                    const img = document.querySelector(selector);
                                    if (img && img.src && img.src.startsWith('http')) {
                                        return img.src;
                                    }
                                }
                                return null;
                            });
                            
                            if (firstImage && !seenUrls.has(firstImage) && isValidProductImage(firstImage)) {
                                allImages.push(firstImage);
                                seenUrls.add(firstImage);
                                console.log(`   ✅ Klick Bild ${allImages.length}: ${firstImage.substring(0, 70)}...`);
                            }
                            
                            // Klicka på >-knappen upprepade gånger
                            while (clickCount < maxClicks && consecutiveDuplicates < 3) {
                                try {
                                    const nextButtonClicked = await page.evaluate(() => {
                                        const buttonSelectors = [
                                            'button[aria-label*="next" i]', 'button[class*="next" i]',
                                            'button[class*="arrow-right" i]', 'a[class*="next" i]',
                                            '.next-button', '.arrow-right', '[class*="next"]',
                                            '[class*="arrow-right"]', 'button > svg', 'button > i',
                                            '.slick-next', '.swiper-button-next',
                                            '[data-action="next"]', '[data-direction="next"]',
                                            // Eprolo-specifika
                                            '.gallery-next', '.image-next', '[class*="gallery"] button:last-child'
                                        ];
                                        
                                        for (const selector of buttonSelectors) {
                                            try {
                                                const button = document.querySelector(selector);
                                                if (button && !button.disabled && button.offsetParent !== null) {
                                                    button.click();
                                                    return true;
                                                }
                                            } catch (e) {
                                                continue;
                                            }
                                        }
                                        
                                        // Fallback: Leta efter knappar med >, ›, → text eller ikoner
                                        const allButtons = document.querySelectorAll('button, a, div[role="button"], span[role="button"]');
                                        for (const btn of allButtons) {
                                            if (btn.offsetParent === null) continue; // Skippa dolda element
                                            const text = btn.textContent.trim();
                                            const ariaLabel = btn.getAttribute('aria-label') || '';
                                            const className = btn.className.toLowerCase();
                                            if (text === '>' || text === '›' || text === '→' || text === '▶' ||
                                                ariaLabel.toLowerCase().includes('next') ||
                                                className.includes('next') || className.includes('arrow-right')) {
                                                btn.click();
                                                return true;
                                            }
                                        }
                                        
                                        return false;
                                    });
                                    
                                    if (!nextButtonClicked) {
                                        console.log('   ⚠️ Kunde inte hitta >-knappen');
                                        break;
                                    }
                                    
                                    clickCount++;
                                    
                                    // Vänta på att bilden ska uppdateras (längre tid för säkrare laddning)
                                    await new Promise(resolve => setTimeout(resolve, 800));
                                    
                                    // Hämta den nya bilden
                                    const currentImage = await page.evaluate(() => {
                                        const selectors = [
                                            '.product-gallery img', '.main-image img', '.product-image img',
                                            '.detail-image img', '.hero-image img', '.primary-image img',
                                            'img[class*="product"]', 'img[class*="main"]', 'img[class*="active"]',
                                            'img[class*="current"]', '.goods-image img', 'img'
                                        ];
                                        
                                        for (const selector of selectors) {
                                            const img = document.querySelector(selector);
                                            if (img && img.src && img.src.startsWith('http')) {
                                                return img.src;
                                            }
                                        }
                                        return null;
                                    });
                                    
                                    if (currentImage && !seenUrls.has(currentImage) && isValidProductImage(currentImage)) {
                                        allImages.push(currentImage);
                                        seenUrls.add(currentImage);
                                        consecutiveDuplicates = 0;
                                        console.log(`   ✅ Klick Bild ${allImages.length}: ${currentImage.substring(0, 70)}...`);
                                    } else if (currentImage && seenUrls.has(currentImage)) {
                                        consecutiveDuplicates++;
                                        if (consecutiveDuplicates >= 3) {
                                            console.log('   ✅ Alla bilder hämtade (återkom till tidigare bild 3 gånger)');
                                            break;
                                        }
                                    }
                                    
                                } catch (clickError) {
                                    console.log(`   ⚠️ Fel vid klick ${clickCount + 1}: ${clickError.message}`);
                                    break;
                                }
                            }
                            
                            if (clickCount >= maxClicks) {
                                console.log(`   ⚠️ Nådde maxgräns på ${maxClicks} klick`);
                            }
                            
                        } catch (error) {
                            console.log(`   ⚠️ Fel vid bildinhämtning: ${error.message}`);
                        }
                        
                        // KONTROLLERA ATT VI HAR MINST 8 BILDER
                        console.log(`   📊 Totalt ${allImages.length} unika produktbilder hämtade`);
                        
                        if (allImages.length < MIN_IMAGES) {
                            console.log(`   ⚠️ VARNING: Endast ${allImages.length} bilder hittades (minimum: ${MIN_IMAGES})`);
                            console.log(`   🔄 Försöker hämta fler bilder genom ytterligare metoder...`);
                            
                            // EXTRA METOD: Sök efter alla bilder på sidan utan filter
                            const extraImages = await page.evaluate(() => {
                                const images = [];
                                document.querySelectorAll('img').forEach(img => {
                                    if (img.src && 
                                        img.src.startsWith('http') && 
                                        /\.(jpg|jpeg|png|gif|webp)/i.test(img.src) &&
                                        img.width > 100 && 
                                        img.height > 100) {
                                        images.push(img.src);
                                    }
                                });
                                return images;
                            });
                            
                            extraImages.forEach(img => {
                                if (!seenUrls.has(img) && isValidProductImage(img) && allImages.length < MIN_IMAGES * 2) {
                                    allImages.push(img);
                                    seenUrls.add(img);
                                    console.log(`   ✅ Extra Bild ${allImages.length}: ${img.substring(0, 70)}...`);
                                }
                            });
                        }
                        
                        console.log(`   ✅ SLUTRESULTAT: ${allImages.length} unika produktbilder hämtade`);
                        
                        if (allImages.length < MIN_IMAGES) {
                            console.log(`   ⚠️ VARNING: Produkten har endast ${allImages.length} bilder (minimum: ${MIN_IMAGES})`);
                            console.log(`   ⏭️ Fortsätter ändå med tillgängliga bilder...`);
                        }
                        
                        // DETALJERAD LOGGNING AV ALLA INSAMLADE BILDER
                        if (allImages.length > 0) {
                            console.log(`   �️ LISTA ÖVER ALLA INSAMLADE BILDLÄNKAR:`);
                            allImages.forEach((img, idx) => {
                                console.log(`      ${idx + 1}. ${img}`);
                            });
                        } else {
                            console.log(`   ⚠️ VARNING: Inga bilder hittades för denna produkt!`);
                        }
                        
                        // Samla produktinformation från produktsidan
                        console.log(`📊 Samlar produktinformation från Eprolo...`);
                        const productData = await page.evaluate((images) => {
                            const getTextContent = (selectors) => {
                                if (typeof selectors === 'string') selectors = [selectors];
                                for (const selector of selectors) {
                                    const element = document.querySelector(selector);
                                    if (element && element.textContent.trim()) {
                                        return element.textContent.trim();
                                    }
                                }
                                return '';
                            };
                            
                            const getAllText = (selectors) => {
                                if (typeof selectors === 'string') selectors = [selectors];
                                let allText = [];
                                for (const selector of selectors) {
                                    const elements = document.querySelectorAll(selector);
                                    elements.forEach(el => {
                                        if (el.textContent.trim()) {
                                            allText.push(el.textContent.trim());
                                        }
                                    });
                                }
                                return allText.join(', ');
                            };

                            const normalizeVariantValue = (value) => {
                                if (!value) return '';
                                const v = String(value).replace(/\s+/g, ' ').trim();
                                if (!v) return '';
                                const lc = v.toLowerCase();
                                
                                // Filtrera bort ogiltiga värden
                                if (lc === 'select' || lc === 'choose' || lc === 'choose an option') return '';
                                
                                // Filtrera bort leveransinformation
                                if (lc.includes('delivery') || lc.includes('shipping') || lc.includes('business days') || 
                                    lc.includes('estimated') || lc.includes('learn more') || lc.includes('via') ||
                                    lc.includes('united states') || lc.includes('4px') || lc.includes('yanwen')) return '';
                                
                                // Filtrera bort tabellrubriker och dimensioner
                                if (lc.includes('bust') || lc.includes('sleeve length') || lc.includes('shoulder width') ||
                                    lc.includes('size') && (lc.includes('bust') || lc.includes('length'))) return '';
                                
                                // Filtrera bort för långa värden (troligen inte en färg eller storlek)
                                if (v.length > 30) return '';
                                
                                // Filtrera bort vanliga UI-texter och instruktioner
                                if (lc.includes('color') || lc.includes('colour') || lc.includes('färg') ||
                                    lc.includes('size') || lc.includes('storlek') ||
                                    lc.includes('please') || lc.includes('vänligen') ||
                                    lc.includes('click') || lc.includes('klicka')) return '';
                                
                                return v;
                            };

                            const uniqueNonEmpty = (values) => {
                                const out = [];
                                const seen = new Set();
                                for (const val of values) {
                                    const v = normalizeVariantValue(val);
                                    if (!v) continue;
                                    const key = v.toLowerCase();
                                    if (seen.has(key)) continue;
                                    seen.add(key);
                                    out.push(v);
                                }
                                return out;
                            };

                            const extractVariantsFromControls = (type) => {
                                const typeLc = String(type).toLowerCase();
                                const results = [];
                                console.log(`🔍 Extraherar ${type}...`);

                                // FÖRBÄTTRAD METOD 0: Sök i JSON-LD och script-taggar först (mest tillförlitlig)
                                try {
                                    const scripts = document.querySelectorAll('script:not([src])');
                                    scripts.forEach(script => {
                                        const content = script.textContent;
                                        if (!content) return;
                                        
                                        // Sök efter JSON-objekt med variants/options
                                        try {
                                            // Försök hitta JSON-strukturer
                                            const jsonMatches = content.match(/\{[^{}]*"(?:variants|options|skus|colors|sizes|attributes)"[^{}]*\}/g);
                                            if (jsonMatches) {
                                                jsonMatches.forEach(jsonStr => {
                                                    try {
                                                        const data = JSON.parse(jsonStr);
                                                        if (typeLc === 'color') {
                                                            ['colors', 'colour', 'color', 'colorOptions', 'colourOptions'].forEach(key => {
                                                                if (data[key] && Array.isArray(data[key])) {
                                                                    data[key].forEach(c => {
                                                                        if (typeof c === 'string') results.push(c);
                                                                        else if (c.name) results.push(c.name);
                                                                        else if (c.value) results.push(c.value);
                                                                    });
                                                                }
                                                            });
                                                        } else {
                                                            ['sizes', 'size', 'sizeOptions'].forEach(key => {
                                                                if (data[key] && Array.isArray(data[key])) {
                                                                    data[key].forEach(s => {
                                                                        if (typeof s === 'string') results.push(s);
                                                                        else if (s.name) results.push(s.name);
                                                                        else if (s.value) results.push(s.value);
                                                                    });
                                                                }
                                                            });
                                                        }
                                                    } catch (e) {}
                                                });
                                            }
                                        } catch (e) {}
                                        
                                        // Sök efter array-mönster i JavaScript-kod
                                        if (typeLc === 'color') {
                                            const colorArrayMatch = content.match(/(?:colors?|colours?)\s*[:=]\s*\[(["'][^"'\]]+["'][,\s]*)+\]/gi);
                                            if (colorArrayMatch) {
                                                colorArrayMatch.forEach(match => {
                                                    const colors = match.match(/["']([^"']+)["']/g);
                                                    if (colors) colors.forEach(c => results.push(c.replace(/["']/g, '')));
                                                });
                                            }
                                        } else {
                                            const sizeArrayMatch = content.match(/sizes?\s*[:=]\s*\[(["'][^"'\]]+["'][,\s]*)+\]/gi);
                                            if (sizeArrayMatch) {
                                                sizeArrayMatch.forEach(match => {
                                                    const sizes = match.match(/["']([^"']+)["']/g);
                                                    if (sizes) sizes.forEach(s => results.push(s.replace(/["']/g, '')));
                                                });
                                            }
                                        }
                                    });
                                    
                                    if (results.length > 0) {
                                        console.log(`  ✅ Hittade ${results.length} ${type} från script-taggar`);
                                    }
                                } catch (e) {
                                    console.log(`  ⚠️ Fel vid script-parsing: ${e.message}`);
                                }

                                // Metod 1: Select-element
                                const selectQueries = typeLc === 'color'
                                    ? [
                                        'select[name*="color" i]', 'select[id*="color" i]', 'select[class*="color" i]',
                                        'select[name*="colour" i]', 'select[id*="colour" i]', 'select[class*="colour" i]',
                                        'select[data-variant*="color" i]', 'select[data-variant*="colour" i]'
                                    ]
                                    : [
                                        'select[name*="size" i]', 'select[id*="size" i]', 'select[class*="size" i]',
                                        'select[data-variant*="size" i]'
                                    ];

                                for (const q of selectQueries) {
                                    const selects = document.querySelectorAll(q);
                                    if (selects.length > 0) {
                                        console.log(`  Hittade ${selects.length} select-element med "${q}"`);
                                    }
                                    selects.forEach(sel => {
                                        sel.querySelectorAll('option').forEach(opt => {
                                            const txt = opt.textContent;
                                            if (txt) {
                                                console.log(`    Option: ${txt}`);
                                                results.push(txt);
                                            }
                                        });
                                    });
                                }

                                // Metod 2: Klickbara element och data-attribut
                                const clickableQueries = typeLc === 'color'
                                    ? [
                                        '[data-color]', '[data-colour]', '[aria-label*="color" i]', '[aria-label*="colour" i]',
                                        '.color-option', '.colour-option',
                                        '.variant-color', '.product-color',
                                        // Eprolo-specifika selektorer
                                        '.sku-color', '.sku-colour', '.variant-item[data-color]', '.variant-option[data-color]',
                                        '[data-sku-color]', '[data-variant-color]', '.color-swatch', '.colour-swatch',
                                        '.color-selector button', '.colour-selector button', '.color-picker button',
                                        'button[data-color]', 'button[data-colour]', 'li[data-color]', 'li[data-colour]',
                                        '.attribute-color', '.option-color', 'input[name*="color"]:not([type="text"])', 'input[name*="colour"]:not([type="text"])'
                                    ]
                                    : [
                                        '[data-size]', '[aria-label*="size" i]',
                                        '.size-option', '.variant-size', '.product-size',
                                        '.size-selector',
                                        // Eprolo-specifika selektorer
                                        '.sku-size', '.variant-item[data-size]', '.variant-option[data-size]',
                                        '[data-sku-size]', '[data-variant-size]', '.size-selector button',
                                        'button[data-size]', 'li[data-size]', '.attribute-size', '.option-size',
                                        'input[name*="size"]:not([type="text"])'
                                    ];

                                for (const q of clickableQueries) {
                                    const nodes = document.querySelectorAll(q);
                                    if (nodes.length > 0) {
                                        console.log(`  Hittade ${nodes.length} element med "${q}"`);
                                    }
                                    nodes.forEach(el => {
                                        const attrs = [
                                            el.getAttribute('data-color'),
                                            el.getAttribute('data-colour'),
                                            el.getAttribute('data-size'),
                                            el.getAttribute('aria-label'),
                                            el.getAttribute('title'),
                                            el.getAttribute('value')
                                        ];
                                        for (const a of attrs) {
                                            if (a) {
                                                console.log(`    Attribut: ${a}`);
                                                results.push(a);
                                            }
                                        }
                                        const txt = el.textContent?.trim();
                                        if (txt && txt.length > 0 && txt.length <= 50) {
                                            console.log(`    Text: ${txt}`);
                                            results.push(txt);
                                        }
                                    });
                                }

                                // Metod 3: Sök i tabeller och listor (MED FILTRERING)
                                const tableRows = document.querySelectorAll('tr, li');
                                tableRows.forEach(row => {
                                    const text = row.textContent?.toLowerCase() || '';
                                    
                                    // Hoppa över rader med leveransinformation
                                    if (text.includes('delivery') || text.includes('shipping') || text.includes('business days') ||
                                        text.includes('estimated') || text.includes('via') || text.includes('learn more')) {
                                        return;
                                    }
                                    
                                    if ((typeLc === 'color' && (text.includes('color') || text.includes('colour') || text.includes('färg'))) ||
                                        (typeLc === 'size' && (text.includes('size') || text.includes('storlek')))) {
                                        const values = row.textContent?.split(/[,;:|]/).map(v => v.trim()).filter(v => {
                                            const vLower = v.toLowerCase();
                                            return v.length > 0 && v.length <= 30 && 
                                                   !vLower.includes('delivery') && 
                                                   !vLower.includes('shipping') &&
                                                   !vLower.includes('bust') &&
                                                   !vLower.includes('sleeve');
                                        });
                                        if (values) {
                                            values.forEach(v => {
                                                console.log(`    Från tabell/lista: ${v}`);
                                                results.push(v);
                                            });
                                        }
                                    }
                                });

                                const uniqueResults = uniqueNonEmpty(results);
                                console.log(`✅ Totalt ${uniqueResults.length} unika ${type} hittade`);
                                
                                // Returnera resultaten utan fallback - låt den yttre logiken hantera tomma resultat
                                return uniqueResults;
                            };
                            
                            const getVideoSrc = () => {
                                const video = document.querySelector('video source, video');
                                return video ? (video.src || video.querySelector('source')?.src || '') : '';
                            };

                            const getMetaContent = (selector) => {
                                const el = document.querySelector(selector);
                                const v = el?.getAttribute('content') || '';
                                return v.trim();
                            };

                            const parseJsonLd = () => {
                                const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
                                const out = [];
                                for (const s of scripts) {
                                    const text = (s.textContent || '').trim();
                                    if (!text) continue;
                                    try {
                                        const parsed = JSON.parse(text);
                                        out.push(parsed);
                                    } catch (e) {
                                        // ignore
                                    }
                                }
                                return out;
                            };

                            const findProductFromJsonLd = () => {
                                const blobs = parseJsonLd();
                                const queue = [...blobs];
                                while (queue.length) {
                                    const node = queue.shift();
                                    if (!node) continue;
                                    if (Array.isArray(node)) {
                                        queue.push(...node);
                                        continue;
                                    }
                                    if (typeof node === 'object') {
                                        const type = node['@type'] || node.type;
                                        if (type && String(type).toLowerCase() === 'product') {
                                            return node;
                                        }
                                        if (node['@graph']) queue.push(node['@graph']);
                                        for (const k of Object.keys(node)) {
                                            const v = node[k];
                                            if (v && typeof v === 'object') queue.push(v);
                                        }
                                    }
                                }
                                return null;
                            };

                            const extractProductName = () => {
                                const fromOg = getMetaContent('meta[property="og:title"]');
                                if (fromOg) return fromOg;

                                const productLd = findProductFromJsonLd();
                                const fromLd = productLd?.name;
                                if (fromLd) return String(fromLd).trim();

                                const fromTitle = (document.title || '').trim();
                                if (fromTitle) return fromTitle;

                                return '';
                            };

                            const extractPrice = () => {
                                console.log('🔍 Försöker extrahera pris...');
                                
                                // Metod 1: JSON-LD strukturerad data
                                const productLd = findProductFromJsonLd();
                                const ldOffers = productLd?.offers;
                                const ldOffer = Array.isArray(ldOffers) ? ldOffers[0] : ldOffers;
                                const ldPrice = ldOffer?.price || ldOffer?.lowPrice || ldOffer?.highPrice;
                                if (ldPrice !== undefined && ldPrice !== null && String(ldPrice).trim() !== '') {
                                    const n = String(ldPrice).match(/[\d,]+\.?\d*/);
                                    if (n) {
                                        console.log(`✅ Pris från JSON-LD: ${n[0]}`);
                                        return n[0].replace(',', '');
                                    }
                                }

                                // Metod 2: Itemprop price
                                const itempropPrice = document.querySelector('[itemprop="price"]')?.getAttribute('content')
                                    || document.querySelector('[itemprop="price"]')?.textContent
                                    || '';
                                if (itempropPrice && String(itempropPrice).trim()) {
                                    const n = String(itempropPrice).match(/[\d,]+\.?\d*/);
                                    if (n) {
                                        console.log(`✅ Pris från itemprop: ${n[0]}`);
                                        return n[0].replace(',', '');
                                    }
                                }

                                // Metod 3: Utökade CSS-selektorer för Eprolo
                                const priceSelectors = [
                                    '.price', '.product-price', '.current-price', '.sale-price',
                                    '.amount', '.cost', '.value', '.pricing', '.price-current',
                                    '[data-price]', '.price-amount', '.product-cost',
                                    '.price-box', '.final-price', '.regular-price', '.special-price',
                                    '.price-wrapper', '.price-container', '.product-price-value',
                                    '[class*="price"]', '[id*="price"]', '.money', '.currency',
                                    '.price-tag', '.price-info', '.product-price-wrapper',
                                    // Eprolo-specifika selektorer
                                    '.goods-price', '.sku-price', '.item-price', '.detail-price'
                                ];

                                for (const selector of priceSelectors) {
                                    const elements = document.querySelectorAll(selector);
                                    for (const element of elements) {
                                        if (element) {
                                            let priceText = element.textContent.trim();
                                            const priceMatch = priceText.match(/[\d,]+\.?\d*/);
                                            if (priceMatch && parseFloat(priceMatch[0].replace(',', '')) > 0) {
                                                console.log(`✅ Pris från selector "${selector}": ${priceMatch[0]}`);
                                                return priceMatch[0].replace(',', '');
                                            }
                                        }
                                    }
                                }

                                // Metod 4: Sök i hela dokumentet efter pris med valutasymboler
                                const bodyText = document.body.textContent;
                                const pricePatterns = [
                                    /\$\s*([\d,]+\.?\d*)/g,
                                    /USD\s*([\d,]+\.?\d*)/gi,
                                    /([\d,]+\.?\d*)\s*USD/gi,
                                    /Price[:\s]*([\d,]+\.?\d*)/gi
                                ];

                                for (const pattern of pricePatterns) {
                                    const matches = [...bodyText.matchAll(pattern)];
                                    for (const match of matches) {
                                        const priceValue = match[1].replace(',', '');
                                        if (parseFloat(priceValue) > 0) {
                                            console.log(`✅ Pris från textmönster: ${priceValue}`);
                                            return priceValue;
                                        }
                                    }
                                }

                                console.log('⚠️ Inget pris hittades, returnerar null');
                                return null; // Returnera null istället för '0' för att kunna hoppa över produkter utan pris
                            };

                            const calculateProfitMargin = (basePrice) => {
                                if (basePrice === null || basePrice === undefined) {
                                    console.log('⚠️ Inget pris tillgängligt för marginalberäkning');
                                    return null;
                                }
                                
                                const price = parseFloat(basePrice) || 0;
                                
                                if (price <= 0) {
                                    console.log('⚠️ Ogiltigt pris för marginalberäkning');
                                    return null;
                                }
                                
                                let margin = 0;

                                if (price >= 0 && price <= 50) {
                                    margin = 33;
                                } else if (price > 50 && price <= 1000) {
                                    margin = 46;
                                } else if (price > 1000 && price <= 5000) {
                                    margin = 85;
                                } else if (price > 5000 && price <= 10000) {
                                    margin = 150;
                                } else if (price > 10000) {
                                    margin = 300;
                                }

                                const finalPrice = price + margin;
                                console.log(`💰 Prisberäkning: Original ${price} USD + Marginal ${margin} USD = ${finalPrice.toFixed(2)} USD`);
                                return finalPrice.toFixed(2);
                            };

                            return {
                                produktnamn: (extractProductName() || getTextContent([
                                    '.product-title', '.product-name', '.title', '.product-title h1',
                                    '.name', '.product-name h1', '.product-header',
                                    '.item-title', '.goods-name', '.catalog-title',
                                    'h1'
                                ]) || 'Okänd produkt'),

                                originalpris: extractPrice(),
                                pris: (() => {
                                    const basePrice = extractPrice();
                                    return calculateProfitMargin(basePrice);
                                })(),

                                rabatt: getTextContent([
                                    '.discount', '.sale', '.off', '.save', '.discount-percent',
                                    '.savings', '.deal', '.promotion'
                                ]) || '',

                                
                                images: images,
                                
                                image: (() => {
                                    console.log(`🔍 Skapar image-fält från ${images.length} bilder`);
                                    if (images && images.length > 0) {
                                        // Ta bort thumbnail-parametrar från alla bildlänkar
                                        const cleanedImages = images.map(url => {
                                            // Ta bort allt efter .jpg, .jpeg, .png, .gif, .webp (inklusive query-parametrar)
                                            const match = url.match(/^(.*?\.(jpg|jpeg|png|gif|webp))/i);
                                            if (match) {
                                                const cleanUrl = match[1];
                                                console.log(`   🧹 Rensade: ${url.substring(0, 80)}...`);
                                                console.log(`   ✅ Till: ${cleanUrl.substring(0, 80)}...`);
                                                return cleanUrl;
                                            }
                                            return url; // Returnera original om inget match
                                        });
                                        
                                        // Returnera alla rensade bilder separerade med kommatecken
                                        const joinedImages = cleanedImages.join(', ');
                                        console.log(`✅ Image-fält skapat med ${cleanedImages.length} rensade bilder`);
                                        return joinedImages;
                                    }
                                    // Fallback: Försök hitta minst en bild på sidan
                                    console.log(`⚠️ Ingen bild i images-array, använder fallback`);
                                    const imgElements = document.querySelectorAll('img');
                                    for (const img of imgElements) {
                                        if (img.src && img.src.startsWith('http') && 
                                            !img.src.includes('logo') && 
                                            !img.src.includes('icon') &&
                                            img.width > 100 && img.height > 100) {
                                            console.log(`✅ Fallback-bild hittad: ${img.src}`);
                                            return img.src;
                                        }
                                    }
                                    console.log(`❌ Ingen bild hittades alls`);
                                    return '';
                                })(),
                                
                                video: getVideoSrc(),
                                
                                sku: getTextContent([
                                    '.sku', '.product-sku', '.item-code', '.product-code',
                                    '.model', '.part-number'
                                ]) || `SKU_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                                
                                produkt_id: getTextContent([
                                    '.product-id', '.item-id', '[data-product-id]',
                                    '.goods-id', '.catalog-id'
                                ]) || `PROD_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                                
                                storlek: (() => {
                                    const extractedSizes = extractVariantsFromControls('size').join(', ');
                                    if (extractedSizes && extractedSizes.trim() !== '') {
                                        return extractedSizes;
                                    }
                                    
                                    const textSizes = getAllText([
                                        '.sizes', '.size-options', '.product-sizes', '.size-guide',
                                        '.size-chart', '.size-selector', '.size-list', '[data-size]',
                                        '.variant-size', '.sku-size'
                                    ]);
                                    
                                    if (textSizes && textSizes.trim() !== '') {
                                        return textSizes;
                                    }
                                    
                                    // EPROLO-SPECIFIK: Sök efter "Size:" i synlig text (inte i style-taggar)
                                    try {
                                        // Hitta alla textnoder som innehåller "Size:"
                                        const walker = document.createTreeWalker(
                                            document.body,
                                            NodeFilter.SHOW_TEXT,
                                            {
                                                acceptNode: function(node) {
                                                    // Filtrera bort script, style och hidden elements
                                                    const parent = node.parentElement;
                                                    if (!parent) return NodeFilter.FILTER_REJECT;
                                                    const tagName = parent.tagName.toLowerCase();
                                                    if (tagName === 'script' || tagName === 'style' || tagName === 'noscript') {
                                                        return NodeFilter.FILTER_REJECT;
                                                    }
                                                    // Kontrollera om texten innehåller "Size:"
                                                    if (node.textContent.match(/Size\s*:/i)) {
                                                        return NodeFilter.FILTER_ACCEPT;
                                                    }
                                                    return NodeFilter.FILTER_REJECT;
                                                }
                                            }
                                        );
                                        
                                        let sizeNode;
                                        while (sizeNode = walker.nextNode()) {
                                            const text = sizeNode.textContent;
                                            const sizeMatch = text.match(/Size\s*:\s*([A-Z0-9,\s]+?)(?:\s*Unit|\s*Cm|\s*Color|$)/i);
                                            if (sizeMatch && sizeMatch[1]) {
                                                const sizes = sizeMatch[1].trim();
                                                // Validera att det inte är CSS (innehåller inte px, %, em, etc.)
                                                if (!sizes.match(/px|%|em|rem|pt|float|margin|padding|;/i)) {
                                                    console.log(`📏 Extraherade storlekar från synlig text: "${sizes}"`);
                                                    return sizes;
                                                }
                                            }
                                        }
                                    } catch (e) {
                                        console.log(`⚠️ Fel vid TreeWalker: ${e.message}`);
                                    }
                                    
                                    // Returnera tom sträng istället för standardstorlekar
                                    console.log('⚠️ Inga storlekar hittades');
                                    return '';
                                })(),
                                
                                farg: (() => {
                                    const extractedColors = extractVariantsFromControls('color').join(', ');
                                    console.log(`🎨 Extraherade färger från controls: "${extractedColors}"`);
                                    
                                    if (extractedColors && extractedColors.trim() !== '') {
                                        return extractedColors;
                                    }
                                    
                                    const textColors = getAllText([
                                        '.colors', '.color-options', '.product-colors', '.color-variants',
                                        '.color-choices', '.available-colors', '.color-selector', 
                                        '.color-list', '[data-color]', '.variant-color', '.sku-color'
                                    ]);
                                    console.log(`🎨 Extraherade färger från text: "${textColors}"`);
                                    
                                    if (textColors && textColors.trim() !== '') {
                                        return textColors;
                                    }
                                    
                                    // EPROLO-SPECIFIK: Sök efter "Color:" i synlig text (inte i style-taggar)
                                    try {
                                        const walker = document.createTreeWalker(
                                            document.body,
                                            NodeFilter.SHOW_TEXT,
                                            {
                                                acceptNode: function(node) {
                                                    const parent = node.parentElement;
                                                    if (!parent) return NodeFilter.FILTER_REJECT;
                                                    const tagName = parent.tagName.toLowerCase();
                                                    if (tagName === 'script' || tagName === 'style' || tagName === 'noscript') {
                                                        return NodeFilter.FILTER_REJECT;
                                                    }
                                                    if (node.textContent.match(/Color\s*:/i)) {
                                                        return NodeFilter.FILTER_ACCEPT;
                                                    }
                                                    return NodeFilter.FILTER_REJECT;
                                                }
                                            }
                                        );
                                        
                                        let colorNode;
                                        while (colorNode = walker.nextNode()) {
                                            const text = colorNode.textContent;
                                            const colorMatch = text.match(/Color\s*:\s*([A-Za-z0-9,\s]+?)(?:\s*Size|\s*Unit|$)/i);
                                            if (colorMatch && colorMatch[1]) {
                                                const colors = colorMatch[1].trim();
                                                // Validera att det inte är CSS
                                                if (!colors.match(/px|%|em|rem|pt|#[0-9a-f]{3,6}|rgb|rgba|float|margin|padding|;/i)) {
                                                    console.log(`🎨 Extraherade färger från synlig text: "${colors}"`);
                                                    return colors;
                                                }
                                            }
                                        }
                                    } catch (e) {
                                        console.log(`⚠️ Fel vid TreeWalker: ${e.message}`);
                                    }
                                    
                                    // Returnera tom sträng istället för standardfärger
                                    console.log(`⚠️ Inga färger hittades`);
                                    return '';
                                })(),
                                
                                kategori: getTextContent([
                                    '.category', '.product-category', '.breadcrumb', '.breadcrumbs',
                                    '.nav-path', '.category-path'
                                ]) || '',
                                
                                märke: getTextContent([
                                    '.brand', '.manufacturer', '.vendor', '.brand-name',
                                    '.maker', '.company'
                                ]) || '',
                                
                                material: getAllText([
                                    '.material', '.fabric', '.composition', '.materials',
                                    '.made-of', '.construction'
                                ]) || '',
                                
                                vikt: getTextContent([
                                    '.weight', '.shipping-weight', '.product-weight',
                                    '.mass', '.kg', '.lbs'
                                ]) || '',
                                
                                dimensioner: getAllText([
                                    '.dimensions', '.size', '.measurements', '.specs',
                                    '.length', '.width', '.height', '.depth'
                                ]) || '',
                                
                                leveranstid: getTextContent([
                                    '.delivery-time', '.shipping-time', '.lead-time', '.delivery',
                                    '.shipping-info', '.arrival-time'
                                ]) || '',
                                
                                lager: getTextContent([
                                    '.stock', '.inventory', '.availability', '.in-stock', '.stock-status',
                                    '.quantity', '.available', '.supply'
                                ]) || '',
                                
                                betyg: getTextContent([
                                    '.rating', '.stars', '.review-score', '.product-rating',
                                    '.score', '.grade'
                                ]) || '',
                                
                                recensioner: getAllText([
                                    '.reviews', '.review-count', '.testimonials', '.review-summary',
                                    '.feedback', '.comments'
                                ]) || '',
                                
                                url: window.location.href,
                                
                                scraped_at: new Date().toISOString()
                            };
                        }, allImages);
                        
                        console.log(`✅ Produktdata insamlad från Eprolo: ${productData.produktnamn}`);
                        console.log(`   💰 Originalpris: ${productData.originalpris || 'SAKNAS'} USD`);
                        console.log(`   💰 Slutpris (med marginal): ${productData.pris || 'SAKNAS'} USD`);
                        console.log(`   🎨 Färger extraherade: "${productData.farg || 'SAKNAS'}"`);
                        console.log(`   📏 Storlekar: ${productData.storlek || 'SAKNAS'}`);
                        console.log(`   🖼️ Totalt antal bilder: ${productData.images.length} st`);
                        console.log(`   📸 Bildlänkar i Image-kolumn: ${productData.image ? productData.image.split(', ').length : 0} st`);
                        console.log(`   🔑 SKU: ${productData.sku}`);
                        
                        // VALIDERING: Kontrollera att kritisk produktdata finns
                        const missingData = [];
                        if (!productData.pris || productData.pris === null) missingData.push('pris');
                        if (!productData.produktnamn || productData.produktnamn === 'Okänd produkt') missingData.push('produktnamn');
                        if (!productData.image || productData.image.trim() === '') missingData.push('bilder');
                        
                        // Kontrollera antal bilder
                        const imageCount = productData.image ? productData.image.split(', ').length : 0;
                        if (imageCount < MIN_IMAGES) {
                            console.log(`⚠️ VARNING: Produkten har endast ${imageCount} bilder (minimum: ${MIN_IMAGES})`);
                            console.log(`   ℹ️ Fortsätter ändå med tillgängliga bilder...`);
                        }
                        
                        if (missingData.length > 0) {
                            console.log(`❌ OFULLSTÄNDIG PRODUKTDATA - Hoppar över produkt`);
                            console.log(`   Saknas: ${missingData.join(', ')}`);
                            productIndex++;
                            continue;
                        }
                        
                        console.log(`✅ Produktdata validerad - alla kritiska fält finns (${imageCount} bilder)`);
                        
                        // Markera denna produkt som bearbetad
                        processedProductsOnCurrentPage.add(productIdentifier);
                        
                        // Kontrollera om produkten redan finns i Eprolo-tabellen (använd SKU som primär identifierare)
                        let existingProduct = null;
                        try {
                            existingProduct = await dbClient.execute({
                                sql: `SELECT id, namn FROM Eprolo WHERE sku = ?`,
                                args: [productData.sku]
                            });
                        } catch (checkError) {
                            console.error(`❌ Fel vid kontroll av befintlig produkt:`, checkError.message);
                            continue; // Hoppa över denna produkt om vi inte kan kontrollera
                        }
                        
                        if (existingProduct && existingProduct.rows.length > 0) {
                            console.log(`⚠️ DUBLETT - Produkten finns redan i databasen:`);
                            console.log(`   Befintlig: ${existingProduct.rows[0].namn}`);
                            console.log(`   SKU: ${productData.sku}`);
                            console.log(`   ⏭️ Hoppar över...`);
                            productIndex++;
                            continue; // Hoppa över dubbletter
                        }
                        
                        // Importera produkten till Eprolo-tabellen i databasen
                        try {
                            const insertResult = await dbClient.execute({
                                sql: `INSERT INTO Eprolo (
                                    namn, Image, video, price, color, size, sku
                                ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                                args: [
                                    productData.produktnamn || 'Okänd produkt',
                                    productData.image || '',
                                    productData.video || '',
                                    productData.pris || '',
                                    productData.farg || '',
                                    productData.storlek || '',
                                    productData.sku || `SKU_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
                                ]
                            });
                            
                            console.log(`💾 ✅ IMPORTERAD TILL DATABAS: ${productData.produktnamn}`);
                            console.log(`   📦 SKU: ${productData.sku}, 💰 Pris: ${productData.pris}`);
                            console.log(`   �️ Databas-ID: ${insertResult.lastInsertRowid || 'N/A'}`);
                            console.log(`   � Rader påverkade: ${insertResult.rowsAffected || 0}`);

                            totalProducts++;
                            productsSinceLastCatalogReturn++;
                            console.log(`   📊 Totalt importerade: ${totalProducts}`);
                            console.log(`   🔄 Produkter sedan senaste katalogåtergång: ${productsSinceLastCatalogReturn}/20`);
                            
                            // Gå till nästa produkt (INGEN återgång till katalog här)
                            productIndex++;

                        } catch (dbError) {
                            console.error(`❌ DATABASFEL vid import av ${productData.produktnamn}:`, dbError.message);
                            console.error(`   SKU: ${productData.sku}`);
                            productIndex++;
                        }
                        
                        // OPTIMERING: Reducerad väntetid mellan produkter
                        await new Promise(resolve => setTimeout(resolve, 500)); // Reducerat från 1000ms
                        
                    } catch (clickError) {
                        console.error(`❌ Fel vid hantering av produkt ${productIndex + 1}:`, clickError.message);
                        
                        // Markera produkten som bearbetad även om den misslyckades för att undvika oändlig loop
                        processedProductsOnCurrentPage.add(productIdentifier);
                        
                        // Gå till nästa produkt
                        productIndex++;
                    }
                }
                
                // Kontrollera om vi har importerat 20 produkter - då går vi till nästa sida
                if (productsSinceLastCatalogReturn >= 20) {
                    console.log(`\n🎯 === 20 PRODUKTER IMPORTERADE - ÅTERGÅR TILL KATALOG OCH GÅR TILL NÄSTA SIDA ===`);
                    productsSinceLastCatalogReturn = 0; // Återställ räknaren
                    
                    // Markera sidan som importerad innan vi går vidare
                    importedPages.add(currentPage);
                    newlyImportedPages.add(currentPage);
                    saveImportedPages(importedPages);
                    console.log(`✅ Sida ${currentPage} markerad som importerad (20 produkter)`);
                    
                    // STEG 1: Återgå till katalogen
                    console.log(`\n🔙 === ÅTERGÅR TILL KATALOGEN ===`);
                    await page.goto('https://eprolo.com/app/newProductsCatalog.html?waretypeid=24', { 
                        waitUntil: 'networkidle0',
                        timeout: 60000 
                    });
                    
                    console.log('⏳ Väntar på att katalogen ska ladda...');
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    
                    // STEG 2: Navigera till nästa sida via paginering
                    const navigationResult = await goToNextPage(page, currentPage);
                    
                    if (!navigationResult.success) {
                        console.log(`❌ Navigering misslyckades: ${navigationResult.reason}`);
                        console.log(`⚠️ Försöker igen om 5 sekunder...`);
                        await new Promise(resolve => setTimeout(resolve, 5000));
                        continue;
                    }
                    
                    // Uppdatera currentPage och återställ räknare
                    currentPage = navigationResult.page;
                    productIndex = 0;
                    processedProductsOnCurrentPage.clear();
                    
                    // Hoppa direkt till nästa iteration - INGEN ytterligare paginering
                    continue;
                }
                
                // Om vi kommer hit har vi bearbetat alla produkter på sidan (men färre än 20)
                // Markera sidan som importerad
                importedPages.add(currentPage);
                newlyImportedPages.add(currentPage);
                saveImportedPages(importedPages);
                console.log(`✅ Sida ${currentPage} helt bearbetad och markerad som importerad`);
                console.log(`📋 Importerade sidor hittills: ${Array.from(importedPages).sort((a, b) => a - b).join(', ')}`);
                
                // === PAGINERING: Gå till nästa sida genom att klicka på sidnummer ===
                // ENDAST om vi INTE redan paginerat i denna iteration
                const paginationResult = await goToNextPage(page, currentPage);
                
                if (!paginationResult.success) {
                    console.log(`❌ Paginering misslyckades: ${paginationResult.reason}`);
                    
                    // Kontrollera om vi har nått målet
                    const finalCountResult = await dbClient.execute('SELECT COUNT(*) as total FROM Eprolo');
                    const finalTotalProducts = finalCountResult.rows[0].total;
                    
                    if (finalTotalProducts >= TOTAL_EXPECTED_PRODUCTS) {
                        console.log(`🎉 Alla ${TOTAL_EXPECTED_PRODUCTS.toLocaleString('sv-SE')} produkter har importerats!`);
                        break;
                    } else {
                        console.log(`⚠️ Endast ${finalTotalProducts.toLocaleString('sv-SE')} produkter - försöker igen...`);
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        continue;
                    }
                }
                
                // Uppdatera currentPage
                currentPage = paginationResult.page;
                console.log(`✅ ✅ ✅ VERIFIERAD NAVIGERING: Nu på sida ${currentPage} ✅ ✅ ✅`);
                
                console.log(`\n📋 === SAMMANFATTNING ===`);
                console.log(`   Fortsätter med sida: ${currentPage}`);
                console.log(`   Importerade sidor: ${Array.from(importedPages).sort((a, b) => a - b).join(', ')}`);
                
                // Vänta lite innan nästa sida
                await new Promise(resolve => setTimeout(resolve, 2000));
                
            } catch (error) {
                console.error(`❌ Fel på sida ${currentPage}:`, error.message);
                currentPage++;
            }
        }
        
        console.log(`\n🎉 === SCRAPING SLUTFÖRT! ===`);
        console.log(`📊 Totalt produkter importerade till databasen: ${totalProducts}`);
        console.log(`📄 Eprolo-sidor genomsökta: ${currentPage}`);
        console.log(`📋 Nyimporterade sidor i denna körning: ${Array.from(newlyImportedPages).sort((a, b) => a - b).join(', ')}`);
        console.log(`📚 Totalt antal importerade sidor: ${importedPages.size}`);
        
        // Kontrollera faktiskt antal produkter i databasen
        try {
            const countResult = await dbClient.execute('SELECT COUNT(*) as total FROM Eprolo');
            const totalInDb = countResult.rows[0].total;
            console.log(`🗄️ Totalt produkter i Eprolo-tabellen: ${totalInDb.toLocaleString('sv-SE')}`);
            console.log(`📈 Framsteg: ${((totalInDb / TOTAL_EXPECTED_PRODUCTS) * 100).toFixed(2)}% av ${TOTAL_EXPECTED_PRODUCTS.toLocaleString('sv-SE')} produkter`);
            
            // Visa de senaste produkterna
            const latestProducts = await dbClient.execute(`
                SELECT namn, price, sku, id 
                FROM Eprolo 
                ORDER BY id DESC 
                LIMIT 5
            `);
            
            console.log(`\n📋 Senaste 5 produkterna i databasen:`);
            latestProducts.rows.forEach((product, index) => {
                console.log(`${index + 1}. ${product.namn} - ${product.price} (SKU: ${product.sku})`);
            });
            
            // Validera komplett import
            if (totalInDb >= TOTAL_EXPECTED_PRODUCTS) {
                console.log('\n🎉 === KOMPLETT IMPORT LYCKADES! ===');
                console.log(`✅ Alla ${TOTAL_EXPECTED_PRODUCTS.toLocaleString('sv-SE')} produkter har importerats sekventiellt`);
                console.log('✅ Ingen duplicering har upptäckts');
                console.log('✅ Import slutfördes framgångsrikt');
            } else {
                console.log('\n⏳ === IMPORT PÅGÅR ===');
                console.log(`ℹ️ ${totalInDb.toLocaleString('sv-SE')} av ${TOTAL_EXPECTED_PRODUCTS.toLocaleString('sv-SE')} produkter importerade`);
                console.log(`ℹ️ ${(TOTAL_EXPECTED_PRODUCTS - totalInDb).toLocaleString('sv-SE')} produkter återstår`);
                console.log('ℹ️ Kör skriptet igen för att fortsätta importen');
                console.log('ℹ️ Sekventiell paginering säkerställer att ingen sida missas');
            }
            
        } catch (countError) {
            console.error('❌ Kunde inte räkna produkter i databasen:', countError.message);
        }
        
    } catch (error) {
        console.error('❌ Kritiskt fel:', error.message);
    } finally {
        if (browser) {
            console.log('🔒 Stänger webbläsare automatiskt...');
            await browser.close();
            console.log('🔒 Webbläsare stängd');
        }
        if (dbClient) {
            dbClient.close();
            console.log('🔒 Databas stängd');
        }
    }
}

// Kör scrapern
runScraper();
