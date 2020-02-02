import {
    BitMatrix, PerspectiveTransform,
    ChecksumException, NotFoundException
} from "../zxing-js/src/index";
import { MyGridSampler } from "./MyGridSampler";
import { binarize } from "./MyBinarizer";
import { WideQRDecoder } from "./WideQRDecoder";

const dimX = 252;
const dimY = 94;
let expectedBytes: Uint8ClamedArray = null;

self.addEventListener("message", (message) => {
    if (message.data.type === "expectedbytes") {
        expectedBytes = <Uint8ClampedArray>message.data.expectedBytes;
    } else if (message.data.type === "work") {
        const imageBuffer = <Uint8ClampedArray>message.data.imageBuffer;
        const width = <number>message.data.width;
        const height = <number>message.data.height;
        const x = <number>message.data.x;
        const y = <number>message.data.y;
        const finderPoses = <number[][]>message.data.finderPoses;
        const threshold = <number>message.data.threshold;
        const times = <number[]>message.data.times;
        const [matrix, bits, bytes, canvas3buffer, canvas4buffer] = work(imageBuffer, width, height, x, y, finderPoses, threshold);
        const matrixBits = matrix.getBits();
        const bitsBits = bits.getBits();
        const time = Date.now();
        const transfer: Transferable[] = [matrixBits.buffer];
        if (bitsBits) transfer.push(bitsBits.buffer);
        if (bytes) transfer.push(bytes.buffer);
        if (canvas3buffer) transfer.push(canvas3buffer.buffer);
        if (canvas4buffer) transfer.push(canvas4buffer.buffer);
        self.postMessage({
            matrixBits,
            matrixWidth: matrix.getWidth(),
            matrixHeight: matrix.getHeight(),
            matrixRowSize: matrix.getRowSize(),
            bitsBits,
            bitsWidth: bits.getWidth(),
            bitsHeight: bits.getHeight(),
            bitsRowSize: bits.getRowSize(),
            bytes,
            canvas3buffer,
            canvas4buffer,
            times: [...times, time]}, transfer);
    }
});

function work(imageBuffer: Uint8ClampedArray, w: number, h: number, x: number, y: number, finderPoses: number[][], threshold: number): [BitMatrix, BitMatrix, Uint8Array, Uint8ClampedArray, Uint8ClampedArray] {
    const topLeft = finderPoses[0];
    const topRight = finderPoses[1];
    const bottomRight = finderPoses[2];
    const bottomLeft = finderPoses[3];
    const matrix = binarize(imageBuffer, w, h, threshold);
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
    let bytes: Uint8Array = null;
    let canvas3buffer: Uint8ClampedArray;
    let canvas4buffer: Uint8ClampedArray;
    if (bits) {
        try {
                const result = new WideQRDecoder().decodeBitMatrix(bits);
                bytes = result.getByteSegments()[0];
        } catch(e) {
            if (!(e instanceof ChecksumException)) throw e;
        }
        canvas3buffer = matrixToImageBuffer(bits);
        canvas4buffer = matrixToImageBuffer(bits);
    }
    difference(canvas4buffer, expectedBytes, matrix.getWidth(), h = matrix.getHeight());
    return [matrix, bits, bytes, canvas3buffer, canvas4buffer];
}

function matrixToImageBuffer(matrix: BitMatrix) {
    let w = matrix.getWidth(), h = matrix.getHeight();
    const buf = new Uint8ClampedArray(w * h * 4);
    let i = 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            buf[i] = buf[i + 1] = buf[i + 2] = matrix.get(x, y) ? 0 : 255;
            buf[i + 3] = 255;
            i += 4;
        }
    }
    return buf;
}

function difference(destBytes: Uint8ClampedArray, srcBytes: Uint8ClampedArray, w: number, h: number) {
    for (let i = 0, l = w * h * 4; i < l; i += 4) {
        let changed = destBytes[i] == srcBytes[i] ? 0 : (destBytes[i] == 255 ? 1 : 2);
        destBytes[i] = changed == 1 ? 255 : 0;
        destBytes[i + 1] = changed == 2 ? 255 : 0;
        destBytes[i + 2] = changed >= 1 ? 255 : 0;
    }
}