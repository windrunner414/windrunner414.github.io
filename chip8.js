// import {log} from './log'; // don't import
// declare let window: any;
var log = {
    error: function (text) {
        console.error(text);
    },
    info: function (text) {
        console.info(text);
    },
    warn: function (text) {
        console.warn(text);
    }
};
var chip8 = /** @class */ (function () {
    function chip8(canvas, romUrl, speed) {
        var _this = this;
        this.memory = new Uint8Array(4096);
        this.register = new Uint8Array(16);
        this.gfx = new Uint8Array(64 * 32);
        this.stack = new Uint16Array(16);
        this.key = new Uint8Array(16);
        this.opcode = 0;
        this.I = 0;
        this.pc = 0x200;
        this.delayTimer = 0;
        this.soundTimer = 0;
        this.sp = 0;
        this.playingSound = false;
        var contextClass = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new contextClass();
        this.gain = this.audioContext.createGain();
        this.gain.connect(this.audioContext.destination);
        this.oscillator = null;
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.ctx.scale(this.canvas.clientWidth / 64, this.canvas.clientHeight / 32);
        this.color = ['white', 'black'];
        this.speed = speed;
        this.keyMap = {
            '1': 0x1, '2': 0x2, '3': 0x3, '4': 0xc,
            'q': 0x4, 'w': 0x5, 'e': 0x6, 'r': 0xd,
            'a': 0x7, 's': 0x8, 'd': 0x9, 'f': 0xe,
            'z': 0xa, 'x': 0x0, 'c': 0xb, 'v': 0xf
        };
        var fontSet = new Uint8Array([
            0xF0, 0x90, 0x90, 0x90, 0xF0,
            0x20, 0x60, 0x20, 0x20, 0x70,
            0xF0, 0x10, 0xF0, 0x80, 0xF0,
            0xF0, 0x10, 0xF0, 0x10, 0xF0,
            0x90, 0x90, 0xF0, 0x10, 0x10,
            0xF0, 0x80, 0xF0, 0x10, 0xF0,
            0xF0, 0x80, 0xF0, 0x90, 0xF0,
            0xF0, 0x10, 0x20, 0x40, 0x40,
            0xF0, 0x90, 0xF0, 0x90, 0xF0,
            0xF0, 0x90, 0xF0, 0x10, 0xF0,
            0xF0, 0x90, 0xF0, 0x90, 0x90,
            0xE0, 0x90, 0xE0, 0x90, 0xE0,
            0xF0, 0x80, 0x80, 0x80, 0xF0,
            0xE0, 0x90, 0x90, 0x90, 0xE0,
            0xF0, 0x80, 0xF0, 0x80, 0xF0,
            0xF0, 0x80, 0xF0, 0x80, 0x80 //F
        ]);
        this.copyMemory(fontSet, 0);
        fetch(romUrl).then(function (response) { return response.blob(); })
            .then(function (blob) {
            var reader = new FileReader();
            reader.readAsArrayBuffer(blob);
            reader.onload = function () {
                var rom = new Uint8Array(reader.result);
                if (rom.length > (4096 - 512)) {
                    log.error('Rom too big');
                    return;
                }
                _this.copyMemory(rom, 0x200);
                _this.loop();
            };
        })
            .catch(function (e) { return log.error(e); });
        document.onkeydown = function (e) {
            if (e.key in _this.keyMap) {
                _this.key[_this.keyMap[e.key]] = 1;
            }
        };
        document.onkeyup = function (e) {
            if (e.key in _this.keyMap) {
                _this.key[_this.keyMap[e.key]] = 0;
            }
        };
    }
    chip8.prototype.copyMemory = function (src, start) {
        if (start === void 0) { start = 0; }
        for (var i = 0; i < src.length; ++i) {
            this.memory[i + start] = src[i];
        }
    };
    chip8.prototype.readOPCode = function () {
        return this.memory[this.pc] << 8 | this.memory[this.pc + 1];
    };
    chip8.prototype.execOPCode = function (opcode) {
        switch (opcode & 0xf000) {
            case 0x0000:
                switch (opcode & 0x000f) {
                    case 0x0000:
                        this.clearScreen();
                        this.pc += 2;
                        break;
                    case 0x000e:
                        this.pc = this.stack[--this.sp] + 2;
                        break;
                    default:
                        log.error('Unknown opcode');
                        return false;
                }
                break;
            case 0x1000:
                this.pc = opcode & 0x0fff;
                break;
            case 0x2000:
                if (!this.pushToStack()) {
                    return false;
                }
                this.pc = opcode & 0x0fff;
                break;
            case 0x3000:
                if (this.register[(opcode & 0x0f00) >> 8] === (opcode & 0x00ff)) {
                    this.pc += 4;
                }
                else {
                    this.pc += 2;
                }
                break;
            case 0x4000:
                if (this.register[(opcode & 0x0f00) >> 8] !== (opcode & 0x00ff)) {
                    this.pc += 4;
                }
                else {
                    this.pc += 2;
                }
                break;
            case 0x5000:
                if (this.register[(opcode & 0x0f00) >> 8] === this.register[(opcode & 0x00f0) >> 4]) {
                    this.pc += 4;
                }
                else {
                    this.pc += 2;
                }
                break;
            case 0x6000:
                this.register[(opcode & 0x0f00) >> 8] = opcode & 0x00ff;
                this.pc += 2;
                break;
            case 0x7000:
                this.register[(opcode & 0x0f00) >> 8] += opcode & 0x00ff;
                this.pc += 2;
                break;
            case 0x8000:
                switch (opcode & 0x000f) {
                    case 0x0000:
                        this.register[(opcode & 0x0f00) >> 8] = this.register[(opcode & 0x00f0) >> 4];
                        this.pc += 2;
                        break;
                    case 0x0001:
                        this.register[(opcode & 0x0f00) >> 8] = this.register[(opcode & 0x0f00) >> 8] | this.register[(opcode & 0x00f0) >> 4];
                        this.pc += 2;
                        break;
                    case 0x0002:
                        this.register[(opcode & 0x0f00) >> 8] = this.register[(opcode & 0x0f00) >> 8] & this.register[(opcode & 0x00f0) >> 4];
                        this.pc += 2;
                        break;
                    case 0x0003:
                        this.register[(opcode & 0x0f00) >> 8] = this.register[(opcode & 0x0f00) >> 8] ^ this.register[(opcode & 0x00f0) >> 4];
                        this.pc += 2;
                        break;
                    case 0x0004:
                        if (this.register[(opcode & 0x00f0) >> 4] > (0xff - this.register[(opcode & 0x0f00) >> 8])) {
                            this.register[0xf] = 1;
                        }
                        else {
                            this.register[0xf] = 0;
                        }
                        this.register[(opcode & 0x0f00) >> 8] += this.register[(opcode & 0x00f0) >> 4];
                        this.pc += 2;
                        break;
                    case 0x0005:
                        if (this.register[(opcode & 0x00f0) >> 4] > this.register[(opcode & 0x0f00) >> 8]) {
                            this.register[0xf] = 0;
                        }
                        else {
                            this.register[0xf] = 1;
                        }
                        this.register[(opcode & 0x0f00) >> 8] -= this.register[(opcode & 0x00f0) >> 4];
                        this.pc += 2;
                        break;
                    case 0x0006:
                        this.register[0xf] = this.register[(opcode & 0x0f00) >> 8] & 0x1;
                        this.register[(opcode & 0x0f00) >> 8] >>= 1;
                        this.pc += 2;
                        break;
                    case 0x0007:
                        if (this.register[(opcode & 0x0f00) >> 8] > this.register[(opcode & 0x00f0) >> 4]) {
                            this.register[0xf] = 0;
                        }
                        else {
                            this.register[0xf] = 1;
                        }
                        this.register[(opcode & 0x0f00) >> 8] = this.register[(opcode & 0x00f0) >> 4] - this.register[(opcode & 0x0f00) >> 8];
                        this.pc += 2;
                        break;
                    case 0x000e:
                        this.register[0xf] = this.register[(opcode & 0x0f00) >> 8] >> 7;
                        this.register[(opcode & 0x0f00) >> 8] <<= 1;
                        this.pc += 2;
                        break;
                    default:
                        log.error('Unknown opcode');
                        return false;
                }
                break;
            case 0x9000:
                if (this.register[(opcode & 0x0f00) >> 8] !== this.register[(opcode & 0x00f0) >> 4]) {
                    this.pc += 4;
                }
                else {
                    this.pc += 2;
                }
                break;
            case 0xa000:
                this.I = opcode & 0x0fff;
                this.pc += 2;
                break;
            case 0xb000:
                this.pc = (opcode & 0x0fff) + this.register[0];
                break;
            case 0xc000:
                this.register[(opcode & 0x0f00) >> 8] = (Math.floor(Math.random() * 256)) & (opcode & 0x00ff);
                this.pc += 2;
                break;
            case 0xd000:
                var x = this.register[(opcode & 0x0f00) >> 8];
                var y = this.register[(opcode & 0x00f0) >> 4];
                var n = opcode & 0x000f;
                this.register[0xf] = 0;
                for (var line = 0; line < n; ++line) {
                    var pixel = this.memory[this.I + line];
                    for (var xp = 0; xp < 8; ++xp) {
                        if (pixel & (0x80 >> xp)) {
                            var index = (y + line) * 64 + xp + x;
                            if (this.gfx[index] === 1) {
                                this.register[0xf] = 1;
                                this.gfx[index] = 0;
                            }
                            else {
                                this.gfx[index] = 1;
                            }
                            this.ctx.fillStyle = this.color[this.gfx[index]];
                            this.ctx.fillRect(x + xp, y + line, 1, 1);
                        }
                    }
                }
                this.ctx.fill();
                this.pc += 2;
                break;
            case 0xe000:
                switch (opcode & 0x00ff) {
                    case 0x009e:
                        if (this.key[this.register[(opcode & 0x0f00) >> 8]] === 1) {
                            this.pc += 4;
                        }
                        else {
                            this.pc += 2;
                        }
                        break;
                    case 0x00a1:
                        if (this.key[this.register[(opcode & 0x0f00) >> 8]] === 0) {
                            this.pc += 4;
                        }
                        else {
                            this.pc += 2;
                        }
                        break;
                    default:
                        log.error('Unknown opcode');
                        return false;
                }
                break;
            case 0xf000:
                out: switch (opcode & 0x00ff) {
                    case 0x0007:
                        this.register[(opcode & 0x0f00) >> 8] = this.delayTimer;
                        this.pc += 2;
                        break;
                    case 0x000a:
                        for (var i in this.key) {
                            if (this.key[i] === 1) {
                                this.register[(opcode & 0x0f00) >> 8] = parseInt(i);
                                this.pc += 2;
                                break out;
                            }
                        }
                        break;
                    case 0x0015:
                        this.delayTimer = this.register[(opcode & 0x0f00) >> 8];
                        this.pc += 2;
                        break;
                    case 0x0018:
                        this.soundTimer = this.register[(opcode & 0x0f00) >> 8];
                        this.pc += 2;
                        break;
                    case 0x001e:
                        this.I += this.register[(opcode & 0x0f00) >> 8];
                        this.pc += 2;
                        break;
                    case 0x0029:
                        this.I = this.register[(opcode & 0x0f00) >> 8] * 5;
                        this.pc += 2;
                        break;
                    case 0x0033:
                        this.memory[this.I] = this.register[(opcode & 0x0f00) >> 8] / 100;
                        this.memory[this.I + 1] = (this.register[(opcode & 0x0f00) >> 8] / 10) % 10;
                        this.memory[this.I + 2] = (this.register[(opcode & 0x0f00) >> 8] % 100) % 10;
                        this.pc += 2;
                        break;
                    case 0x0055:
                        for (var i = 0; i <= (opcode & 0x0f00) >> 8; ++i) {
                            this.memory[this.I + i] = this.register[i];
                        }
                        this.pc += 2;
                        break;
                    case 0x0065:
                        for (var i = 0; i <= (opcode & 0x0f00) >> 8; ++i) {
                            this.register[i] = this.memory[this.I + i];
                        }
                        this.pc += 2;
                        break;
                    default:
                        log.error('Unknown opcode');
                        return false;
                }
                break;
            default:
                log.error('Unknown opcode');
                return false;
        }
        return true;
    };
    chip8.prototype.pushToStack = function () {
        if (this.sp < this.stack.length) {
            this.stack[this.sp++] = this.pc;
            return true;
        }
        else {
            log.error('Stack overflow');
            return false;
        }
    };
    chip8.prototype.clearScreen = function () {
        this.gfx.fill(0);
        this.ctx.fillStyle = this.color[0];
        this.ctx.fillRect(0, 0, 64, 32);
    };
    chip8.prototype.playSound = function () {
        if (this.playingSound || this.oscillator) {
            return;
        }
        this.playingSound = true;
        this.oscillator = this.audioContext.createOscillator();
        this.oscillator.frequency.value = 440;
        this.oscillator.type = 'triangle';
        this.oscillator.connect(this.gain);
        this.oscillator.start(0);
    };
    chip8.prototype.stopSound = function () {
        if (this.playingSound && this.oscillator) {
            this.oscillator.stop(0);
            this.oscillator.disconnect(0);
            this.oscillator = null;
        }
    };
    chip8.prototype.cycle = function () {
        if (this.pc + 1 >= this.memory.length) {
            return false;
        }
        this.opcode = this.readOPCode();
        if (!this.execOPCode(this.opcode)) {
            log.error('OPCode ' + this.opcode.toString());
            return false;
        }
        if (this.delayTimer > 0) {
            --this.delayTimer;
        }
        if (this.soundTimer > 0) {
            --this.soundTimer;
            if (this.soundTimer === 0) {
                this.stopSound();
            }
            else {
                this.playSound();
            }
        }
        return true;
    };
    chip8.prototype.loop = function () {
        var _this = this;
        this.loopTimer = setInterval(function () {
            if (!_this.cycle()) {
                clearInterval(_this.loopTimer);
                log.info('finish');
            }
        }, 1000 / (60 * this.speed));
    };
    chip8.prototype.destroy = function () {
        clearInterval(this.loopTimer);
        this.clearScreen();
    };
    return chip8;
}());
//# sourceMappingURL=chip8.js.map