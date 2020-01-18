import {
    BitMatrix, FormatException, ReedSolomonDecoder, GenericGF, DecodeHintType,
    DecoderResult, ChecksumException,
    QRCodeDecodedBitStreamParser, QRCodeVersion, QRCodeDataBlock, QRCodeErrorCorrectionLevel,
    QRCodeECBlocks, QRCodeECB
} from "../zxing-js/src/index";

const WIDTH = 252;
const HEIGHT = 94;
const DUMMY_VER = QRCodeVersion.getVersionForNumber(40);
const ECBLOCKS = new QRCodeECBlocks(30, new QRCodeECB(3, 125), new QRCodeECB(16, 126));
const REAL_VER = new QRCodeVersion(0, Int32Array.from([]), ECBLOCKS);
const TOTAL_CODE_WORDS = Math.floor((WIDTH * HEIGHT) / 8);


export class WideQRDecoder {
    private rsDecoder: ReedSolomonDecoder;

    public constructor() {
        this.rsDecoder = new ReedSolomonDecoder(GenericGF.QR_CODE_FIELD_256);
    }
    public decodeBooleanArray(image: boolean[][], hints?: Map<DecodeHintType, any>): DecoderResult {
        return this.decodeBitMatrix(BitMatrix.parseFromBooleanArray(image), hints);
    }

    public decodeBitMatrix(bits: BitMatrix, hints?: Map<DecodeHintType, any>): DecoderResult {
        const parser = new WideQRBitMatrixParser(bits);
        return this.decodeBitMatrixParser(parser, hints);
    }

    private decodeBitMatrixParser(parser: WideQRBitMatrixParser, hints: Map<DecodeHintType, any>): DecoderResult {
        const codewords = parser.readCodewords();
        const dataBlocks = QRCodeDataBlock.getDataBlocks(codewords, REAL_VER, QRCodeErrorCorrectionLevel.L);
        let totalBytes = 0;
        for (const dataBlock of dataBlocks) {
            totalBytes += dataBlock.getNumDataCodewords();
        }
        const resultBytes = new Uint8Array(totalBytes);
        let resultOffset = 0;
        for (const dataBlock of dataBlocks) {
            const codewordBytes = dataBlock.getCodewords();
            const numDataCodewords = dataBlock.getNumDataCodewords();
            this.correctErrors(codewordBytes, numDataCodewords);
            for (let i = 0; i < numDataCodewords; i++) {
                resultBytes[resultOffset++] = codewordBytes[i];
            }
        }
        return QRCodeDecodedBitStreamParser.decode(resultBytes, DUMMY_VER, null, hints);
    }

    private correctErrors(codewordBytes: Uint8Array, numDataCodewords: number): void {
        const numCodewords = codewordBytes.length;
        const codewordsInts = new Int32Array(codewordBytes);
        try {
            this.rsDecoder.decode(codewordsInts, codewordBytes.length - numDataCodewords);
        } catch (ignored) {
            throw new ChecksumException();
        }
        for (let i = 0; i < numDataCodewords; i++) {
            codewordBytes[i] = codewordsInts[i];
        }
    }

}

class WideQRDataMask {
    public static isMasked(x: number, y: number) {
        return ((x + y + ((x * y) % 3)) & 0x01) === 0;
    }

    public static unmaskBitMatrix(bits: BitMatrix): void {
        const width = bits.getWidth(), height = bits.getHeight();
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (this.isMasked(x, y)) {
                    bits.flip(x, y);
                }
            }
        }
    }
}

class WideQRBitMatrixParser {
    private bitMatrix: BitMatrix;

    public constructor(bitMatrix: BitMatrix) {
        this.bitMatrix = bitMatrix;
    }

    private copyBit(i: number, j: number, versionBits: number): number {
        const bit: boolean = this.bitMatrix.get(i, j);
        return bit ? (versionBits << 1) | 0x1 : versionBits << 1;
    }

    private buildFunctionPattern() {
        const bitMatrix = new BitMatrix(WIDTH, HEIGHT);
        //bitMatrix.setRegion(0, 0, 2, 2);
        //bitMatrix.setRegion(WIDTH - 2, 0, 2, 2);
        //bitMatrix.setRegion(0, HEIGHT - 2, 2, 2);
        //bitMatrix.setRegion(WIDTH - 2, HEIGHT - 2, 2, 2);
        return bitMatrix;
    }

    public readCodewords(): Uint8Array {
        WideQRDataMask.unmaskBitMatrix(this.bitMatrix);

        const functionPattern = this.buildFunctionPattern();

        let readingUp: boolean;
        const result = new Uint8Array(TOTAL_CODE_WORDS);
        let resultOffset = 0;
        let currentByte = 0;
        let bitsRead = 0;
        for (let j = WIDTH - 1; j > 0; j -= 2) {
            readingUp = ((j + 1) & 2) == 0;
            for (let count = 0; count < HEIGHT; count++) {
                const i = readingUp ? HEIGHT - 1 - count : count;
                for (let col = 0; col < 2; col++) {
                    if (!functionPattern.get(j - col, i)) {
                        bitsRead++;
                        currentByte <<= 1;
                        if (this.bitMatrix.get(j - col, i)) {
                            currentByte |= 1;
                        }
                        if (bitsRead === 8) {
                            result[resultOffset++] = currentByte;
                            bitsRead = 0;
                            currentByte = 0;
                        }
                    }
                }
            }
        }
        if (resultOffset !== TOTAL_CODE_WORDS) {
            throw new FormatException();
        }
        return result;
    }

    public remask(): void {
        WideQRDataMask.unmaskBitMatrix(this.bitMatrix);
    }
}
