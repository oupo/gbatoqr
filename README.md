# gbatoqr

<img src="https://user-images.githubusercontent.com/143470/72662868-6f18ed80-3a2f-11ea-90d3-c8e3ec3a2ce6.png"> <img src="https://user-images.githubusercontent.com/143470/72662869-7213de00-3a2f-11ea-9d26-1d0abbb933d2.png" width="300">

This repository consists of the following two programs.

* A NDS program for dumping GBA ROMs as 2D codes (nds folder)
* A program that scans the 2D codes (detector folder)

## How to build the NDS program

devkitPro is required.

First, execute `./copy-submodule-files.sh` in the repository root directory.
Second, execute the `make` command in the nds directory.

## How to run the scanning program

In the repository root directory, execute the following command:
```
npm run dev
```

To build, execute the following command:
```
npm run build
```


## Hosting

https://gbatoqr.netlify.com/
