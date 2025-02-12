const { GoogleSpreadsheet } = require('google-spreadsheet');

exports.handler = async (event) => {
    const { personName, month } = JSON.parse(event.body);
    const doc = new GoogleSpreadsheet('1xydLswJHJPS6Vry7P7XcjUMdTRJK1vQ-VatN4B4chLI');
    doc.useApiKey('AIzaSyBIAZIlEL2OqSP4SGvUjcjZwL9p7aPVWuA');

    await doc.loadInfo();
    const sheets = doc.sheetsByIndex.filter(sheet => {
        const [_, sheetMonth] = sheet.title.split('/');
        return sheetMonth == month;
    });

    let totalDays = 0;
    let deductions = [];

    for (const sheet of sheets) {
        const rows = await sheet.getRows();
        const personRow = rows.find(row => row.D === personName);

        if (personRow && personRow.O !== '0') {
            totalDays++;

            // التحقق من التأخير
            const time = personRow.P.split(' ')[0]; // إزالة AM/PM
            const [hours, minutes] = time.split(':').map(Number);
            const isAM = personRow.P.includes('AM');

            if ((isAM && (hours > 8 || (hours === 8 && minutes > 5)) || 
                (!isAM && hours !== 12)) { // إذا كان الوقت مساءً (مثال: 1 PM = 13:00)
                deductions.push({ date: sheet.title, reason: `تأخير (${personRow.P})` });
            }

            // التحقق من الخصومات الأخرى
            if (personRow.R?.trim()) {
                deductions.push({ date: sheet.title, reason: personRow.R });
            }
        }
    }

    return {
        statusCode: 200,
        body: JSON.stringify({
            totalDays,
            totalDeductions: deductions.length,
            netDays: totalDays - deductions.length,
            deductions
        })
    };
};
