// PATCH FÖR FÖRBÄTTRAD BILDLOGGNING
// Lägg till detta efter rad 582 (efter "console.log(`   ✅ Totalt ${allImages.length} unika produktbilder hämtade`);")

// DETALJERAD LOGGNING AV ALLA INSAMLADE BILDER
if (allImages.length > 0) {
    console.log(`   🖼️ LISTA ÖVER ALLA INSAMLADE BILDLÄNKAR:`);
    allImages.forEach((img, idx) => {
        console.log(`      ${idx + 1}. ${img}`);
    });
} else {
    console.log(`   ⚠️ VARNING: Inga bilder hittades för denna produkt!`);
}

// ===================================

// PATCH FÖR PRODUKTDATA-LOGGNING
// Lägg till detta efter rad 1263 (efter "console.log(`   📦 SKU: ${productData.sku}`);")

// DETALJERAD LOGGNING AV IMAGE-FÄLTET
if (productData.image && productData.image.trim() !== '') {
    console.log(`   📷 IMAGE-FÄLT INNEHÅLL (kommer att sparas i databasen):`);
    const imageUrls = productData.image.split(', ');
    imageUrls.forEach((url, idx) => {
        console.log(`      ${idx + 1}. ${url}`);
    });
    console.log(`   ✅ Totalt ${imageUrls.length} bildlänkar kommer att sparas i databasen`);
} else {
    console.log(`   ⚠️ VARNING: Image-fältet är tomt! Inga bilder kommer att sparas.`);
}
