// SimDock Spike Server
// Serves files with COOP/COEP headers for SharedArrayBuffer support

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.wasm': 'application/wasm',
    '.pdbqt': 'text/plain',
    '.css': 'text/css',
    '.json': 'application/json'
};

const server = http.createServer((req, res) => {
    let filePath = req.url === '/' ? '/test.html' : req.url;
    filePath = path.join(__dirname, filePath);

    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            console.error(`404: ${req.url}`);
            res.writeHead(404);
            res.end('File not found');
            return;
        }

        // Add COOP/COEP headers for SharedArrayBuffer support
        res.writeHead(200, {
            'Content-Type': contentType,
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
            'Cross-Origin-Resource-Policy': 'cross-origin'
        });
        res.end(data);
        console.log(`200: ${req.url} (${contentType})`);
    });
});

server.listen(PORT, () => {
    console.log('');
    console.log('==============================================');
    console.log('  SimDock WASM Spike Server');
    console.log('==============================================');
    console.log(`  Running at: http://localhost:${PORT}`);
    console.log('  SharedArrayBuffer: ENABLED (COOP/COEP headers set)');
    console.log('');
    console.log('  Open your browser and navigate to:');
    console.log(`  http://localhost:${PORT}/test.html`);
    console.log('');
    console.log('  Press Ctrl+C to stop the server');
    console.log('==============================================');
});
