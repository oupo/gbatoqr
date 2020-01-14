import {
    BitMatrix, PerspectiveTransform, GridSampler, NotFoundException
} from "../zxing-js/src/index";

export class MyGridSampler extends GridSampler {
    public sampleGrid(image: BitMatrix,
        dimensionX: number,
        dimensionY: number,
        p1ToX: number, p1ToY: number,
        p2ToX: number, p2ToY: number,
        p3ToX: number, p3ToY: number,
        p4ToX: number, p4ToY: number,
        p1FromX: number, p1FromY: number,
        p2FromX: number, p2FromY: number,
        p3FromX: number, p3FromY: number,
        p4FromX: number, p4FromY: number): BitMatrix /*throws NotFoundException*/ {

        const transform = PerspectiveTransform.quadrilateralToQuadrilateral(
            p1ToX, p1ToY, p2ToX, p2ToY, p3ToX, p3ToY, p4ToX, p4ToY,
            p1FromX, p1FromY, p2FromX, p2FromY, p3FromX, p3FromY, p4FromX, p4FromY);

        return this.sampleGridWithTransform(image, dimensionX, dimensionY, transform);
    }

    /*@Override*/
    public sampleGridWithTransform(image: BitMatrix,
        dimensionX: number,
        dimensionY: number,
        transform: PerspectiveTransform): BitMatrix {
        if (dimensionX <= 0 || dimensionY <= 0) {
            throw new NotFoundException();
        }
        const bits = new BitMatrix(dimensionX, dimensionY);
        const points = new Float32Array(9 * 2);
        for (let y = 0; y < dimensionY; y++) {
            for (let x = 0; x < dimensionX; x ++) {
                for (let j = 0; j < 3; j ++) {
                    for (let i = 0; i < 3; i ++) {
                        points[2 * (3 * j + i)] = x + (1/4) * (1+i);
                        points[2 * (3 * j + i) + 1] = y + (1/4) * (1+j);
                    }
                }
                transform.transformPoints(points);
                GridSampler.checkAndNudgePoints(image, points);
                try {
                    let count = 0;
                    for (let j = 0; j < 3; j ++) {
                        for (let i = 0; i < 3; i ++) {
                            let k = 2 * (3 * j + i);
                            if (image.get(Math.floor(points[k]), Math.floor(points[k+1]))) count ++;
                        }
                    }
                    if (count >= 5) {
                        bits.set(x, y);
                    }
                } catch (aioobe) {
                    throw new NotFoundException();
                }
            }

        }
        return bits;
    }

}
