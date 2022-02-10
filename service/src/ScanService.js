const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ObjectCache = require('./ObjectCache');

const DATA_PATH = process.env.DATA_PATH || '/docker-swarm-snyk/data';
const SEVERITY = process.env.SEVERITY || 'high';
// eslint-disable-next-line no-useless-escape
const imageRegex = new RegExp(/^([\w\-\./]+):([\w\.\-]+)(@sha256:\w+)?$/i);

class ScanService {

    static init = () => {
        if (!process.env.SNYK_AUTH_TOKEN) {
            throw Error(`SNYK_AUTH_TOKEN is required.`);
        }
        ScanService.execCmd(`snyk auth --login --token $SNYK_AUTH_TOKEN`);
        if (process.env.DOCKER_USERNAME && process.env.DOCKER_PASSWORD) {
            ScanService.execCmd(`echo "$DOCKER_PASSWORD" | docker login -u $DOCKER_USERNAME --password-stdin`);
        }
    }

    static execCmd = (cmd) => {
        try {
            console.log(execSync(cmd).toString());
        } catch (error) {
            console.error(error);
        }
    }

    static getFilename = (image) => {
        return path.join(DATA_PATH, image.replace(/\//g, '-'));
    }

    static getSnykUri = (image) => {
        const cache = ObjectCache.readCache(image).snyk;
        if (cache) return cache;
        try {
            const cmd = `jq -r .uri ${ScanService.getFilename(image)}`;
            const snyk = execSync(cmd).toString().trim();
            if (snyk) ObjectCache.setCache(image, {snyk});
            return snyk;
        } catch (error) {
            console.error(error);
        }
    }

    static scanExists = (image) => {
        const filename = ScanService.getFilename(image);
        return fs.existsSync(filename) || fs.existsSync(`${filename}.error`);
    }

    static errorExists = (image) => {
        const filename = `${ScanService.getFilename(image)}.error`;
        return fs.existsSync(filename);
    }

    static validateImage = (image) => {
        return imageRegex.test(image);
    }

    static readResults = (image) => {
        if (!this.scanExists(image)) return null;
        const filename = this.errorExists(image)
            ? `${this.getFilename(image)}.error`
            : this.getFilename(image);
        return fs.readFileSync(filename, {encoding:'utf8'});
    }

    static deleteImage = async (image) => {
        if (!ScanService.validateImage(image)) return;
        const filename = ScanService.getFilename(image);
        const errorFile = `${filename}.error`;
        if (fs.existsSync(filename)) fs.rmSync(filename);
        if (fs.existsSync(errorFile)) fs.rmSync(errorFile);
    }

    static get version () {
        return execSync('snyk --version').toString();
    }

    static scan = async (image, callback) => {
        const filename = ScanService.getFilename(image);

        const validateImage = () => {
            if (!imageRegex.test(image)) {
                console.log(`INVALID IMAGE: ${image}`);
                return;
            }
            next();
        };

        const next = () => {
            const cb = callstack.shift();
            try {
                if (cb) cb();
            } catch (error) {
                console.error(error);
            }
        };

        const exit = (error) => {
            try {
                if (callback) callback(error);
            } catch (e) {
                console.error(e);
            }
        };

        const checkScanExists = () => {
            if (ScanService.scanExists(image)) {
                console.log(`SCAN EXISTS: ${image}`);
                return;
            }
            next();
        };

        const handleChildProcess = async (childProcess, callback) => {
            const errors = [];
            childProcess.stderr.on('data', chunk => errors.push(chunk.toString()));
            childProcess.stderr.pipe(process.stderr);
            childProcess.on('close', (code) => {
                if (code) errors.unshift(`PROCESS EXITED ${code}: ${image}`);
                const error = errors.join('\n') || undefined;
                callback(error);
            });
        }

        const writeErrorFile = (error) => {
            fs.writeFileSync(`${filename}.error`, error);
        }

        const pullImage = async () => {
            const child = spawn('docker', [ 'pull', image ] );
            handleChildProcess(child, (error) => {
                if (error) {
                    writeErrorFile(error);
                    exit(error);
                }
                next();
            });
        };

        const scanImage = async () => {
            const child = spawn('snyk', [ 'container', 'monitor', `--severity-threshold=${SEVERITY}`, '--json', image,  '&>', filename ], { shell: true } );
            handleChildProcess(child, (error) => {
                if (error) {
                    writeErrorFile(error);
                }
                next();
            });
        };

        const removeImage = async () => {
            const child = spawn('docker', [ 'image', 'rm', image], { shell: true });
            child.on('close', next);
        }

        const callstack = [validateImage, checkScanExists, pullImage, scanImage, removeImage];
        if (callback) callstack.push(callback);
        next();
    }
}

module.exports = ScanService;
