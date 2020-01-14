import {
    BrowserQRCodeReader, QRCodeReader,
    HTMLCanvasElementLuminanceSource, HybridBinarizer,
    BinaryBitmap, BitMatrix,
    QRCodeDecoder, DetectorResult, GridSamplerInstance, PerspectiveTransform
} from "../zxing-js/src/index";
import * as JSZip from "jszip";
import { saveAs } from "file-saver";
import * as StackBlur from "stackblur-canvas";

const MAX_OUTPUT = 50;
const MAX_ROM_BYTES = 32 * 1024 * 1024;
const BLOCK_SIZE = 0x1c0;
const romdata: ArrayBuffer[] = [];
const codeReader = new BrowserQRCodeReader(0);
const video = <HTMLVideoElement>document.getElementById('video');
const output = document.getElementById("output");
const qrreader = new QRCodeReader();
const img = <HTMLImageElement>document.getElementById("image");
const expected = <HTMLImageElement>document.getElementById("expected");

function main() {
    const w = img.width, h = img.height;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = w, canvas.height = h;
    ctx.drawImage(img, 0, 0, w, h);
    //StackBlur.canvasRGBA(canvas, 0, 0, w, h, 1);
    const luminanceSource = new HTMLCanvasElementLuminanceSource(canvas);
    drawGrayscale(canvas, luminanceSource);
    const hybridBinarizer = new HybridBinarizer(luminanceSource, 140);
    const bitmap = new BinaryBitmap(hybridBinarizer);
    let matrix = bitmap.getBlackMatrix();
    document.body.appendChild(matrixToCanvas(matrix));
    const dimX = 126;
    const dimY = 94;
    const topLeft = [372, 467];
    const topRight = [1521, 494];
    const bottomLeft = [350, 1305];
    const bottomRight = [1544, 1375];
    const transform = PerspectiveTransform.quadrilateralToQuadrilateral(
        3.5, 3.5,
        dimX - 3.5, 3.5,
        dimX - 0, dimY - 0,
        3.5, dimY - 3.5,
        topLeft[0], topLeft[1],
        topRight[0],topRight[1],
        bottomRight[0], bottomRight[1],
        bottomLeft[0], bottomLeft[1]);
    const sampler = GridSamplerInstance.getInstance();
    const bits = sampler.sampleGridWithTransform(matrix, dimX, dimY, transform);
    let detectorResult = new DetectorResult(bits, null);
    let canvas2 = matrixToCanvas(bits);
    drawDifference(canvas2, expected);
    document.body.appendChild(canvas2);
    //console.log(qrreader.decode(bitmap));
}

function drawDifference(canvas: HTMLCanvasElement, img: HTMLImageElement) {
    let ctx = canvas.getContext("2d");
    let srcBytes = imgToByteArray(img);
    let imageData = ctx.getImageData(0, 0, img.width, img.height);
    let destBytes = imageData.data;
    for (let i = 0, l = img.width * img.height * 4; i < l; i += 4) {
        let changed = destBytes[i] == srcBytes[i] ? 0 : (destBytes[i] == 255 ? 1 : 2);
        destBytes[i] = changed == 1 ? 255 : 0;
        destBytes[i+1] = changed == 2 ? 255 : 0;
        destBytes[i+2] = changed >= 1 ? 255 : 0;
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
    const grayScaleBuf = luminanceSource.buffer;
    const buf = new Uint8ClampedArray(w * h * 4);
    for (let i = 0, j = 0, l = w * h; j < l; j++ , i += 4) {
        buf[i] = buf[i + 1] = buf[i + 2] = grayScaleBuf[j];
        buf[i + 3] = 255;
    }
    ctx.putImageData(new ImageData(buf, w, h), 0, 0);
}

function matrixToCanvas(matrix: BitMatrix) {
    const canvas = document.createElement("canvas");
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

if (img.complete) {
    main();
} else {
    img.addEventListener("load", () => {
        main();
    });
}

function processCamera() {
    const canvas = <HTMLCanvasElement>document.getElementById("canvas");
    const context = canvas.getContext("2d");
    navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "environment" } }).then(function (stream) {
        codeReader.decodeFromStream(stream, video, (res) => {
            try {
                if (res) {
                    handleResponse(res.getText());
                    canvas.style.display = "";
                } else {
                    canvas.style.display = "none";
                }
            } catch (e) { console.error(e); }
        }).then(() => {
            let w = video.videoWidth, h = video.videoHeight;
            video.width = w, video.height = h;
            canvas.width = w, canvas.height = h;
            document.getElementById("video-container").style.width = w + "px";
            document.getElementById("video-container").style.height = h + "px";
            context.clearRect(0, 0, w, h);
            context.fillStyle = "rgba(0,0,255,0.5)";
            context.fillRect(0, 0, w, h);
        })
    });
}

if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    //processCamera();
} else {
    alert("The browser does not support camera.");
}



document.getElementById("save-button").addEventListener("click", () => {
    let zip = new JSZip();
    for (let num in romdata) {
        zip.file(String(num), romdata[num]);
    }
    zip.generateAsync({ type: "blob" })
        .then(function (content) {
            saveAs(content, "gbarom.zip");
        });
});

let maxNum: number = undefined;

function handleResponse(res: string) {
    let buffer = new ArrayBuffer(res.length);
    let array8 = new Uint8Array(buffer);
    if (buffer.byteLength % 4 != 0) return;
    let array32 = new Uint32Array(buffer);
    for (let i = 0; i < res.length; i++) array8[i] = res.charCodeAt(i);
    let num = array32[0];
    if (!(0 <= num && num < Math.ceil(MAX_ROM_BYTES / BLOCK_SIZE))) return;
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