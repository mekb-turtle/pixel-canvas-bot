(async()=>{
const axios = require("axios");
const Jimp = require("jimp");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
let unknown;
let opt = {
	string: [ "file", "output" ],
	boolean: [ "help", "random", "dither", "ignore", "quiet", "debug" ],
	alias: {
		"help": [ "?" ],
		"file": [ "f" ],
		"width": [ "w" ],
		"height": [ "h" ],
		"dither": [ "d" ],
		"x": [ "x_" ], // this is required otherwise it'll think this is unknown
		"y": [ "y_" ],
		"random": [ "r" ],
		"ignore": [ "i" ],
		"debug": [ "D" ],
		"quiet": [ "q" ],
		"output": [ "o" ],
	},
	unknown: (e) => { unknown = e; },
};
const argv = require("minimist")(process.argv.splice(2), opt);
if (argv.help) {
	console.error("required:");
	console.error("  --file -f       what file to draw");
	console.error("  -x              left-most pixel of the image");
	console.error("  -y              top-most pixel of the image");
	console.error("use -x-5 or -x=-5 for negative numbers, -x -5 won't work");
	console.error("image:");
	console.error("  --width -w      width of image");
	console.error("  --height -h     height of image");
	console.error("if both width and height are left out, image size will be left as is");
	console.error("  --random -r     draw each pixel in a random order");
	console.error("  --dither -d     dither the image");
	console.error("  --ignore -i     don't draw white pixels, act as if all pixels are white by default");
	console.error("output:");
	console.error("  --debug -D      don't actually draw anything, just say what would be drawn");
	console.error("  --quiet -q      don't output anything, overrides --debug");
	console.error("  --output -o     output image of what would be drawn to a file");
	console.error("  --help -?       help");
	console.error("");
	return;
}
if (unknown == null && argv._.length) unknown = argv._[0];
if (unknown) {
	console.error("unexpected", unknown);
	return;
}
const randNum = (max, min) => {
	return min ? (Math.floor(Math.random() * (+max++ - +min)) + +min) : (Math.floor(Math.random() * Math.floor(max++)))
}
const isStr = (e, a) => {
	if (typeof e != "string" || e == null || e == "") {
		console.error(`missing ${a}`);
		return true;
	}
}
const isNum = (e, a, p) => {
	if (typeof e != "number" || e != Math.floor(e) && e >= 1e9 && e <= (p ? 0 : -1e9)) {
		console.error(e == null ? `missing ${a}` : `invalid ${a}`);
		return true;
	}
}
if (argv.output != null) {
	if (isStr(argv.output, "--output")) return;
}
if (!argv.debug || !argv.quiet) {
	if (argv.x == null && argv.y == null && argv.debug)
		argv.x = argv.y = 0;
	if (isNum(argv.x, "-x")) return;
	if (isNum(argv.y, "-y")) return;
	if (argv.width != null || argv.height != null) {
		if (isNum(argv.width,  "--width", true))  return;
		if (isNum(argv.height, "--height", true)) return;
	}
} else {
	argv.x = argv.y = argv.width = argv.height = null;
}
if (isStr(argv.file, "--file")) return;
if (argv.debug && argv.quiet && !argv.output) return;
const paletteFile = path.resolve(__dirname, "./palette.png"); // read palette image
const palette = await Jimp.read(paletteFile);
let colors_ = [];
palette.scan(0, 0, palette.bitmap.width, palette.bitmap.height, (x, y, i) => {
	if (palette.bitmap.data[i + 3] > 127) // make sure the color isn't transparent
		colors_.push([palette.bitmap.data[i + 0], palette.bitmap.data[i + 1], palette.bitmap.data[i + 2]]); // no need for alpha
});
colorNames = [
	"white", "light gray", "dark gray", "black", "pink", "red", "orange", "brown",
	"yellow", "light green", "green", "aqua", "cyan", "blue", "magenta", "purple"
];
const colors = colors_; delete colors_;
require("dotenv").config();
const ax = axios.create({
	baseURL: "https://pixelcanvas.io/api/",
	timeout: 5000,
	headers: `User-Agent: Mozilla/5.0 (Windows NT 10.0; rv:91.0) Gecko/20100101 Firefox/91.0
X-Firebase-AppCheck: ${process.env.FIREBASE}
Origin: https://pixelcanvas.io
Referer: https://pixelcanvas.io
DNT: 1
Sec-Fetch-Dest: empty
Sec-Fetch-Mode: cors
Sec-Fetch-Site: same-origin
Cache-Control: no-cache
TE: trailers`
		.split("\n")
		.map(e => [ e.split(": ")[0], e.split(": ").splice(1) ])
		.reduce((a,b) => { a[b[0]] = b[1]; return a }, {}),
});
const doSleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const sleep = async (ms, a, b) => {
	const sec_ = Math.floor(ms / 1000);
	let sec = sec_;
	ms = ms % 1000;
	for (; sec > 0; --sec) {
		let str = ""; // human readable time
		if (sec >= 60*60*24*7) str += Math.floor(sec/(60*60*24*7)) + "w ";
		if (sec >= 60*60*24  ) str += Math.floor(sec/(60*60*24)%7) + "d ";
		if (sec >= 60*60     ) str += Math.floor(sec/(60*60)%24  ) + "h ";
		if (sec >= 60        ) str += Math.floor(sec/(60)%60     ) + "m ";
		if (sec >= 1         ) str += Math.floor(sec%60          ) + "s ";
		let text = `${a}/${b} ${Math.floor(a/b * 100)}%`;
		if (!argv.quiet) process.stderr.write(text + " " + str);
		await doSleep(1000);
		if (!argv.quiet) process.stderr.write("\x1b[2K\x1b[0G");
	}
	await doSleep(ms);
};
const drawPixel = async ({ x, y, color }) => {
	if (!argv.quiet) console.log("drawing pixel at", x, y, "with color", (color + 1).toString().padStart(2, 0), colorNames[color]);
	if (argv.debug) return { };
	let res = await ax({
		method: "post",
		url: "pixel",
		data: {
			x, y, color,
			fingerprint: process.env.FINGERPRINT,
			token: null,
			wasabi: x + y + 2342
		}
	});
	if (!res.data.result.data.success) throw res.data.result;
	return res.data.result.data;
};
const dist3d = (x1, y1, z1, x2, y2, z2) => Math.sqrt(((x1-x2)**2) + ((y1-y2)**2) + ((z1-z2)**2));
const nearest = (r, g, b) => { // get nearest color
	let j;
	let dist = Infinity; // start at infinity, too lazy for null check
	for (let i = 0; i < colors.length; ++i) {
		let newDist = dist3d(r, g, b, ...colors[i]);
		if (newDist < dist) {
			dist = newDist;
			j = i;
		}
	}
	return j;
};
let image;
if ((argv.width && argv.height) || argv.dither) {
	const buf = await (await Jimp.read(argv.file)).getBufferAsync("image/png");
	// get Jimp to convert to PNG. if a user puts "png:-" for the file name,
	// magick will think we're putting the file in through stdin, and it'll hang.
	// this is a hacky work around
	var proc = spawn("magick", [
		"convert",
		...(argv.width && argv.height ? [
			// set flags if resizing, Jimp's resize is weird
			"-size", `${argv.width}x${argv.height}`
		] : []),
		...(argv.dither ? [
			// set flags if dithering
			"-dither", "FloydSteinberg", "-remap", paletteFile,
		] : []),
		"--", "png:-", "png:-" // input = stdin png, output = stdout png
	]);
	let buffers = [];
	proc.stdout.on("data", b => buffers.push(b)); // add the buffer to array
	proc.stdin.write(buf); // write the PNG image data
	delete buf; // don't need anymore
	proc.stdin.end(); // we're not writing anymore, close stdin
	await new Promise((resolve, reject) => {
		proc.once("error", reject);
		proc.once("exit", (c) => {
			if (c > 0) reject("magick exited with code", c);
			resolve();
		});
	});
	// concat the buffers into one and get Jimp
	// the output image won't have this if we use nearest in the scan function instead
	image = await Jimp.read(Buffer.concat(buffers));
	delete buffers; // don't need anymore
} else {
	image = await Jimp.read(argv.file);
}
image.scan(0, 0, image.bitmap.width, image.bitmap.height, (x, y, i) => {
	let [ r, g, b, a ] = image.bitmap.data.slice(i, i+4); // destructuring assignment OP
	if (a > 127) {
		[ r, g, b ] = colors[nearest(r, g, b)]; // get nearest color
		a = 255;
	} else {
		r = g = b = a = 0;
	}
	image.bitmap.data[i+0] = r;
	image.bitmap.data[i+1] = g;
	image.bitmap.data[i+2] = b;
	image.bitmap.data[i+3] = a;
});
if (argv.output) {
	await fs.promises.writeFile(argv.output, await image.getBufferAsync("image/png"));
}
if (argv.debug && argv.quiet) return;
let pixels = [];
image.scan(0, 0, image.bitmap.width, image.bitmap.height, (x, y, i) => {
	let [ r, g, b, a ] = image.bitmap.data.slice(i, i+4);
	if (a > 127) {
		let X = x + argv.x;
		let Y = y + argv.y;
		// don't need to use nearest twice
		let color = colors.map(e => e.join()).indexOf([r, g, b].join());
		// indexOf doesn't work with an array of arrays, but array of strings work
		if (color == 0 && argv.ignore) return;
		pixels.push({ x: X, y: Y, color });
	}
});
delete image; // don't need anymore
if (argv.random) pixels.sort(() => Math.random() - 0.5); // shuffle array
for (let i = 0; i < pixels.length; ++i) {
	while (true) {
		try {
			let res = await drawPixel(pixels[i]);
			if (argv.debug) break; // don't sleep with --debug
			const waitSeconds = res.waitSeconds + randNum(15, 0.5)
			await sleep(Math.floor(waitSeconds * 1e3), i+1, pixels.length);
			break;
		} catch (err) {
			console.error(err);
			if (argv.debug) break;
			await sleep(10e3, i+1, pixels.length); // wait 10 seconds
		}
	}
}
})();
