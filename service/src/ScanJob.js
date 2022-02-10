const ScanService = require("./ScanService");
const DockerService = require("./DockerService");

const JOB_SCAN_INTERVAL_SECONDS = process.env.JOB_SCAN_INTERVAL_SECONDS || 60;
const JOB_INTERVAL_SECONDS = process.env.JOB_INTERVAL_SECONDS || 10;
const JOB_MAX_CONCURRENCY = process.env.JOB_MAX_CONCURRENCY || 1;

class ScanJob {
    static init = () => {
        ScanJob.queue = [];
        ScanJob.inProgress = [];
        setInterval(() => {
            ScanJob.checkQueue();
        }, JOB_INTERVAL_SECONDS * 1000);
        setInterval(() => {
            ScanJob.pushQueue(DockerService.getSwarmImages().map(i => i.imageFull));
        }, JOB_SCAN_INTERVAL_SECONDS * 1000);
    }

    static getQueue = () => {
        const { inProgress, queue } = ScanJob;
        inProgress.forEach(item => item.seconds_elapsed = (new Date()-item.start)/1000);
        return { inProgress, queue };
    }

    static checkQueue = () => {
        // check in-progress for completed jobs...
        if (ScanJob.inProgress.length > 0) {
            const done = ScanJob.inProgress.filter(({image}) => ScanService.scanExists(image));
            done.forEach(item => console.log(`SCAN COMPLETE: ${item.image} (${(new Date()-item.start)/1000}s)`));
            ScanJob.inProgress = ScanJob.inProgress.filter(image => !done.includes(image));
            if (ScanJob.inProgress.length >= JOB_MAX_CONCURRENCY) {
                return;
            }
        }
        // push jobs to in-progress...
        while (ScanJob.queue.length > 0 && ScanJob.inProgress.length < JOB_MAX_CONCURRENCY) {
            const image = ScanJob.queue.shift();
            console.log(`SCAN IN-PROGRESS: ${image}`);
            ScanJob.inProgress.push({image, start: new Date()});
            ScanService.scan(image);
        }
    }

    static pushQueue = (images) => {
        images = Array.isArray(images) ? [...new Set(images)] : [images];
        const newImages = images.filter(image => {
            return ScanService.validateImage(image) &&
                !ScanJob.queue.includes(image) && 
                !ScanJob.inProgress.includes(image) &&
                !ScanService.scanExists(image);
        });
        newImages.forEach(image => console.log(`SCAN QUEUED: ${image}`));
        ScanJob.queue.push(...newImages);
        return newImages;
    }
}

module.exports = ScanJob;
