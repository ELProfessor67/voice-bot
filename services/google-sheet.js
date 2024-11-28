const path = require('path');
const { google } = require('googleapis');

const CREDENTIALS_PATH = path.join(__dirname, 'flash-medley-google.json');

const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

const getSpreadSheet = async () => {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: "1Xk7gu6ptPt5CVrPkQxCKRTaYHk_dEiDzjoHFPufhn1o",
        range: 'prompt!A1:E'
    });
    console.log(res.data.values);
    return res;
}

const writeSpreadSheet = async (data) => {
    const formattedData = data.map((item) => {
        return [item.role, item.message];
    })

    await sheets.spreadsheets.values.append({
        spreadsheetId: "1Xk7gu6ptPt5CVrPkQxCKRTaYHk_dEiDzjoHFPufhn1o",
        range: 'sheet1!A1:E',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        resource: {
            "majorDimension": "ROWS",
            "values": formattedData
        },
    })
}

const writeFunctionSpreadSheet = async (data) => {
    await sheets.spreadsheets.values.append({
        spreadsheetId: "1Xk7gu6ptPt5CVrPkQxCKRTaYHk_dEiDzjoHFPufhn1o",
        range: 'sheet1!A1:E',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        resource: {
            "majorDimension": "ROWS",
            "values": data
        },
    })
}

module.exports = { getSpreadSheet, writeSpreadSheet, writeFunctionSpreadSheet }
