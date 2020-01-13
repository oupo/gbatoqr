
import {BrowserQRCodeReader} from "../zxing-js/src/index.ts";
const MAX_OUTPUT = 50;
const MAX_ROM_BYTES = 32 * 1024 * 1024;
const BLOCK_SIZE = 0x1c0;
const romdata = [];
const codeReader = new BrowserQRCodeReader();
const video = document.getElementById('video');
const output = document.getElementById("output");

const canvas = document.getElementById("canvas");
const context = canvas.getContext("2d");

if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "environment" } }).then(function (stream) {
    codeReader.attachStreamToVideo(stream, video).then(() => {
        let w = video.videoWidth, h = video.videoHeight;
        video.width = w, video.height = h;
        canvas.width = w, canvas.height = h;
        document.getElementById("video-container").style.width = w + "px";
        document.getElementById("video-container").style.height = h + "px";
        context.clearRect(0, 0, w, h);
        context.fillStyle = "rgba(0,0,255,0.5)";
        context.fillRect(0, 0, w, h);
        codeReader.decodeContinuously(video, (res) => {
        if (res) {
            handleResponse(res.text);
            canvas.style.display = "";
        } else {
            canvas.style.display = "none";
        }
        });
    });
    });
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

let maxNum;

function handleResponse(res) {
    let buffer = new ArrayBuffer(res.length);
    let array8 = new Uint8Array(buffer);
    let array32 = new Uint32Array(buffer);
    for (let i = 0; i < res.length; i ++) array8[i] = res.charCodeAt(i);
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

function prepend(node) {
    if (output.childNodes.length >= MAX_OUTPUT - 1) {
    output.removeChild(output.childNodes[output.childNodes.length - 1]);
    }
    if (output.childNodes.length == 0) {
    output.appendChild(node);
    } else {
    output.insertBefore(node, output.childNodes[0]);
    }
}