const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DATA_PATH = process.env.DATA_PATH || '/docker-swarm-snyk/data';
const SEVERITY = process.env.SEVERITY || 'high';
// eslint-disable-next-line no-useless-escape
const imageRegex = new RegExp(/^([\w\-\./]+):([\w\.\-]+)(@sha256:\w+)?$/i);

class DockerScanService {

    static init = () => {
        if (!process.env.SNYK_AUTH_TOKEN) {
            throw Error(`SNYK_AUTH_TOKEN is required.`);
        }
        DockerScanService.execCmd(`snyk auth --login --token $SNYK_AUTH_TOKEN`);
        if (process.env.DOCKER_USERNAME && process.env.DOCKER_PASSWORD) {
            DockerScanService.execCmd(`echo "$DOCKER_PASSWORD" | docker login -u $DOCKER_USERNAME --password-stdin`);
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
        try {
            return execSync(`jq -r .uri ${DockerScanService.getFilename(image)}`).toString().trim();
        } catch (error) {
            console.error(error);
        }
    }

    static scanExists = (image) => {
        const filename = DockerScanService.getFilename(image);
        return fs.existsSync(filename) || fs.existsSync(`${filename}.error`);
    }

    static errorExists = (image) => {
        const filename = `${DockerScanService.getFilename(image)}.error`;
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
        if (!DockerScanService.validateImage(image)) return;
        const filename = DockerScanService.getFilename(image);
        const errorFile = `${filename}.error`;
        if (fs.existsSync(filename)) fs.rmSync(filename);
        if (fs.existsSync(errorFile)) fs.rmSync(errorFile);
    }

    static get version () {
        return execSync('snyk --version').toString();
    }

    static scan = async (image, callback) => {
        const filename = DockerScanService.getFilename(image);

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
                return;
            }
        };

        const checkScanExists = () => {
            if (DockerScanService.scanExists(image)) {
                console.log(`SCAN EXISTS: ${image}`);
                return;
            }
            next();
        };

        const pullImage = async () => {
            console.log(`PULLING: ${image}`);
            const errors = [];
            const child = spawn('docker', [ 'pull', image ] );
            child.stdout.setEncoding('utf8');
            child.stderr.on('data', chunk => errors.push(chunk.toString()));
            child.stderr.pipe(process.stderr);
            child.on('close', (code) => {
                if (code) {
                    errors.unshift(`PULL ERROR [EXIT ${code}]: ${image}`);
                    fs.writeFileSync(`${filename}.error`, errors.join('\n'));
                    return;
                }
                next();
            });
        };

        const scanImage = async () => {
            console.log(`SCANNING: ${image}`);
            const child = spawn('snyk', [ 'container', 'monitor', `--severity-threshold=${SEVERITY}`, '--json', image,  '&>', filename ], { shell: true } );
            child.stdout.setEncoding('utf8');
            // child.stderr.on('data', chunk => fs.appendFileSync(filename, chunk));
            child.on('close', (code) => {
                console.log(`SCAN COMPLETE [EXIT ${code}]: ${image}`);
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

module.exports = DockerScanService;
