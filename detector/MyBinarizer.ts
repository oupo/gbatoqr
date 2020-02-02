import {
    BitMatrix,
} from "../zxing-js/src/index";

export function binarize(imageBuffer: Uint8ClampedArray, width: number, height: number, threshold: number) {
    const matrix = new BitMatrix(width, height);
    let i = 0;
    for (let y = 0; y < height; y ++) {
        for (let x = 0; x < width; x ++) {
            const pixelR = imageBuffer[i];
            const pixelG = imageBuffer[i + 1];
            const pixelB = imageBuffer[i + 2];
            const gray = (306 * pixelR + 601 * pixelG + 117 * pixelB + 0x200) >> 10;
            if (gray <= threshold) {
                matrix.set(x, y);
            }
            i += 4;
        }
    }
    return matrix;
}