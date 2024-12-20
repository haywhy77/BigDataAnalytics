const express = require('express');
const formidable = require('formidable');
const fs = require('fs/promises');
const app = express();
const PORT = 3000;

const Timer = require('./Timer');
const CloneDetector = require('./CloneDetector');
const CloneStorage = require('./CloneStorage');
const FileStorage = require('./FileStorage');

// Express and Formidable setup to receive a file for further processing
const form = formidable({ multiples: false });

app.post('/', fileReceiver);
function fileReceiver(req, res, next) {
    form.parse(req, (err, fields, files) => {
        fs.readFile(files.data.filepath, { encoding: 'utf8' })
            .then(data => { return processFile(fields.name, data); });
    });
    return res.end('');
}

app.get('/', viewClones);
app.get('/timers', viewTimers); // New route for detailed timing statistics
const server = app.listen(PORT, () => { console.log('Listening for files on port', PORT); });

// Page generation for viewing current progress
function getStatistics() {
    let cloneStore = CloneStorage.getInstance();
    let fileStore = FileStorage.getInstance();
    let output = `Processed ${fileStore.numberOfFiles} files containing ${cloneStore.numberOfClones} clones.`;
    return output;
}

function lastFileTimersHTML() {
    if (!lastFile) return '';
    let output = '<p>Timers for last file processed:</p>\n<ul>\n';
    let timers = Timer.getTimers(lastFile);
    for (let t in timers) {
        output += `<li>${t}: ${(timers[t] / 1000n)} µs</li>\n`;
    }
    output += '</ul>\n';
    return output;
}

function listClonesHTML() {
    let cloneStore = CloneStorage.getInstance();
    let output = '';

    cloneStore.clones.forEach(clone => {
        output += '<hr>\n';
        output += `<h2>Source File: ${clone.sourceName}</h2>\n`;
        output += `<p>Starting at line: ${clone.sourceStart}, ending at line: ${clone.sourceEnd}</p>\n`;
        output += '<ul>';
        clone.targets.forEach(target => {
            output += `<li>Found in ${target.name} starting at line ${target.startLine}</li>\n`;
        });
        output += '</ul>\n';
        output += '<h3>Contents:</h3>\n<pre><code>\n';
        output += clone.originalCode;
        output += '</code></pre>\n';
    });

    return output;
}

function listProcessedFilesHTML() {
    let fs = FileStorage.getInstance();
    let output = '<hr>\n<h2>Processed Files</h2>\n';
    output += fs.filenames.reduce((out, name) => {
        out += `<li>${name}</li>\n`;
        return out;
    }, '<ul>\n');
    output += '</ul>\n';
    return output;
}

function viewClones(req, res, next) {
    let page = `
    <html>
    <head>
        <title>CodeStream Clone Detector</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; background-color: #f4f4f4; color: #333; }
            h1 { color: #2c3e50; }
            h2 { color: #2980b9; }
            h3 { color: #8e44ad; }
            hr { margin: 20px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #2980b9; color: white; }
            ul { margin: 10px 0; padding-left: 20px; }
            pre { background: #eef; padding: 10px; border-radius: 5px; }
            code { color: #c0392b; }
        </style>
    </head>
    <body>
        <h1>CodeStream Clone Detector</h1>
        <p>${getStatistics()}</p>
        ${lastFileTimersHTML()}
        ${listClonesHTML()}
        ${listProcessedFilesHTML()}
    </body>
    </html>`;
    res.send(page);
}

// View detailed timing statistics with a chart
function viewTimers(req, res, next) {
    let page = `
    <html>
    <head>
        <title>File Processing Timers</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; background-color: #f4f4f4; color: #333; }
            h1 { color: #2c3e50; }
            h2 { color: #2980b9; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #2980b9; color: white; }
            #processingChart { margin-top: 20px; }
        </style>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    </head>
    <body>
        <h1>File Processing Timers</h1>
        <h2>Processing Time Statistics</h2>
        <table border="1">
            <tr>
                <th>File Name</th>
                <th>Processing Time (µs)</th>
                <th>Normalized Time (µs/line)</th>
            </tr>`;

    processingTimes.forEach((entry) => {
        page += `<tr><td>${entry.filename}</td><td>${entry.time}</td><td>${entry.normalizedTime.toFixed(2)}</td></tr>`;
    });

    page += `
        </table>
        
        <h3>Processing Time Over Files</h3>
        <canvas id="processingChart" width="800" height="400"></canvas>
        
        <script>
            const labels = ${JSON.stringify(processingTimes.map(entry => entry.filename))};
            const data = ${JSON.stringify(processingTimes.map(entry => Number(entry.time)))};
            const normalizedData = ${JSON.stringify(processingTimes.map(entry => entry.normalizedTime.toFixed(2)))};

            const ctx = document.getElementById('processingChart').getContext('2d');
            const chart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Processing Time (µs)',
                        data: data,
                        borderColor: 'rgba(75, 192, 192, 1)',
                        borderWidth: 2,
                        fill: false
                    }, {
                        label: 'Normalized Time (µs/line)',
                        data: normalizedData,
                        borderColor: 'rgba(153, 102, 255, 1)',
                        borderWidth: 2,
                        fill: false
                    }]
                },
                options: {
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });
        </script>
    </body>
    </html>
    `;

    // Send the HTML content
    res.send(page);
}

// Define the route to view timers
app.get('/view-timers', viewTimers);

// Some helper functions
PASS = fn => d => {
    try {
        fn(d);
        return d;
    } catch (e) {
        throw e;
    }
};

const STATS_FREQ = 100;
const URL = process.env.URL || 'http://localhost:8080/';
var lastFile = null;

let processingTimes = [];

function maybePrintStatistics(file, cloneDetector, cloneStore) {
    if (0 === cloneDetector.numberOfProcessedFiles % STATS_FREQ) {
        console.log('Processed', cloneDetector.numberOfProcessedFiles, 'files and found', cloneStore.numberOfClones, 'clones.');
        let timers = Timer.getTimers(file);
        let str = 'Timers for last file processed: ';
        for (let t in timers) {
            str += `${t}: ${(timers[t] / 1000n)} µs `;
        }
        console.log(str);
        console.log('List of found clones available at', URL);
    }

    return file;
}

// Processing of the file
function processFile(filename, contents) {
    let cd = new CloneDetector();
    let cloneStore = CloneStorage.getInstance();

    // Calculate the number of lines in the file
    const numLines = contents.split('\n').length;

    return Promise.resolve({ name: filename, contents: contents, numLines: numLines })
        .then(file => Timer.startTimer(file, 'total'))
        .then(file => cd.preprocess(file))
        .then(file => cd.transform(file))
        .then(file => Timer.startTimer(file, 'match'))
        .then(file => cd.matchDetect(file))
        .then(file => cloneStore.storeClones(file))
        .then(file => Timer.endTimer(file, 'match'))
        .then(file => cd.storeFile(file))
        .then(file => Timer.endTimer(file, 'total'))
        .then(PASS(file => lastFile = file))
        .then(PASS(file => maybePrintStatistics(file, cd, cloneStore)))
        .then(file => {
            lastFile = file;
            maybePrintStatistics(file, cd, cloneStore);
            let timers = Timer.getTimers(file);
            let totalTime = timers['total'] / 1000n;
            let normalizedTime = Number(totalTime) / file.numLines;
            processingTimes.push({ filename: file.name, time: totalTime, normalizedTime });
        })
        .catch(console.log);
}