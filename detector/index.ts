import {
    HTMLCanvasElementLuminanceSource, HybridBinarizer,
    BinaryBitmap, BitMatrix,
    PerspectiveTransform,
    ChecksumException, QRCodeFinderPatternFinder, QRCodeFinderPattern, NotFoundException
} from "../zxing-js/src/index";
import { saveAs } from "file-saver";
import { rgbToHsl } from "./rgbToHsl";
import { iota } from "./util";
//import * as JSZip from "jszip";
declare global { const JSZip : any; }

import * as StackBlur from "stackblur-canvas";
import { MyGridSampler } from "./MyGridSampler";
import { WideQRDecoder } from "./WideQRDecoder";
import { binarize } from "./MyBinarizer";

const MAX_OUTPUT = 50;
const video = <HTMLVideoElement>document.getElementById('video');
const output = document.getElementById("output");
const expected = <HTMLImageElement>document.getElementById("expected");
let expectedBytes: Uint8ClampedArray = null;
let finderPoses: Array<[number, number]> = [[10, 10], [30, 10], [30, 30], [10, 30]];
let romdata: ArrayBuffer[] = [];
let maxNum: number = undefined;
let succeededTestData = false;

const MARGIN = 5;
const numPixelsX = 252;
const numPixelsY = 188;

const dimX = 252;
const dimY = 94;

let worker = new Worker("worker.ts");

//test();

loadExpected();

if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    processCamera();
} else {
    alert("The browser does not support camera.");
}

document.getElementById("save-button").addEventListener("click", () => {
    let zip = new JSZip();
    for (let num in romdata) {
        zip.file(String(num).padStart(6, "0"), romdata[num]);
    }
    zip.generateAsync({ type: "blob" })
        .then(function (content: any) {
            saveAs(content, "gbarom.zip");
        });
});

document.getElementById("shake").addEventListener("click", () => {
    $("#shake").text("Shaking...");
    setTimeout(() => {
        runShake(false);
        $("#shake").text("Shake");
    }, 250);
});

document.getElementById("shake-with-margin").addEventListener("click", () => {
    $("#shake-with-margin").text("Shaking...");
    setTimeout(() => {
        runShake(true);
        $("#shake-with-margin").text("Shake with margin");
    }, 250);
});

document.getElementById("search-finder").addEventListener("click", () => {
    searchFinder();
});

worker.addEventListener("message", (message) => {
    const matrixBits = <Int32Array>message.data.matrixBits;
    const bitsBits = <Int32Array>message.data.bitsBits;
    const bytes = <Uint8Array>message.data.bytes;
    const times = <number[]>message.data.times;
    const matrixWidth = <number>message.data.matrixWidth;
    const matrixHeight = <number>message.data.matrixHeight;
    const matrixRowSize = <number>message.data.matrixRowSize;
    const bitsWidth = <number>message.data.bitsWidth;
    const bitsHeight = <number>message.data.bitsHeight;
    const bitsRowSize = <number>message.data.bitsRowSize;
    const canvas3buffer = <Uint8ClampedArray>message.data.canvas3buffer;
    const canvas4buffer = <Uint8ClampedArray>message.data.canvas4buffer;
    const matrix = new BitMatrix(matrixWidth, matrixHeight, matrixRowSize, matrixBits);
    const bits = new BitMatrix(bitsWidth, bitsHeight, bitsRowSize, bitsBits);
    onresponse(matrix, bits, bytes, times, canvas3buffer, canvas4buffer);
});

function loadExpected() {
    if (!expected.complete) {
        expected.addEventListener("load", loadExpected);
    }
    const expectedBytes = imgToByteArray(expected);
    worker.postMessage({
        type: "expectedbytes",
        expectedBytes: expectedBytes
    });
}


function test() {
    let byteArray = imgToByteArray(expected);
    let w = expected.width, h = expected.height;
    let bits = new BitMatrix(w, h);
    let i = 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (byteArray[i] === 0) {
                bits.set(x, y);
            }
            i += 4;
        }
    }
    console.log(bits);
    let result = new WideQRDecoder().decodeBitMatrix(bits);
    console.log(result.getByteSegments());
}

function searchFinder() {
    const threshold = Number((<HTMLInputElement>document.getElementById("threshold")).value);
    const canvas1 = <HTMLCanvasElement>document.getElementById("canvas1");
    const canvas2 = <HTMLCanvasElement>document.getElementById("canvas2");
    const w = video.width, h = video.height;
    const ctx = canvas1.getContext("2d");
    videoToCanvas(video, [0, 0, w, h]);
    const source = new HTMLCanvasElementLuminanceSource(canvas1);
    const hybridBinarizer = new HybridBinarizer(source, threshold);
    const bitmap = new BinaryBitmap(hybridBinarizer);
    let matrix = bitmap.getBlackMatrix();
    const finder = new QRCodeFinderPatternFinder(matrix, null);
    let patterns: QRCodeFinderPattern[] = null;
    try {
        finder.find(null, 4);
        patterns = finder.getPossibleCenters();
    } catch(e) {
        prepend($("<div class='failed'>not found</div>").get(0));
        return;
    }
    let centerX = 0, centerY = 0;
    for (let pattern of patterns) {
        centerX += pattern.getX() / 4;
        centerY += pattern.getY() / 4;
    }
    const hues: number[] = [];
    for (let pattern of patterns) {
        const imageData = ctx.getImageData((pattern.getX() + centerX) / 2, (pattern.getY() + centerY) / 2, 2, 2);
        const data = imageData.data;
        const avgR = (imageData.data[0] + imageData.data[4] + imageData.data[8] + imageData.data[12]) / 4;
        const avgG = (imageData.data[1] + imageData.data[5] + imageData.data[9] + imageData.data[13]) / 4;
        const avgB = (imageData.data[2] + imageData.data[6] + imageData.data[10] + imageData.data[14]) / 4;
        hues.push(rgbToHsl(avgR, avgG, avgB)[0]);
    }
    let newPatterns = iota(4).sort((i, j) => hues[i] - hues[j]).map(i => patterns[i]);
    const ofs = 7;
    const transform = PerspectiveTransform.quadrilateralToQuadrilateral(
        ofs, ofs,
        numPixelsX - ofs, ofs,
        numPixelsX - ofs, numPixelsY - ofs,
        ofs, numPixelsY - ofs,
        newPatterns[0].getX(), newPatterns[0].getY(),
        newPatterns[1].getX(), newPatterns[1].getY(),
        newPatterns[3].getX(), newPatterns[3].getY(),
        newPatterns[2].getX(), newPatterns[2].getY());
    const points = Float32Array.from([0, 0, numPixelsX, 0, numPixelsX, numPixelsY, 0, numPixelsY]);
    transform.transformPoints(points);
    finderPoses = [[points[0], points[1]], [points[2], points[3]], [points[4], points[5]], [points[6], points[7]]];
    prepend($("<div class='success'>searched finders ("+finderPoses.map(x => "("+Math.round(x[0])+","+Math.round(x[1])+")").join(",")+")</div>").get(0));
}

function run(canvas1: HTMLCanvasElement, clip: number[]) {
    const threshold = Number((<HTMLInputElement>document.getElementById("threshold")).value);
    let [x, y, w, h] = clip;
    const topLeft = finderPoses[0];
    const topRight = finderPoses[1];
    const bottomRight = finderPoses[2];
    const bottomLeft = finderPoses[3];
    const luminanceSource = new HTMLCanvasElementLuminanceSource(canvas1);
    const hybridBinarizer = new HybridBinarizer(luminanceSource, threshold);
    const bitmap = new BinaryBitmap(hybridBinarizer);
    let matrix = bitmap.getBlackMatrix();
    const transform = PerspectiveTransform.quadrilateralToQuadrilateral(
        0, 0,
        dimX, 0,
        dimX, dimY,
        0, dimY,
        topLeft[0] - x, topLeft[1] - y,
        topRight[0] - x, topRight[1] - y,
        bottomRight[0] - x, bottomRight[1] - y,
        bottomLeft[0] - x, bottomLeft[1] - y);
    const sampler = new MyGridSampler();
    let bits: BitMatrix = null;
    try {
        bits = sampler.sampleGridWithTransform(matrix, dimX, dimY, transform);
    } catch(e) {
        if (!(e instanceof NotFoundException)) throw e;
    }
    return [matrix, bits];
}

function videoToCanvas(video: HTMLVideoElement, clip: number[]) {
    const canvas1 = <HTMLCanvasElement>document.getElementById("canvas1");
    const ctx = canvas1.getContext("2d");
    const [x, y, w, h] = clip;
    canvas1.width = w, canvas1.height = h;
    ctx.drawImage(video, x, y, w, h, 0, 0, w, h);
}

function posesToClip(poses: [number, number][]) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let pos of poses) {
        minX = Math.min(minX, Math.floor(pos[0]));
        maxX = Math.max(maxX, Math.ceil(pos[0]));
        minY = Math.min(minY, Math.floor(pos[1]));
        maxY = Math.max(maxY, Math.ceil(pos[1]));
    }
    return [minX, minY, maxX - minX + 1, maxY - minY + 1];
}

function main(source: HTMLVideoElement) {
    const time1 = Date.now();
    const threshold = Number((<HTMLInputElement>document.getElementById("threshold")).value);
    const canvas1 = <HTMLCanvasElement>document.getElementById("canvas1");
    const ctx = canvas1.getContext("2d");
    let clip = posesToClip(finderPoses);
    let [x, y, w, h] = clip;
    videoToCanvas(source, clip);
    const topLeft = finderPoses[0];
    const topRight = finderPoses[1];
    const bottomRight = finderPoses[2];
    const bottomLeft = finderPoses[3];
    const imageBuffer = ctx.getImageData(0, 0, canvas1.width, canvas1.height).data;
    ctx.strokeStyle = "red";
    ctx.beginPath();
    ctx.moveTo(topLeft[0] - x, topLeft[1] - y);
    ctx.lineTo(topRight[0] - x, topRight[1] - y);
    ctx.lineTo(bottomRight[0] - x, bottomRight[1] - y);
    ctx.lineTo(bottomLeft[0] - x, bottomLeft[1] - y);
    ctx.closePath();
    ctx.stroke();
    for (let i = 0; i < 4; i ++) {
        ctx.fillStyle = "hsl("+([0, 1, 3, 2][i]*90)+", 100%, 50%)";
        ctx.beginPath();
        ctx.arc(finderPoses[i][0] - x, finderPoses[i][1] - y, 3, 0, 2 * Math.PI);
        ctx.fill();
    }
    const time2 = Date.now();
    worker.postMessage({
        type: "work",
        imageBuffer: imageBuffer,
        width: canvas1.width,
        height: canvas1.height,
        x: x,
        y: y,
        finderPoses: finderPoses,
        threshold: threshold,
        times: [time1, time2]
    }, [imageBuffer.buffer]);
}

function onresponse(matrix: BitMatrix, bits: BitMatrix, bytes: Uint8Array, times: number[], canvas3buffer: Uint8ClampedArray, canvas4buffer: Uint8ClampedArray) {
    const canvas2 = <HTMLCanvasElement>document.getElementById("canvas2");
    matrixToCanvas(matrix, canvas2);
    if (bits) {
        const canvas3 = <HTMLCanvasElement>document.getElementById("canvas3");
        const canvas4 = <HTMLCanvasElement>document.getElementById("canvas4");
        canvas3.width = canvas4.width = bits.getWidth();
        canvas3.height = canvas4.height = bits.getHeight();
        canvas3.getContext("2d").putImageData(new ImageData(canvas3buffer, bits.getWidth(), bits.getHeight()), 0, 0);
        canvas4.getContext("2d").putImageData(new ImageData(canvas4buffer, bits.getWidth(), bits.getHeight()), 0, 0);
    }
    if (bytes) {
        handleResponse(bytes);
    }
    $("#time").text(String(times[1] - times[0]) + " ms; " + String(times[2] - times[1]) + " ms; " + String(Date.now() - times[2]) + " ms");
}

function calculateDifference(bits: BitMatrix, srcBytes: Uint8ClampedArray, marginOnly: boolean) {
    let w = bits.getWidth(), h = bits.getHeight();
    let count = 0;
    let i = 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (!(marginOnly && MARGIN <= y && y <= h - MARGIN && MARGIN <= x && x <= w - MARGIN)) {
                if ((bits.get(x, y) ? 0 : 255) !== srcBytes[i]) count++;
            }
            i += 4;
        }
    }
    return count;
}

function drawDifference(canvas: HTMLCanvasElement, srcBytes: Uint8ClampedArray, w: number, h: number) {
    let ctx = canvas.getContext("2d");
    let imageData = ctx.getImageData(0, 0, w, h);
    let destBytes = imageData.data;
    for (let i = 0, l = w * h * 4; i < l; i += 4) {
        let changed = destBytes[i] == srcBytes[i] ? 0 : (destBytes[i] == 255 ? 1 : 2);
        destBytes[i] = changed == 1 ? 255 : 0;
        destBytes[i + 1] = changed == 2 ? 255 : 0;
        destBytes[i + 2] = changed >= 1 ? 255 : 0;
    }
    ctx.putImageData(imageData, 0, 0);
}

function imgToByteArray(img: HTMLImageElement) {
    let canvas = document.createElement("canvas");
    canvas.width = img.width, canvas.height = img.height;
    let ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, img.width, img.height).data;
}

function drawGrayscale(canvas: HTMLCanvasElement, luminanceSource: HTMLCanvasElementLuminanceSource) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    const grayScaleBuf = luminanceSource.getMatrix();
    const buf = new Uint8ClampedArray(w * h * 4);
    for (let i = 0, j = 0, l = w * h; j < l; j++ , i += 4) {
        buf[i] = buf[i + 1] = buf[i + 2] = grayScaleBuf[j];
        buf[i + 3] = 255;
    }
    ctx.putImageData(new ImageData(buf, w, h), 0, 0);
}

function matrixToCanvas(matrix: BitMatrix, canvas: HTMLCanvasElement = document.createElement("canvas")) {
    const ctx = canvas.getContext("2d");
    let w = canvas.width = matrix.getWidth(), h = canvas.height = matrix.getHeight();
    const buf = new Uint8ClampedArray(w * h * 4);
    let i = 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            buf[i] = buf[i + 1] = buf[i + 2] = matrix.get(x, y) ? 0 : 255;
            buf[i + 3] = 255;
            i += 4;
        }
    }
    ctx.putImageData(new ImageData(buf, w, h), 0, 0);
    return canvas;
}

function processCamera() {
    navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
            facingMode: "environment",
            width: { ideal: 2048 },
        }
    }).then(function (stream) {
        video.srcObject = stream;
        video.play().then(() => {
            prepend($("<div class='success' />").text("started camera: "+video.videoWidth+"x"+video.videoHeight).get(0));
            resize(video);
            let width = video.width, height = video.height;
            finderPoses = [[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]];
            setInterval(() => {
                try {
                    main(video);
                } catch (e) { console.error(e); }
            }, 15);
        });
    });
}

function shake(index: number, mag: number, marginOnly: boolean) {
    let bytes = imgToByteArray(expected);
    const dx = [-1, 0, 0, 1, 0];
    const dy = [0, -1, 1, 0, 0];
    let min = Infinity;
    let argmin: number = null;
    for (let i = 0; i < 5; i++) {
        let num = shake0(mag, bytes, index, [dx[i], dy[i]], marginOnly);
        if (num < min) {
            min = num;
            argmin = i;
        }
    }
    let i = argmin;
    let valueToShake = [dx[i], dy[i]];
    finderPoses = Array.from(finderPoses);
    finderPoses[index] = [finderPoses[index][0] + mag * valueToShake[0], finderPoses[index][1] + mag * valueToShake[1]];
}

function shake0(mag: number, bytes: Uint8ClampedArray, index: number, valueToShake: number[], marginOnly: boolean) {
    const canvas1 = <HTMLCanvasElement>document.getElementById("canvas1");
    const canvas4 = <HTMLCanvasElement>document.getElementById("canvas4");
    const finderPosesBackup = finderPoses;
    finderPoses = Array.from(finderPoses);
    finderPoses[index] = [finderPoses[index][0] + mag * valueToShake[0], finderPoses[index][1] + mag * valueToShake[1]];
    const [matrix, bits] = run(canvas1, [0, 0, video.width, video.height]);
    finderPoses = finderPosesBackup;
    return calculateDifference(bits, bytes, marginOnly);
}

function resize(video: HTMLVideoElement) {
    let w = video.videoWidth, h = video.videoHeight;
    video.width = w, video.height = h;
}

function runShake(marginOnly: boolean) {
    videoToCanvas(video, [0, 0, video.width, video.height]);
    for (let i = 0; i < 4; i ++) {
        shake(i, 1, marginOnly);
        shake(i, 0.5, marginOnly);
        shake(i, 0.25, marginOnly);
        shake(i, 0.125, marginOnly);
        shake(i, 0.0625, marginOnly);
    }
}

function handleResponse(array8: Uint8Array) {
    let num = (array8[0] | (array8[1] << 8) | (array8[2] << 16) | (array8[3] << 24)) >>> 0;
    if (num == 0xffffffff) {
        if (!succeededTestData) {
            prepend($("<div class='success'/>").text("success: test data").get(0));
            succeededTestData = true;
        }
        return;
    }
    if (romdata[num]) return;
    if (maxNum !== undefined) {
        if (maxNum < num - 1) {
            let rangeText = maxNum + 1 == num - 1 ? String(maxNum + 1) : (maxNum + 1) + ".." + (num - 1);
            prepend($("<div class='failed'/>").text("failed: " + rangeText).get(0));
        }
        maxNum = Math.max(maxNum, num);
    } else {
        maxNum = num;
    }
    romdata[num] = array8.slice(4).buffer;
    prepend($("<div class='success'/>").text("success: " + num).get(0));
}

function prepend(node: Node) {
    if (output.childNodes.length >= MAX_OUTPUT - 1) {
        output.removeChild(output.childNodes[output.childNodes.length - 1]);
    }
    if (output.childNodes.length == 0) {
        output.appendChild(node);
    } else {
        output.insertBefore(node, output.childNodes[0]);
    }
}