import {
    BitMatrix, PerspectiveTransform,
    ChecksumException, NotFoundException
} from "../zxing-js/src/index";
import { MyGridSampler } from "./MyGridSampler";
import { binarize } from "./MyBinarizer";
import { WideQRDecoder } from "./WideQRDecoder";

const dimX = 252;
const dimY = 94;

self.addEventListener("message", (message) => {
    const imageBuffer = <Uint8ClampedArray>message.data.imageBuffer;
    const width = <number>message.data.width;
    const height = <number>message.data.height;
    const x = <number>message.data.x;
    const y = <number>message.data.y;
    const finderPoses = <number[][]>message.data.finderPoses;
    const threshold = <number>message.data.threshold;
    const times = <number[]>message.data.times;
    const [matrix, bits, bytes] = work(imageBuffer, width, height, x, y, finderPoses, threshold);
    const matrixBits = matrix.getBits();
    const bitsBits = bits.getBits();
    const time = Date.now();
    const transfer: Transferable[] = [matrixBits.buffer];
    if (bitsBits) transfer.push(bitsBits.buffer);
    if (bytes) transfer.push(bytes.buffer);
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
        times: [...times, time]}, transfer);
});

function work(imageBuffer: Uint8ClampedArray, w: number, h: number, x: number, y: number, finderPoses: number[][], threshold: number): [BitMatrix, BitMatrix, Uint8Array] {
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
    if (bits) {
        try {
                const result = new WideQRDecoder().decodeBitMatrix(bits);
                bytes = result.getByteSegments()[0];
        } catch(e) {
            if (!(e instanceof ChecksumException)) throw e;
        }
    }
    return [matrix, bits, bytes];
}