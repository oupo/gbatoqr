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

function main(source: CanvasImageSource) {
    const threshold = Number((<HTMLInputElement>document.getElementById("threshold")).value);
    const blurRadius = Number((<HTMLInputElement>document.getElementById("blur-radius")).value);
    const w = <number>source.width, h = <number>source.height;
    const topLeft = finderPos(0);
    const topRight = finderPos(1);
    const bottomRight = finderPos(2);
    const bottomLeft = finderPos(3);
    const canvas1 = <HTMLCanvasElement>document.getElementById("canvas1");
    const canvas2 = <HTMLCanvasElement>document.getElementById("canvas2");
    const canvas3 = <HTMLCanvasElement>document.getElementById("canvas3");
    const ctx = canvas1.getContext("2d");
    canvas1.width = w, canvas1.height = h;
    ctx.drawImage(source, 0, 0, w, h);
    StackBlur.canvasRGBA(canvas1, 0, 0, w, h, blurRadius);
    const luminanceSource = new HTMLCanvasElementLuminanceSource(canvas1);
    const hybridBinarizer = new HybridBinarizer(luminanceSource, threshold);
    const bitmap = new BinaryBitmap(hybridBinarizer);
    let matrix = bitmap.getBlackMatrix();
    const dimX = 126;
    const dimY = 94;
    
    ctx.strokeStyle = "white";
    ctx.beginPath();
    ctx.moveTo(topLeft[0], topLeft[1]);
    ctx.lineTo(topRight[0], topRight[1]);
    ctx.lineTo(bottomRight[0], bottomRight[1]);
    ctx.lineTo(bottomLeft[0], bottomLeft[1]);
    ctx.closePath();
    ctx.stroke();

    matrixToCanvas(matrix, canvas2);
    const transform = PerspectiveTransform.quadrilateralToQuadrilateral(
        0.5, 0.5,
        dimX - 0.5, 0.5,
        dimX - 0.5, dimY - 0.5,
        0.5, dimY - 0.5,
        topLeft[0], topLeft[1],
        topRight[0],topRight[1],
        bottomRight[0], bottomRight[1],
        bottomLeft[0], bottomLeft[1]);
    const sampler = GridSamplerInstance.getInstance();
    const bits = sampler.sampleGridWithTransform(matrix, dimX, dimY, transform);
    let detectorResult = new DetectorResult(bits, null);
    matrixToCanvas(bits, canvas3);
    drawDifference(canvas3, expected);
    //console.log(qrreader.decode(bitmap));
}

function setupFinder(i: number) {
    const colors = ["#4287f5", "#1fdb5a", "#eda73e", "#e85fb1"];
    const defaultCoordinates = [[10, 10], [300, 10], [300, 300], [10, 300]];
    let canvas = <HTMLCanvasElement>document.getElementById("finder"+i);
    const size = 20;
    canvas.width = canvas.height = size;
    let ctx = canvas.getContext("2d");
    ctx.strokeStyle = colors[i];
    ctx.lineWidth = 4;
    ctx.arc(size / 2, size / 2, size /  2, 0, Math.PI * 2);
    ctx.stroke();
    $(canvas).draggable({
        drag: (ev, ui) => ondrag(ui),
        stop: (ev, ui) => ondrag(ui),
    });
    canvas.style.left = defaultCoordinates[i][0] + "px";
    canvas.style.top = defaultCoordinates[i][1] + "px";

    function ondrag(ui: JQueryUI.DraggableEventUIParams) {
    }
}

function finderPos(i: number) {
    let canvas = <HTMLCanvasElement>document.getElementById("finder"+i);
    let $canvas = $(canvas);
    let pos = $canvas.position();
    return [pos.left + 10, pos.top + 10];
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
    const canvas = <HTMLCanvasElement>document.getElementById("canvas");
    const context = canvas.getContext("2d");
    navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "environment", 
                 width: { ideal: 1280 },
        }
    }).then(function (stream) {
        video.srcObject = stream;
        video.play().then(() => {
            let w = video.videoWidth, h = video.videoHeight;
            video.width = w, video.height = h;
            canvas.width = w, canvas.height = h;
            document.getElementById("video-container").style.width = w + "px";
            document.getElementById("video-container").style.height = h + "px";
            context.clearRect(0, 0, w, h);
            context.fillStyle = "rgba(0,0,255,0.5)";
            context.fillRect(0, 0, w, h);
            for (let i = 0; i < 4; i ++) setupFinder(i);
            
            setInterval(() => {
                try {
                    main(video);
                } catch(e) { console.error(e); }
            }, 100);
        });
    });
}

if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    processCamera();
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