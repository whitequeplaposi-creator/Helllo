const puppeteer = require('puppeteer');
const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');

console.log('🚀 Startar Automatisk Paginerings-Scraper...');

// Fil för att spåra importerade sidor
const IMPORTED_PAGES_FILE = path.join(__dirname, 'imported-pages.json');

// Läs in redan importerade sidor
function loadImportedPages() {
    try {
        if (fs.existsSync(IMPORTED_PAGES_FILE)) {
            const data = fs.readFileSync(IMPORTED_PAGES_FILE, 'utf8');
            const imported = JSON.parse(data);
            console.log(`📋 Laddade ${imported.pages.length} redan importerade sidor`);
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
        console.log(`💾 Sparade ${data.pages.length} importerade sidor`);
    } catch (error) {
        console.log(`⚠️ Kunde inte spara: ${error.message}`);
    }
}

// AUTOMATISK PAGINERING: Klicka på nästa sidnummer
async function clickNextPageNumber(page, currentPageNum) {
    const nextPage = currentPageNum + 1;
    console.log(`\n🎯 Navigerar till sida ${nextPage} genom att klicka på sidnumret...`);
    
    // Scrolla till botten för att visa paginering
    await page.evaluate(async () => {
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise(r => setTimeout(r, 2000));
    });
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Klicka på sidnumret
    const clickResult = await page.evaluate((targetPage) => {
        const pagination = document.querySelector('.ant-pagination, [class*="pagination"]');
        if (!pagination) {
            return { success: false, reason: 'Ingen pagination hittades' };
        }
        
        // Hitta sidnummer-element
        const pageItems = pagination.querySelectorAll('.ant-pagination-item, li, a, button');
        const targetStr = String(targetPage);
        
        for (const item of pageItems) {
            const text = item.textContent.trim();
            if (text === targetStr) {
                const clickable = item.querySelector('a, button') || item;
                
                // Scrolla till och klicka
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
        
        return { success: false, reason: `Sidnummer ${targetPage} hittades inte` };
    }, nextPage);
    
    if (!clickResult.success) {
        console.log(`❌ Kunde inte klicka: ${clickResult.reason}`);
        return { success: false };
    }
    
    // Vänta på att sidan laddas
    console.log('⏳ Väntar på att nya produkter laddas...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Verifiera att vi är på rätt sida
    const verifiedPage = await page.evaluate(() => {
        const activeItem = document.querySelector('.ant-pagination-item-active');
        return activeItem ? parseInt(activeItem.textContent.trim()) : null;
    });
    
    if (verifiedPage === nextPage) {
        console.log(`✅ Lyckades navigera till sida ${nextPage}`);
        return { success: true, page: nextPage };
    } else {
        console.log(`⚠️ Förväntade sida ${nextPage} men är på sida ${verifiedPage}`);
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
        
        // Skapa tabell
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
        
        console.log('✅ Tabell klar');
        
        // Starta webbläsare
        console.log('🌐 Startar webbläsare...');
        browser = await puppeteer.launch({
            headless: false,
            defaultViewport: null,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--start-maximized',
                '--window-size=1920,1080'
            ]
        });
        
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        
        // Navigera till katalog
        console.log('📦 Navigerar till produktkatalog...');
        await page.goto('https://eprolo.com/app/newProductsCatalog.html', { 
            waitUntil: 'networkidle0',
            timeout: 60000 
        });
        
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // Ladda importerade sidor
        const importedPages = loadImportedPages();
        
        // Hitta nästa sida att importera
        let currentPage = 1;
        if (importedPages.size > 0) {
            const sortedPages = Array.from(importedPages).sort((a, b) => a - b);
            // Hitta första gapet
            for (let i = 1; i <= sortedPages[sortedPages.length - 1]; i++) {
                if (!importedPages.has(i)) {
                    currentPage = i;
                    break;
                }
            }
            // Om inget gap, fortsätt efter sista
            if (currentPage === 1 && importedPages.has(1)) {
                currentPage = sortedPages[sortedPages.length - 1] + 1;
            }
        }
        
        console.log(`🚀 Startar från sida ${currentPage}`);
        
        // HUVUDLOOP: Automatisk paginering
        while (true) {
            console.log(`\n=== BEARBETAR SIDA ${currentPage} ===`);
            
            // Hoppa över redan importerade sidor
            if (importedPages.has(currentPage)) {
                console.log(`⏭️ Sida ${currentPage} redan importerad, hoppar över`);
                currentPage++;
                continue;
            }
            
            // Scrolla och vänta på produkter
            await page.evaluate(async () => {
                window.scrollTo(0, 0);
                await new Promise(r => setTimeout(r, 2000));
            });
            
            // Hämta produkter på sidan
            const products = await page.evaluate(() => {
                const productElements = document.querySelectorAll('[data-product-id], [data-goods-id], .product-item, .goods-item');
                return Array.from(productElements).map(el => ({
                    id: el.getAttribute('data-product-id') || el.getAttribute('data-goods-id') || `prod_${Date.now()}`,
                    name: el.querySelector('.product-name, .goods-name, h3, h4')?.textContent?.trim() || 'Okänd produkt'
                }));
            });
            
            console.log(`📦 Hittade ${products.length} produkter på sida ${currentPage}`);
            
            if (products.length === 0) {
                console.log('⚠️ Inga produkter hittades, avslutar...');
                break;
            }
            
            // Här skulle du bearbeta varje produkt och spara till databas
            // För demonstration sparar vi bara sidnumret
            
            // Markera sidan som importerad
            importedPages.add(currentPage);
            saveImportedPages(importedPages);
            
            console.log(`✅ Sida ${currentPage} klar`);
            
            // Navigera till nästa sida genom att klicka på sidnumret
            const navigationResult = await clickNextPageNumber(page, currentPage);
            
            if (!navigationResult.success) {
                console.log('❌ Kunde inte navigera till nästa sida, avslutar...');
                break;
            }
            
            currentPage = navigationResult.page;
        }
        
        console.log('\n🎉 Scraping klar!');
        console.log(`📊 Totalt importerade sidor: ${importedPages.size}`);
        
    } catch (error) {
        console.error('❌ Fel:', error);
    } finally {
        if (browser) {
            await browser.close();
        }
        if (dbClient) {
            dbClient.close();
        }
    }
}

// Kör scraper
runScraper().catch(console.error);
