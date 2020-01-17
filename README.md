# gbatoqr

![](https://user-images.githubusercontent.com/143470/72619458-aaa8ae80-3980-11ea-83f2-c030b4c4b078.png)


This repository consists of the following two programs.

* A NDS program for dumping GBA ROMs as 2D codes (ndswide folder)
* A program that scans the 2D codes (detector folder)

## How to build the NDS program

devkitPro is required.

First, execute `./copy-submodule-files.sh` in the repository root directory.
Second, execute the `make` command in the ndswide directory.

## How to run the scanning program

In the repository root directory, execute the following command:
```
npm run dev
```

To build, execute the following command:
```
npm run build
```
