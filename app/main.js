const {
    app,
    BrowserWindow,
    ipcMain
} = require('electron');
const fs = require('fs');
const readline = require('readline');

//test
let mainWindow = null;

app.on('ready', () => {
    console.log('Hello from Electron');
    mainWindow = new BrowserWindow({
        webPreferences: {
            nodeIntegration: true,
            worldSafeExecuteJavaScript: true,
            // contextIsolation: true,
        }
    });
    mainWindow.webContents.loadFile('./app/index.html');

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

});

// const getFileFromUser = exports.getFileFromUser = () => {
//     alert('getfilefromuser function');
// }

// ipcMain.on('sync-file-path', (event, path) => {
//     let result = 'no path given';
//     if (path) {
//         result = fs.readFileSync(path, {
//             encoding: 'utf8',
//             flag: 'r'
//         });

//     }
//     event.returnValue = result;
// })


ipcMain.on('async-file-path', readFile);

async function readFile(event, path) {
 
    const fileStream = fs.createReadStream(path);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });
    const dataArr = [];
    
    for await (const line of rl) {
        // console.log(`Line from file: ${line}`);
        const endMatch = (/^#\$/).test(line);
        const startMatch = (/^#\%/).test(line);

        if (endMatch) {
            rl.close();
            event.reply('async-reply', dataArr);
            return;
        } else {
            if (!(startMatch)){
                dataArr.push(line);
                // event.reply('async-reply', line);
            } 
        }
    }
}


