#include <nds.h>
#include <stdio.h>
#include <iostream>
#include <algorithm>
#include <string>
#include <sstream>
#include <algorithm>
#include <iterator>

// https://github.com/nayuki/QR-Code-generator
#include "BitBuffer.hpp"
#include "QrCode.hpp"

using qrcodegen::QrCode;
using qrcodegen::QrSegment;
using std::uint8_t;

int frameCount = 0;
int lastFrameCount = 0;

const int MARGIN = 5;
const int QR_WIDTH = 252 - MARGIN * 2;
const int QR_HEIGHT = 94 - MARGIN * 2;
const int QR_ECC_LEN = 30;
const int QR_NUM_BLOCKS = 19;
const int BLOCK_SIZE = 0x700;

void Vblank()
{
	frameCount++;
}

void OnKeyPressed(int key) {
   if(key > 0)
      iprintf("%c", key);
}

void wait(int count)
{
	while (frameCount - lastFrameCount < count)
	{
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

void fillRect(u16 *videoMemory, int x, int y, int w, int h, u16 c)
{
	for (int dx = 0; dx < w; dx++)
	{
		for (int dy = 0; dy < h; dy++)
		{
			videoMemory[x + dx + (y + dy) * 256] = c;
		}
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
	std::vector<QrSegment> segs{QrSegment::makeEci(27), QrSegment::makeBytes(vec)};
	int mask = 7;
	const QrCode qr = QrCode::encodeSegmentsWide(segs, mask, QR_WIDTH, QR_HEIGHT, QR_ECC_LEN, QR_NUM_BLOCKS);

	for (int y = 0; y < QR_HEIGHT; y++)
	{
		for (int x = 0; x < QR_WIDTH; x++)
		{
			int c = qr.getModule(x, y) ? 0 : 31;
			fillRect(videoMemoryMain, 1 * (x + MARGIN) + 2, 2 * (y + MARGIN) + 2, 1, 2, ARGB16(1, c, c, c));
		}
	}
}

void writeRandomData(std::vector<uint8_t> &data, uint32_t seed)
{
	data.resize(BLOCK_SIZE);
	for (int i = 0; i < BLOCK_SIZE / 4; i++)
	{
		data[i * 4 + 0] = seed & 0xff;
		data[i * 4 + 1] = (seed >> 8) & 0xff;
		data[i * 4 + 2] = (seed >> 16) & 0xff;
		data[i * 4 + 3] = (seed >> 24) & 0xff;
		seed = seed * 0x41c64e6d + 0x6073;
	}
}

void drawFinder(uint16_t *videoMemoryMain, int x, int y, u16 color) {
	fillRect(videoMemoryMain, x, y, 14, 14, color);
	fillRect(videoMemoryMain, x + 2, y + 2, 10, 10, ARGB16(1, 31, 31, 31));
	fillRect(videoMemoryMain, x + 4, y + 4, 6, 6, color);
}

void drawFinders(uint16_t *videoMemoryMain) {
	drawFinder(videoMemoryMain, 2, 2, ARGB16(1, 0, 0, 0));
	drawFinder(videoMemoryMain, 256 - 2 - 14, 2, ARGB16(1, 0, 0, 0));
	drawFinder(videoMemoryMain, 2, 192 - 2 - 14, ARGB16(1, 0, 0, 0));
	drawFinder(videoMemoryMain, 256 - 2 - 14, 192 - 2 - 14, ARGB16(1, 0, 0, 0));
	
	fillRect(videoMemoryMain, 18, 18, 128 - 18, 96 - 18, ARGB16(1, 31, 0, 0));
	fillRect(videoMemoryMain, 128, 18, 128 - 18, 96 - 18, ARGB16(1, 16, 31, 0));
	fillRect(videoMemoryMain, 18, 96, 128 - 18, 96 - 18, ARGB16(1, 0, 31, 31));
	fillRect(videoMemoryMain, 128, 96, 128 - 18, 96 - 18, ARGB16(1, 16, 0, 31));
	printf("drawed finders. push A\n");
	waitKey();
}

int rnd(uint32_t &s) {
	s = s ^ (s << 13); s = s ^ (s >> 17); s = s ^ (s << 5);
	return s;
}

void drawSide(uint16_t *videoMemoryMain) {
	uint32_t s = 1;
	for (int y = 0; y < MARGIN; y++) {
		for (int x = 0; x < QR_WIDTH + MARGIN; x++) {
			int c = rnd(s) & 1 ? 31 : 0;
			fillRect(videoMemoryMain, 1 * x + 2, 2 * y + 2, 1, 2, ARGB16(1, c, c, c));
		}
	}
	for (int y = 0; y < QR_HEIGHT + MARGIN; y++) {
		for (int x = QR_WIDTH + MARGIN; x < QR_WIDTH + 2 * MARGIN; x++) {
			int c = rnd(s) & 1 ? 31 : 0;
			fillRect(videoMemoryMain, 1 * x + 2, 2 * y + 2, 1, 2, ARGB16(1, c, c, c));
		}
	}
	for (int y = QR_HEIGHT + MARGIN; y < QR_HEIGHT + 2 * MARGIN; y++) {
		for (int x = MARGIN; x < QR_WIDTH + 2 * MARGIN; x++) {
			int c = rnd(s) & 1 ? 31 : 0;
			fillRect(videoMemoryMain, 1 * x + 2, 2 * y + 2, 1, 2, ARGB16(1, c, c, c));
		}
	}
	for (int y = MARGIN; y < QR_HEIGHT + 2 * MARGIN; y++) {
		for (int x = 0; x < MARGIN; x++) {
			int c = rnd(s) & 1 ? 31 : 0;
			fillRect(videoMemoryMain, 1 * x + 2, 2 * y + 2, 1, 2, ARGB16(1, c, c, c));
		}
	}
}

void dump(const std::vector<std::pair<int, int>> &ranges)
{
	videoSetMode(MODE_5_2D);
	vramSetBankA(VRAM_A_MAIN_BG);
	int bgMain = bgInit(3, BgType_Bmp16, BgSize_B16_256x256, 0, 0);
	u16 *videoMemoryMain = bgGetGfxPtr(bgMain);
	for (int i = 0; i < 256 * 256; i++)
		videoMemoryMain[i] = ARGB16(1, 31, 31, 31);
	drawFinders(videoMemoryMain);
	std::vector<uint8_t> testdata;
	writeRandomData(testdata, 0xdeadbeef);
	drawSide(videoMemoryMain);
	dumpQR(videoMemoryMain, 0xffffffff, &testdata[0], BLOCK_SIZE);
	printf("drawed test data. push A\n");
	waitKey();
	char name[13] = {};
	strncpy(name, (char *)0x080000A0, 12);
	printf("Target to dump: %s\n", name);
	wait(0);
	int numRanges = ranges.size();
	for (int n = 0; n < numRanges; n ++) {
		int start = ranges[n].first;
		int end = ranges[n].second;
		for (int i = start; i <= end; i ++) {
			printf("Dumping %05d...", i);
			dumpQR(videoMemoryMain, i, ((uint8_t *)GBAROM) + i * BLOCK_SIZE, BLOCK_SIZE);
			printf("done\n");
			scanKeys();
			if (keysDown() & KEY_START) {
				return;
			}
			wait(60 * 0.5);
		}
	}
	printf("Done!\n");
}

template <class Container>
void split(const std::string& str, Container& cont, char delim = ' ')
{
    std::stringstream ss(str);
    std::string token;
    while (std::getline(ss, token, delim)) {
        cont.push_back(token);
    }
}

void parseRanges(const char *buf, std::vector<std::pair<int, int>> &ranges) {
	std::string str(buf);
	std::vector<std::string> rangeStrs;
	split(str, rangeStrs, ',');
	int num = rangeStrs.size();
	ranges.resize(num);
	for (int i = 0; i < num; i ++) {
		std::vector<std::string> vec;
		split(rangeStrs[i], vec, '-');
		if (vec.size() == 2) {
			ranges[i] = std::make_pair(std::stoi(vec[0]), std::stoi(vec[1]));
		} else {
			ranges[i] = std::make_pair(std::stoi(vec[0]), std::stoi(vec[0]));
		}
	}
}

int main(void)
{
	QrCode::initialize(30);
	irqSet(IRQ_VBLANK, Vblank);
	consoleDemoInit();
	Keyboard *kbd = keyboardDemoInit();
	kbd->OnKeyPressed = OnKeyPressed;
	videoSetMode(MODE_FB0);
	vramSetBankA(VRAM_A_LCD);
	sysSetCartOwner(1);

	while (1) {
		char buf[256];
		std::vector<std::pair<int, int>> ranges;
		consoleClear();
		printf("Input range (e.g. 0-127)\n>");
		fgets(buf, 256, stdin);
		parseRanges(buf, ranges);
		dump(ranges);
	}
	return 0;
}