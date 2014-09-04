////////////////////////////////////
//
//   Constants:
//
////////////////////////////////////

"use strict";

var OP_CONST  = 0;
var OP_CALL   = 1;
var OP_JUMP   = 2;
var OP_JUMPZ  = 3;
var OP_JUMPIF = 4;

var OP_LOAD   = 10;
var OP_STOR   = 11;
var OP_RETURN = 12;
var OP_DROP   = 13;
var OP_SWAP   = 14;
var OP_DUP    = 15;
var OP_OVER   = 16;
var OP_STR    = 17;
var OP_RTS    = 18;

var OP_ADD    = 19;
var OP_SUB    = 20;
var OP_MUL    = 21;
var OP_DIV    = 22;
var OP_MOD    = 23;
var OP_AND    = 24;
var OP_OR     = 25;
var OP_XOR    = 26;
var OP_NOT    = 27;
var OP_SGT    = 28;
var OP_SLT    = 29;
var OP_SYNC   = 30;
var OP_NEXT   = 31;

var PC =  0; // program counter
var DP =  1; // data stack pointer
var RP =  2; // return stack pointer

var GP =  3; // grid pointer
var GT =  4; // grid tile pointer
var SP =  5; // sprite pointer
var ST =  6; // sprite tile pointer
var SX =  7; // scroll X
var SY =  8; // scroll Y
var GS =  9; // grid horizontal skip
var CL = 10; // clear color
var RN = 11; // random number
var KY = 12; // key input

var CO = 13; // character-out (debug)
var AU = 14; // audio-out (8khz, 8-bit)
var KB = 15; // keyboard-in

var XO = 16; // bidirectional external IO
var XA = 17; // external argument 
var XS = 18; // external status

var RESERVED_HEADER = 19;

var H_MIRROR_MASK = 0x10000; // sprite is mirrored horizontally?
var V_MIRROR_MASK = 0x20000; // sprite is mirrored vertically?
var GRID_Z_MASK = 0x40000000; // grid tile is drawn above sprites?

var KEY_UP = 0x01;
var KEY_RT = 0x02;
var KEY_DN = 0x04;
var KEY_LF = 0x08;
var KEY_A  = 0x10;
var KEY_B  = 0x20;
var KEY_MASK = KEY_UP | KEY_RT | KEY_DN | KEY_LF | KEY_A | KEY_B;

var X_CLOSE      = 0;
var X_OPEN_READ  = 1;
var X_OPEN_WRITE = 2;

////////////////////////////////////
//
//   Mako Interpreter:
//
////////////////////////////////////

var m = []; // main memory
var p; // graphics buffer
var keys = 0; // keys known by VM
var keyIn = 0; // keys known by IO subsystem
var keyQueue = [];
var audio;
var sampleMult = 1;
var soundBuffer;
var soundSource;
var soundPointer = 0;

function push(v)   { m[m[DP]++] = v; }
function rpush(v)  { m[m[RP]++] = v; }
function pop()     { return m[--m[DP]]; }
function rpop()    { return m[--m[RP]]; }
function mod(a, b) { a %= b; return a < 0 ? a+b : a; }

function tick() {
	var o = m[m[PC]++];
	var a, b;

	switch(o) {
		case OP_CONST  :  push(m[m[PC]++]);                           break;
		case OP_CALL   : rpush(m[PC]+1); m[PC] = m[m[PC]];            break;
		case OP_JUMP   :                 m[PC] = m[m[PC]];            break;
		case OP_JUMPZ  : m[PC] = pop()==0 ? m[m[PC]] : m[PC]+1;       break;
		case OP_JUMPIF : m[PC] = pop()!=0 ? m[m[PC]] : m[PC]+1;       break;
		case OP_LOAD   : push(load(pop()));                           break;
		case OP_STOR   : stor(pop(),pop());                           break;
		case OP_RETURN : m[PC] = rpop();                              break;
		case OP_DROP   : pop();                                       break;
		case OP_SWAP   : a = pop(); b = pop(); push(a); push(b);      break;
		case OP_DUP    : push(m[m[DP]-1]);                            break;
		case OP_OVER   : push(m[m[DP]-2]);                            break;
		case OP_STR    : rpush(pop());                                break;
		case OP_RTS    : push(rpop());                                break;
		case OP_ADD    : a = pop(); b = pop(); push(b+a);             break;
		case OP_SUB    : a = pop(); b = pop(); push(b-a);             break;
		case OP_MUL    : a = pop(); b = pop(); push(b*a);             break;
		case OP_DIV    : a = pop(); b = pop(); push(Math.floor(b/a)); break;
		case OP_MOD    : a = pop(); b = pop(); push(mod(b,a));        break;
		case OP_AND    : a = pop(); b = pop(); push(b&a);             break;
		case OP_OR     : a = pop(); b = pop(); push(b|a);             break;
		case OP_XOR    : a = pop(); b = pop(); push(b^a);             break;
		case OP_NOT    : push(~pop());                                break;
		case OP_SGT    : a = pop(); b = pop(); push(b>a ? -1:0);      break;
		case OP_SLT    : a = pop(); b = pop(); push(b<a ? -1:0);      break;
		case OP_NEXT   : m[PC] = --m[m[RP]-1]<0?m[PC]+1:m[m[PC]];     break;
	}
}

var charInput  = function() { return -1; }
var charOutput = function(c) { }

function load(addr) {
	if (addr == RN) {
		return (Math.floor(Math.random()*65536)<<16) | Math.floor(Math.random()*65536);
	}
	if (addr == KY) {
		return keys;
	}
	if (addr == KB) {
		if (keyQueue.length > 0) { return keyQueue.shift(); }
		return -1;
	}
	if (addr == CO) {
		return charInput();
	}
	if (addr == XO) {
		return -1;
	}
	if (addr == XS) {
		return 0; // no filesystem support
	}
	return m[addr];
}

function stor(addr, value) {
	if (addr == CO) {
		charOutput(value);
		return;
	}
	if (addr == AU) {
		if (!soundBuffer) { return; }
		var buff = soundBuffer.getChannelData(0);
		for(var z = 0; z < sampleMult; z++) {
			buff[soundPointer] = ((value & 0xFF) / 256);
			if (soundPointer < soundBuffer.length - 1) { soundPointer++; }
		}
		return;
	}
	if (addr == XO) {
		return;
	}
	if (addr == XS) {
		return;
	}
	m[addr] = value;
}

function drawSubPixel(x, y, c) {
	var index = (x + y * 640) * 4;
	p.data[index + 0] = (c >> 16) & 0xFF; // r
	p.data[index + 1] = (c >>  8) & 0xFF; // g
	p.data[index + 2] = (c >>  0) & 0xFF; // b
	p.data[index + 3] = 0xFF;             // a
}

function drawPixel(x, y, c) {
	if (((c >>> 24) & 0xFF) != 0xFF) { return; }
	//if ((c & 0xFF000000) != 0xFF000000)         { return; }
	if (x < 0 || x >= 320 || y < 0 || y >= 240) { return; }
	drawSubPixel(x*2,   y*2,   c);
	drawSubPixel(x*2+1, y*2,   c);
	drawSubPixel(x*2,   y*2+1, c);
	drawSubPixel(x*2+1, y*2+1, c);
}

function drawTile(tile, px, py) {
	tile &= ~GRID_Z_MASK;
	if (tile < 0) { return; }
	var i = m[GT] + (tile * 8 * 8);
	for(var y = 0; y < 8; y++) {
		for(var x = 0; x < 8; x++) {
			drawPixel(x+px, y+py, m[i++]);
		}
	}
}

function drawSprite(tile, status, px, py) {
	if (status % 2 == 0) { return; }
	var w = (((status & 0x0F00) >>  8) + 1) << 3;
	var h = (((status & 0xF000) >> 12) + 1) << 3;
	var xd = 1; var x0 = 0; var x1 = w;
	var yd = 1; var y0 = 0; var y1 = h;
	if ((status & H_MIRROR_MASK) != 0) { xd = -1; x0 = w - 1; x1 = -1; }
	if ((status & V_MIRROR_MASK) != 0) { yd = -1; y0 = h - 1; y1 = -1; }
	var i = m[ST] + (tile * w * h);
	for(var y = y0; y != y1; y += yd) {
		for(var x = x0; x != x1; x += xd) {
			drawPixel(x+px, y+py, m[i++]);
		}
	}
}

function drawGrid(hiz, scrollx, scrolly) {
	var i = m[GP];
	for(var y = 0; y < 31; y++) {
		for(var x = 0; x < 41; x++) {
			if (!hiz && (m[i] & GRID_Z_MASK) != 0) { i++; continue; }
			if ( hiz && (m[i] & GRID_Z_MASK) == 0) { i++; continue; }
			drawTile(m[i++], x*8 - scrollx, y*8 - scrolly);
		}
		i += m[GS];
	}
}

function sync() {
	var scrollx = m[SX];
	var scrolly = m[SY];
	for(var a = 0; a < 320; a++) {
		for(var b = 0; b < 240; b++) {
			drawPixel(a, b, m[CL]);
		}
	}
	drawGrid(false, scrollx, scrolly);
	for(var sprite = 0; sprite < 1024; sprite += 4) {
		var status = m[m[SP] + sprite    ];
		var tile   = m[m[SP] + sprite + 1];
		var px     = m[m[SP] + sprite + 2];
		var py     = m[m[SP] + sprite + 3];
		drawSprite(tile, status, px - scrollx, py - scrolly);
	}
	drawGrid(true, scrollx, scrolly);
}

////////////////////////////////////
//
//   IO glue:
//
////////////////////////////////////

var keyMap = {
	37 : KEY_LF, // left arrow
	38 : KEY_UP, // up arrow
	39 : KEY_RT, // right arrow
	40 : KEY_DN, // down arrow
	90 : KEY_A,  // z
	88 : KEY_B,  // x
	32 : KEY_A   // space
};

function keyDown(event) {
	if (event.keyCode in keyMap) {
		keyIn |= keyMap[event.keyCode];
	}
	if (event.keyCode == 8) {
		// backspace scancode -> ascii
		keyQueue.push(8);
	}
}

function keyUp(event) {
	if (event.keyCode in keyMap) {
		keyIn &= ~keyMap[event.keyCode];
	}
}

function keyPress(event) {
	var code = event.charCode;
	if (code == 13) {
		// normalize return characters:
		code = 10;
	}
	else if (code == 8) {
		// Safari will generate a charCode for backspace,
		// but this doesn't work reliably on other browsers.
		// I instead use the keyCode sent in keyDown().
		return;
	}
	else if (code == 0) {
		// 'special' keys may produce a keyPress event
		// with a garbage charCode. Ignore these.
		return;
	}
	keyQueue.push(code & 0xFF);
}

var intervalHandle;

function shutdown() {
	if (soundSource) {
		soundSource.stop(0);
	}
	if (intervalHandle) {
		window.clearInterval(intervalHandle);
		intervalHandle = undefined;
	}
	return;
}

function render() {
	if (m[PC] < 0) {
		shutdown();
		return;
	}
	while(m[m[PC]] != OP_SYNC) {
		if (m[PC] < 0) {
			shutdown();
			return;
		}
		tick();
	}
	sync();
	m[PC]++;
	soundPointer = 0;
	keys = keyIn;

	var c = document.getElementById("target");
	var g = c.getContext("2d");
	g.fillStyle = "#FFFFFF";
	g.fillRect(0, 0, 640, 480);
	g.putImageData(p, 0, 0);
}

function setup(buffer) {
	shutdown();
	document.getElementById("logo").style.display = "none";

	keyQueue = [];
	window.addEventListener("keydown" , keyDown , false);
	window.addEventListener("keyup"   , keyUp   , false);
	window.addEventListener("keypress", keyPress, false);

	var canvas = document.getElementById("target");
	var g = canvas.getContext("2d");
	p = g.createImageData(640, 480);

	if (!audio) {
		if (typeof webkitAudioContext !== 'undefined') {
			audio = new webkitAudioContext();
		}
		else if (typeof AudioContext !== 'undefined') {
			audio = new AudioContext();
		}
	}
	if (audio) {
		sampleMult = Math.floor(audio.sampleRate / 8000);
		soundBuffer = audio.createBuffer(1, 670, audio.sampleRate);
		soundSource = audio.createBufferSource();
		soundSource.buffer = soundBuffer;
		soundSource.connect(audio.destination);
		soundSource.loop = true;
		soundSource.start(0);
	}

	var size = buffer.byteLength
	var v = new DataView(buffer);
	m = new Int32Array(size/4);
	for(var x = 0; x < size/4; x++) {
		m[x] = v.getInt32(x*4, false);
	}

	intervalHandle = window.setInterval(render, Math.floor(1000/60));
}

function requestRom(name) {
	var request = new XMLHttpRequest();
	request.open("GET", name, true);
	request.responseType = "arraybuffer";
	request.onload = function(e) { setup(request.response); }
	request.send();
}

function selectRom() {
	// remove focus from the listbox so that key events are not fed to it:
	if (document.activeElement != document.body) { document.activeElement.blur(); }
	var name = document.getElementById("romlist").value;
	if (name) { requestRom("roms/" + name); }
}

function runUrl() {
	var romId = location.search.match(/rom=(\w+)/);
	if (romId) { requestRom("roms/" + romId[1] + ".rom"); }
}

// nodejs exports:
this.setCharInput  = function(fn)     { charInput = fn; }
this.setCharOutput = function(fn)     { charOutput = fn; }
this.setMem        = function(buffer) { m = buffer; }
this.tick          = tick;
