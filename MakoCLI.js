#!/usr/bin/env node
// commandline mako.js frontend

var mako = require("./Mako");
var fs   = require("fs");

// wire up CO to stdin/stdout:
mako.setCharInput (function() {
	var buff = new Buffer(1);
	fs.readSync(process.stdin.fd, buff, 0, 1);
	if (buff[0] === null) { return -1; }
	return buff[0];
});
mako.setCharOutput(function(c) {
	process.stdout.write(String.fromCharCode(c));
});

if (process.argv.length != 3) {
	console.error("usage: MakoCLI <romfile>");
	process.exit(1);
}

var rom = fs.readFileSync(process.argv[2]);
var mem = new Int32Array(rom.length/4);
for(var x = 0; x < rom.length/4; x++) {
	mem[x] = rom.readInt32BE(x*4);
}
mako.setMem(mem);

while(true) {
	if (mem[0] < 0) {
		break;
	}
	if (mem[mem[0]] == 30) {
		console.error("The 'SYNC' opcode cannot be used in headless mode. Halting.");
		break;
	}
	mako.tick();
}
