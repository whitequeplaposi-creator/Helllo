const { createClient } = require('@libsql/client');

async function checkDatabase() {
    console.log('🔍 Kontrollerar databas...\n');
    
    const dbClient = createClient({
        url: 'libsql://dostar-dostar.aws-ap-northeast-1.turso.io',
        authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzM5Mzc0NzIsImlkIjoiMDE5Y2QzN2QtYzYwMS03YWVjLTljMjctMzY0MmE2ZjA0YjIyIiwicmlkIjoiNzg3ZmQwMjYtZDk5OS00ZTM3LThiZjctODBlYmU2NGViYzRjIn0.mCRJdBnTFvhdvGyO4lmKEo0ExuCnl_wQo9soyKYrzjPOm09s06gUSPdP-yWU-e9SYmPYrgHaBBkEqx1ojNkWDg'
    });
    
    try {
        // Testa anslutning
        await dbClient.execute('SELECT 1');
        console.log('✅ Databas ansluten\n');
        
        // Lista alla tabeller i databasen
        console.log('📋 Alla tabeller i databasen:');
        const tables = await dbClient.execute(`
            SELECT name FROM sqlite_master 
            WHERE type='table' 
            ORDER BY name
        `);
        
        if (tables.rows.length > 0) {
            tables.rows.forEach(row => {
                console.log(`   - ${row.name}`);
            });
        } else {
            console.log('   Inga tabeller hittades');
        }
        console.log('');
        
        // Kontrollera tabellstruktur
        console.log('📋 Tabellstruktur för Eprolo:');
        const tableInfo = await dbClient.execute('PRAGMA table_info(Eprolo)');
        tableInfo.rows.forEach(row => {
            console.log(`   ${row.name} (${row.type}) ${row.notnull ? 'NOT NULL' : ''} ${row.pk ? 'PRIMARY KEY' : ''}`);
        });
        
        // Räkna produkter
        console.log('\n📊 Antal produkter:');
        const countResult = await dbClient.execute('SELECT COUNT(*) as total FROM Eprolo');
        const total = countResult.rows[0].total;
        console.log(`   Totalt: ${total} produkter\n`);
        
        if (total > 0) {
            // Visa de senaste 5 produkterna
            console.log('📦 Senaste 5 produkterna:');
            const latestProducts = await dbClient.execute(`
                SELECT id, namn, Image, price, color, size, sku
                FROM Eprolo 
                ORDER BY id DESC 
                LIMIT 5
            `);
            
            latestProducts.rows.forEach((row, index) => {
                console.log(`\n${index + 1}. ${row.namn}`);
                console.log(`   ID: ${row.id}`);
                console.log(`   SKU: ${row.sku}`);
                console.log(`   Pris: ${row.price}`);
                console.log(`   Färg: ${row.color || 'Ingen'}`);
                console.log(`   Storlek: ${row.size || 'Ingen'}`);
                console.log(`   Bild: ${row.Image ? (row.Image.length > 50 ? row.Image.substring(0, 50) + '...' : row.Image) : 'Ingen'}`);
            });
            
            // Kontrollera om det finns produkter med tomma värden
            console.log('\n⚠️ Kontrollerar datakvalitet:');
            const emptyCheck = await dbClient.execute(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN namn IS NULL OR namn = '' THEN 1 ELSE 0 END) as empty_namn,
                    SUM(CASE WHEN price IS NULL OR price = '' THEN 1 ELSE 0 END) as empty_price,
                    SUM(CASE WHEN color IS NULL OR color = '' THEN 1 ELSE 0 END) as empty_color,
                    SUM(CASE WHEN size IS NULL OR size = '' THEN 1 ELSE 0 END) as empty_size,
                    SUM(CASE WHEN Image IS NULL OR Image = '' THEN 1 ELSE 0 END) as empty_image
                FROM Eprolo
            `);
            
            const quality = emptyCheck.rows[0];
            console.log(`   Produkter utan namn: ${quality.empty_namn}/${quality.total}`);
            console.log(`   Produkter utan pris: ${quality.empty_price}/${quality.total}`);
            console.log(`   Produkter utan färg: ${quality.empty_color}/${quality.total}`);
            console.log(`   Produkter utan storlek: ${quality.empty_size}/${quality.total}`);
            console.log(`   Produkter utan bild: ${quality.empty_image}/${quality.total}`);
        } else {
            console.log('⚠️ Inga produkter hittades i databasen!');
            console.log('\nMöjliga orsaker:');
            console.log('1. Scrapern har inte körts ännu');
            console.log('2. Scrapern körde men INSERT-operationerna misslyckades');
            console.log('3. Produkterna raderades efter att de sparades');
            console.log('4. Fel databas eller tabell används');
        }
        
    } catch (error) {
        console.error('❌ Fel vid databaskontroll:', error.message);
        console.error('Stack:', error.stack);
    } finally {
        await dbClient.close();
        console.log('\n✅ Databas stängd');
    }
}

checkDatabase();
