const { createClient } = require('@libsql/client');

console.log('🗑️ Startar radering av produkter från databasen...');

async function deleteAllProducts() {
    let dbClient = null;
    
    try {
        // Anslut till databasen
        console.log('📊 Ansluter till databas...');
        dbClient = createClient({
            url: 'libsql://dostar-dostar.aws-ap-northeast-1.turso.io',
            authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzM0OTQ2NzcsImlkIjoiMDE5Y2QzN2QtYzYwMS03YWVjLTljMjctMzY0MmE2ZjA0YjIyIiwicmlkIjoiNzg3ZmQwMjYtZDk5OS00ZTM3LThiZjctODBlYmU2NGViYzRjIn0.VEY7PGD5ENQubqQvZ3Xi2ArSYmnjn9LAW63BKaLz_xRCmYP72bYH59qmCRfA3-lc30xouUyfcUVRRQfIRfv6Ag'
        });
        
        await dbClient.execute('SELECT 1');
        console.log('✅ Databas ansluten');
        
        // Räkna produkter innan radering
        const countBefore = await dbClient.execute('SELECT COUNT(*) as total FROM Eprolo');
        const totalBefore = countBefore.rows[0].total;
        console.log(`📊 Antal produkter i databasen: ${totalBefore}`);
        
        if (totalBefore === 0) {
            console.log('ℹ️ Databasen är redan tom, inga produkter att radera.');
            return;
        }
        
        // Radera alla produkter
        console.log('🗑️ Raderar alla produkter...');
        await dbClient.execute('DELETE FROM Eprolo');
        console.log('✅ Alla produkter raderade');
        
        // Verifiera radering
        const countAfter = await dbClient.execute('SELECT COUNT(*) as total FROM Eprolo');
        const totalAfter = countAfter.rows[0].total;
        console.log(`📊 Antal produkter efter radering: ${totalAfter}`);
        
        console.log(`\n🎉 KLART! ${totalBefore} produkter har raderats från databasen.`);
        
    } catch (error) {
        console.error('❌ Fel vid radering:', error.message);
    } finally {
        if (dbClient) {
            dbClient.close();
            console.log('🔒 Databas stängd');
        }
    }
}

// Kör raderingsskriptet
deleteAllProducts().then(() => {
    console.log('=== RADERING SLUTFÖRD ===');
}).catch(error => {
    console.error('=== FEL ===', error);
});
