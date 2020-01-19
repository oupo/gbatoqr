import {
    BrowserQRCodeReader, QRCodeReader,
    HTMLCanvasElementLuminanceSource, HybridBinarizer,
    BinaryBitmap, BitMatrix,
    QRCodeDecoder, DetectorResult, GridSamplerInstance, PerspectiveTransform,
    GridSampler, ChecksumException, QRCodeFinderPatternFinder, QRCodeFinderPattern
} from "../zxing-js/src/index";
import { saveAs } from "file-saver";
import { rgbToHsl } from "./rgbToHsl";
import { iota } from "./util";
//import * as JSZip from "jszip";
declare global { const JSZip : any; }

import * as StackBlur from "stackblur-canvas";
import { MyGridSampler } from "./MyGridSampler";
import { WideQRDecoder } from "./WideQRDecoder";

const MAX_OUTPUT = 50;
const MAX_ROM_BYTES = 32 * 1024 * 1024;
const BLOCK_SIZE = 0x1c0;
const video = <HTMLVideoElement>document.getElementById('video');
const output = document.getElementById("output");
const img = <HTMLImageElement>document.getElementById("image");
const expected = <HTMLImageElement>document.getElementById("expected");
let finderPoses: Array<[number, number]> = [[10, 10], [30, 10], [30, 30], [10, 30]];
let romdata: ArrayBuffer[] = [];
let started = true;
let maxNum: number = undefined;
let succeededTestData = false;


const dimX = 252;
const dimY = 188;

//test();

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

function test2() {
    const img = <HTMLImageElement>document.getElementById("test");
    if (!img.complete) {
        img.addEventListener("load", test2);
        return;
    }
    const w = img.width, h = img.height;
    const canvas = document.createElement("canvas");
    canvas.width = w, canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    //StackBlur.canvasRGBA(canvas, 0, 0, w, h, 1);
    const source = new HTMLCanvasElementLuminanceSource(canvas);
    const threshold = 90;
    const hybridBinarizer = new HybridBinarizer(source, threshold);
    const bitmap = new BinaryBitmap(hybridBinarizer);
    let matrix = bitmap.getBlackMatrix();
    const finder = new QRCodeFinderPatternFinder(matrix, null);
    console.log(finder.find(null, 4));
    const patterns = finder.getPossibleCenters();
    console.log(patterns);
    if (patterns.length < 4) return;
    const hues: number[] = [];
    for (let pattern of patterns) {
        const imageData = ctx.getImageData(pattern.getX(), pattern.getY(), 1, 1);
        const data = imageData.data;
        hues.push(rgbToHsl(data[0], data[1], data[2])[0]);
    }
    let newPatterns = iota(4).sort((i, j) => hues[i] - hues[j]).map(i => patterns[i]);
    for (let i = 0; i < 4; i ++) {
        const pattern = newPatterns[i];
        console.log(pattern);
        ctx.fillStyle = "hsl("+(i*90)+",100%,50%)";
        ctx.fillRect(pattern.getX() - 2, pattern.getY() - 2, 4, 4);
    }
    
    const ofs = 7;
    const transform = PerspectiveTransform.quadrilateralToQuadrilateral(
        ofs, ofs,
        dimX - ofs, ofs,
        dimX - ofs, dimY - ofs,
        ofs, dimY - ofs,
        newPatterns[0].getX(), newPatterns[0].getY(),
        newPatterns[1].getX(), newPatterns[1].getY(),
        newPatterns[3].getX(), newPatterns[3].getY(),
        newPatterns[2].getX(), newPatterns[2].getY());
    const points = Float32Array.from([0, 0, dimX, 0, dimX, dimY, 0, dimY]);
    transform.transformPoints(points);
    console.log(points);
    ctx.strokeStyle = "red";
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    ctx.lineTo(points[2], points[3]);
    ctx.lineTo(points[4], points[5]);
    ctx.lineTo(points[6], points[7]);
    ctx.closePath();
    ctx.stroke();
    document.body.appendChild(canvas);
}

function searchFinder() {
    const threshold = Number((<HTMLInputElement>document.getElementById("threshold")).value);
    const canvas1 = <HTMLCanvasElement>document.getElementById("canvas1");
    const canvas2 = <HTMLCanvasElement>document.getElementById("canvas2");
    const w = canvas1.width, h = canvas1.height;
    const ctx = canvas1.getContext("2d");
    videoToCanvas(video);
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
    const hues: number[] = [];
    for (let pattern of patterns) {
        const imageData = ctx.getImageData(pattern.getX(), pattern.getY(), 1, 1);
        const data = imageData.data;
        hues.push(rgbToHsl(data[0], data[1], data[2])[0]);
    }
    let newPatterns = iota(4).sort((i, j) => hues[i] - hues[j]).map(i => patterns[i]);
    const ofs = 7;
    const transform = PerspectiveTransform.quadrilateralToQuadrilateral(
        ofs, ofs,
        dimX - ofs, ofs,
        dimX - ofs, dimY - ofs,
        ofs, dimY - ofs,
        newPatterns[0].getX(), newPatterns[0].getY(),
        newPatterns[1].getX(), newPatterns[1].getY(),
        newPatterns[3].getX(), newPatterns[3].getY(),
        newPatterns[2].getX(), newPatterns[2].getY());
    const points = Float32Array.from([0, 0, dimX, 0, dimX, dimY, 0, dimY]);
    transform.transformPoints(points);
    finderPoses = [[points[0], points[1]], [points[2], points[3]], [points[4], points[5]], [points[6], points[7]]];
    prepend($("<div class='success'>searched finders ("+finderPoses.map(x => "("+x[0]+","+x[1]+")").join(",")+")</div>").get(0));
}

function run(canvas1: HTMLCanvasElement) {
    const threshold = Number((<HTMLInputElement>document.getElementById("threshold")).value);
    const w = canvas1.width, h = canvas1.height;
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
        topLeft[0], topLeft[1],
        topRight[0], topRight[1],
        bottomRight[0], bottomRight[1],
        bottomLeft[0], bottomLeft[1]);
    const sampler = new MyGridSampler();
    const bits = sampler.sampleGridWithTransform(matrix, dimX, dimY, transform);
    return [matrix, bits];
}

function videoToCanvas(video: HTMLVideoElement) {
    const canvas1 = <HTMLCanvasElement>document.getElementById("canvas1");
    const ctx = canvas1.getContext("2d");
    const w = video.width, h = video.height;
    canvas1.width = w, canvas1.height = h;
    ctx.drawImage(video, 0, 0, w, h);
}

function main(source: HTMLVideoElement) {
    const canvas1 = <HTMLCanvasElement>document.getElementById("canvas1");
    const ctx = canvas1.getContext("2d");
    videoToCanvas(source);
    const topLeft = finderPoses[0];
    const topRight = finderPoses[1];
    const bottomRight = finderPoses[2];
    const bottomLeft = finderPoses[3];
    let matrix: BitMatrix;
    let bits: BitMatrix;
    try {
        [matrix, bits] = run(canvas1);
    } catch(e) {}
    ctx.strokeStyle = "red";
    ctx.beginPath();
    ctx.moveTo(topLeft[0], topLeft[1]);
    ctx.lineTo(topRight[0], topRight[1]);
    ctx.lineTo(bottomRight[0], bottomRight[1]);
    ctx.lineTo(bottomLeft[0], bottomLeft[1]);
    ctx.closePath();
    ctx.stroke();
    for (let i = 0; i < 4; i ++) {
        ctx.fillStyle = "hsl("+([0, 1, 3, 2][i]*90)+", 100%, 50%)";
        ctx.beginPath();
        ctx.arc(finderPoses[i][0], finderPoses[i][1], 3, 0, 2 * Math.PI);
        ctx.fill();
    }
    if (matrix && bits) {
        const canvas2 = <HTMLCanvasElement>document.getElementById("canvas2");
        const canvas3 = <HTMLCanvasElement>document.getElementById("canvas3");
        const canvas4 = <HTMLCanvasElement>document.getElementById("canvas4");
        matrixToCanvas(matrix, canvas2);
        matrixToCanvas(bits, canvas3);
        matrixToCanvas(bits, canvas4);
        drawDifference(canvas4, expected);
    }

    if (!started) return;
    try {
        let result = new WideQRDecoder().decodeBitMatrix(bits);
        handleResponse(result.getByteSegments()[0]);
    } catch(e) {
        if (!(e instanceof ChecksumException)) console.error(e);
    }
}

function calculateDifference(bits: BitMatrix, srcBytes: Uint8ClampedArray) {
    let w = bits.getWidth(), h = bits.getHeight();
    let count = 0;
    let i = 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if ((bits.get(x, y) ? 0 : 255) !== srcBytes[i]) count++;
            i += 4;
        }
    }
    return count;
}

function drawDifference(canvas: HTMLCanvasElement, img: HTMLImageElement) {
    let ctx = canvas.getContext("2d");
    let srcBytes = imgToByteArray(img);
    let imageData = ctx.getImageData(0, 0, img.width, img.height);
    let destBytes = imageData.data;
    for (let i = 0, l = img.width * img.height * 4; i < l; i += 4) {
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
            prepend($("<div class='success' />").text("started camera: "+video.videoWidth+","+video.videoHeight).get(0));
            resize(video);
            setInterval(() => {
                try {
                    main(video);
                } catch (e) { console.error(e); }
            }, 100);
        });
        //video.addEventListener("resize", () => {
        //    resize(video);
        //});
    });
}

function shake(index: number, mag: number) {
    videoToCanvas(video);
    let bytes = imgToByteArray(expected);
    const dx = [-1, 0, 0, 1, 0];
    const dy = [0, -1, 1, 0, 0];
    let min = Infinity;
    let argmin: number = null;
    for (let i = 0; i < 5; i++) {
        let num = shake0(mag, bytes, index, [dx[i], dy[i]]);
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

function shake0(mag: number, bytes: Uint8ClampedArray, index: number, valueToShake: number[]) {
    const canvas1 = <HTMLCanvasElement>document.getElementById("canvas1");
    const canvas4 = <HTMLCanvasElement>document.getElementById("canvas4");
    const finderPosesBackup = finderPoses;
    finderPoses = Array.from(finderPoses);
    finderPoses[index] = [finderPoses[index][0] + mag * valueToShake[0], finderPoses[index][1] + mag * valueToShake[1]];
    const [matrix, bits] = run(canvas1);
    finderPoses = finderPosesBackup;    
    return calculateDifference(bits, bytes);
}

function resize(video: HTMLVideoElement) {
    let w = video.videoWidth, h = video.videoHeight;
    video.width = w, video.height = h;
}

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
        .then(function (content) {
            saveAs(content, "gbarom.zip");
        });
});
document.getElementById("shake").addEventListener("click", () => {
    $("#shake").text("Shaking...");
    setTimeout(() => {
        for (let i = 0; i < 4; i ++) {
            shake(i, 1);
            shake(i, 0.5);
            shake(i, 0.25);
            shake(i, 0.125);
        }
        $("#shake").text("Shake corner points");
    }, 0);
});
document.getElementById("search-finder").addEventListener("click", () => {
    searchFinder();
});
document.getElementById("start").addEventListener("click", () => {
    started = true;
    $("#start").text("started");
});
document.getElementById("reset").addEventListener("click", () => {
    started = false;
    $("#start").text("Start");
    romdata = [];
    succeededTestData = false;
});


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