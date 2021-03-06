require('dotenv').config();

const { execSync } = require('child_process');
const express = require('express');
const http = require('http');

const DockerService = require('./DockerService');
const ScanService = require('./ScanService');
const ScanJob = require('./ScanJob');

ScanService.init();
ScanJob.init();

const app = express();
const port = process.env.PORT || '3000';

const filter = (list, query, options) => {
    let filtered = [...list];
    const exceptions = (key) => {
        return !(options && Array.isArray(options.except) && options.except.includes(key));
    };
    Object.keys(query).filter(exceptions).forEach(key => {
        if (key.startsWith('!')) {
            filtered = filtered.filter(i => !Object.prototype.hasOwnProperty.call(i, key.substring(1)));
        } else if (!query[key]) {
            filtered = filtered.filter(i => Object.prototype.hasOwnProperty.call(i, key));
        } else if (query[key].startsWith('~')) {
            const regex = new RegExp(query[key].substring(1), 'i');
            filtered = filtered.filter(i => regex.test(String(i[key])));
        } else {
            filtered = filtered.filter(i => String(i[key]) === String(query[key]));
        }
    });
    return filtered;
}

const endpoints = [];
const doc = (method, endpoint) => {
    const existing = endpoints.find(e => e.endpoint === endpoint);
    if (existing) {
        existing.methods.push(method);
        return;
    }
    endpoints.push({endpoint, methods: [method]});
}

app.get('/', (req, res) => {
    res.send(endpoints.map(i => {
        return `<div>[${i.methods.join(' | ')}] <a href="./${i.endpoint}" target="_blank">${i.endpoint}</a></div>`;
    }).join(''));
});

doc('GET', 'health');
app.get('/health', (req, res) => {
    res.setHeader('content-type', 'text/plain');
    res.send('OK');
});

doc('GET', 'version');
app.get('/version', (req, res) => {
    const data = ScanService.version;
    const contentType = typeof data === 'string'
        ? 'text/plain'
        : 'application/json'
    res.setHeader('content-type', contentType);
    res.send(data);
});

doc('GET', 'swarm');
app.get('/swarm', async (req, res) => {
    try {
        res.setHeader('content-type', 'application/json');
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const images = DockerService.getSwarmImages();
        images.map((image) => {
            const hasError = ScanService.errorExists(image.imageFull)
            const hasResults = ScanService.scanExists(image.imageFull);
            if (hasResults) {
                image[hasError ? 'error' : 'result']= `${baseUrl}/results?image=${image.imageFull}`;
            }
            if (hasResults && !hasError) {
                image.snyk = ScanService.getSnykUri(image.imageFull);
            }
        });
        res.send(filter(images, req.query));
    } catch(error) {
        res.status = 500;
        res.send(error.message);
        console.log(error);
    }
});

app.get('/results', async (req, res) => {
    res.setHeader('content-type', 'text/plain');
    try {
        const results = ScanService.readResults(req.query.image);
        if (results === null) {
            return res.sendStatus(404);
        }
        res.send(results || 'EMPTY');
    } catch(error) {
        res.status = 500;
        res.send(error.message);
        console.log(error);
    }
});

doc('GET', 'scan');
app.get('/scan', async (req, res) => {
    const images = req.query.image
        ? Array.isArray(req.query.image) ? req.query.image : [req.query.image]
        : DockerService.getSwarmImages().map(i => i.imageFull);
    if (Object.prototype.hasOwnProperty.call(req.query, 'force')) {
        images.forEach(ScanService.deleteImage);
    }
    const pushed = ScanJob.pushQueue(images);
    res.setHeader('content-type', 'application/json');
    res.send({pushed});
});

doc('GET', 'queue');
app.get('/queue', (req, res) => {
    const queue = ScanJob.getQueue();
    res.setHeader('content-type', 'application/json');
    res.send(queue);
});

const server = http.createServer(app);
server.listen(port, () => console.log(`http://localhost:${port}/`));
