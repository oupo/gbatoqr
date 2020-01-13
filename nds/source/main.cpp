#include <nds.h>
#include <stdio.h>
#include <iostream>
#include <algorithm>

// https://github.com/nayuki/QR-Code-generator
#include "BitBuffer.hpp"
#include "QrCode.hpp"

using qrcodegen::QrCode;
using qrcodegen::QrSegment;
using std::uint8_t;

int frameCount = 0;
int lastFrameCount = 0;

void Vblank() {
	frameCount++;
}

void wait(int count) {
	while (frameCount - lastFrameCount < count) {
		swiWaitForVBlank();
	}
	lastFrameCount = frameCount;
}

void waitKey()
{
	scanKeys();
	while ((keysDown() & KEY_A) == 0)
	{
		swiWaitForVBlank();
		scanKeys();
	}
}

void dumpQR(u16 *videoMemoryMain, int blockid, uint8_t *buf, int len)
{
	std::vector<uint8_t> vec(4 + len);
	vec[0] = blockid & 0xff;
	vec[1] = (blockid >> 8) & 0xff;
	vec[2] = (blockid >> 16) & 0xff;
	vec[3] = (blockid >> 24) & 0xff;
	std::copy(buf, buf + len, vec.begin() + 4);
	const QrCode::Ecc errCorLvl = QrCode::Ecc::MEDIUM; // Error correction level
	std::vector<QrSegment> segs{QrSegment::makeEci(27), QrSegment::makeBytes(vec)};
	int mask = 0; // fix mask for speed
	const QrCode qr = QrCode::encodeSegments(segs, errCorLvl, 1, 40, mask);

	int size = qr.getSize();
	for (int y = -1; y < size + 1; y++)
	{
		for (int x = -1; x < size + 1; x++)
		{
			int c = qr.getModule(x, y) ? 0 : 31;
			for (int dx = 0; dx < 2; dx ++) {
				for (int dy = 0; dy < 2; dy ++) {
					videoMemoryMain[(2 * x + dx + 1) + (2 * y + dy + 1) * 256] = ARGB16(1, c, c, c);
				}
			}
		}
	}
}

const int BLOCK_SIZE = 0x1c0;

void dump(void)
{
	videoSetMode(MODE_5_2D);
	vramSetBankA(VRAM_A_MAIN_BG);
	int bgMain = bgInit(3, BgType_Bmp16, BgSize_B16_256x256, 0, 0);
	u16 *videoMemoryMain = bgGetGfxPtr(bgMain);
	for (int i = 0; i < 256 * 256; i++)
		videoMemoryMain[i] = ARGB16(1, 31, 31, 31);
	char name[13] = {};
	strncpy(name, (char *)0x080000A0, 12);
	printf("Dump target: %s\n", name);
	wait(0);
	for (int i = 0x0; i < 32 * 1024 * 1024; i += BLOCK_SIZE)
	{
		printf("Dumping %08X...", i);
		dumpQR(videoMemoryMain, i / BLOCK_SIZE, ((uint8_t *)GBAROM) + i, BLOCK_SIZE);
		if (i == 0) {
			printf("done. push A\n");
			waitKey();
			wait(0);
		} else {
			printf("done\n");
			wait(60 * 1);
		}
	}
	printf("Done!\n");
}

int main(void)
{
	irqSet(IRQ_VBLANK, Vblank);
	consoleDemoInit();
	videoSetMode(MODE_FB0);
	vramSetBankA(VRAM_A_LCD);
	sysSetCartOwner(1);
	dump();

	while (1)
	{
		swiWaitForVBlank();
	}

	return 0;
}